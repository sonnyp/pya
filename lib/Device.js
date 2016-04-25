'use strict'

const EventEmitter = require('events').EventEmitter
const inherits = require('util').inherits
const dns = require('dns')
const net = require('net')
const child_process = require('child_process')

const wake_on_lan = require('wake_on_lan')
const ssh2 = require('ssh2')
const once = require('once')
const getStream = require('get-stream')
const async = require('async')

const HOSTNAME = require('os').hostname()

function Device (name, attrs) {
  attrs = attrs || {}

  EventEmitter.call(this)
  this.name = name

  this.setAttrs(attrs)
}
inherits(Device, EventEmitter)

Device.prototype.setAttrs = function (attrs) {
  this.description = attrs.description || ''
  this.mac = attrs.mac || ''
  this.hostname = attrs.hostname || this.name
  this.address = attrs.address || net.isIP(this.name) && this.name
  this.username = attrs.username || process.env.SUDO_USER || process.env.USER
  this.interval = attrs.interval
  this.timeout = attrs.timeout
  const ssh = attrs.shh || {}
  this.ssh = {
    port: ssh.port || 22,
    username: ssh.username || this.username,
    agent: ssh.agent || process.env.SSH_AUTH_SOCK,
    agentForward: ssh.agentForward === true
  }
  this.pingport = attrs.ping || this.ssh.port
}

Device.prototype.resolve = function (fn) {
  if (this.address) return fn(null, this.address)
  dns.resolve(this.hostname, (err, addresses) => {
    if (err) return fn(new Error('cannot resolve "' + this.hostname + '"'))
    fn(null, addresses[0])
  })
}

Device.prototype.ping = function (fn) {
  const port = this.pingport
  this.resolve((err, address) => {
    if (err) return fn(err)
    fn = once(fn)
    const s = new net.Socket()
    s.setTimeout(this.timeout, () => {
      fn(new Error('timeout ' + address + ' ' + port))
      s.end()
    })
    s.connect(port, address)
    s.once('error', (err) => {
      fn(err)
      s.end()
    })
    s.once('connect', () => {
      fn()
      s.end()
    })
  })
}

Device.prototype.isUp = function (fn) {
  this.ping((err) => {
    if (err) fn(err)
    else fn(null, true)
  })
}

Device.prototype.isDown = function (fn) {
  this.isUp(function (err, up) {
    if (err) fn(err)
    else fn(null, !up)
  })
}

Device.prototype.wake = function (fn) {
  const mac = Array.isArray(this.mac) ? this.mac : [this.mac]
  async.each(mac, (mac, callback) => {
    wake_on_lan.wake(mac, this.address, callback)
  }, fn)
}

Device.prototype.waitup = function (fn) {
  const ping = () => {
    this.ping((err) => {
      if (!err) return fn()
      setTimeout(ping, this.interval)
    })
  }

  ping()
}

Device.prototype.waitdown = function (fn) {
  const ping = () => {
    this.ping((err) => {
      if (err) return fn()
      setTimeout(ping, this.interval)
    })
  }

  ping()
}

Device.prototype.sleep = function (fn) {
  this.interactive('sudo systemctl suspend', fn)
}

Device.prototype.sleep = function (fn) {
  this.interactive('sudo systemctl suspend', fn)
}

Device.prototype.reboot = function (fn) {
  this.interactive('sudo systemctl reboot', fn)
}

Device.prototype.poweroff = function (fn) {
  this.interactive('sudo systemctl poweroff', fn)
}

Device.prototype.isLocal = function (fn) {
  return this.hostname === HOSTNAME
}

Device.prototype.exec = function (cmd, fn) {
  if (this.isLocal()) this.localExec(cmd, fn)
  else this.remoteExec(cmd, fn)
}

Device.prototype.interactive = function (cmd, fn) {
  if (this.isLocal()) this.localInteractive(cmd, fn)
  else this.remoteInteractive(cmd, fn)
}

Device.prototype.localExec = function (cmd, fn) {
  child_process.exec(cmd, (err, stdout, stderr) => {
    if (err) return fn(err)
    if (stderr) return fn(new Error(stderr))
    fn(null, stdout)
  })
}

Device.prototype.localInteractive = function (cmd, fn) {
  const args = cmd.split(' ')
  const command = args.shift()
  child_process.spawn(command, args, {stdio: 'inherit'})
}

Device.prototype.remoteInteractive = function (cmd, fn) {
  this.SSHInteractive(cmd, fn)
}

Device.prototype.remoteExec = function (command, fn) {
  this.SSHExec(command, fn)
}

Device.prototype.SSHConnection = function (fn) {
  fn = once(fn)
  const conn = new ssh2.Client()
  conn.once('error', (err) => {
    fn(err)
  })
  conn.once('ready', () => {
    fn(null, conn)
  })
  this.resolve((err, address) => {
    if (err) return fn(err)
    conn.connect({
      host: address,
      port: this.ssh.port,
      username: this.ssh.username,
      agent: this.ssh.agent,
      agentForward: this.ssh.agentForward,
      tryKeyboard: true
    })
    conn._sock.setTimeout(this.timeout, () => {
      fn(new Error('timeout ' + address + ' ' + this.SSH.port))
    })
  })
}

Device.prototype.SSHExec = function (command, fn) {
  this.SSHConnection((err, conn) => {
    if (err) return fn(err)

    const done = once((err, res) => {
      conn.end()
      fn(err, res)
    })

    conn.exec(command, {pty: true}, (err, stream) => {
      if (err) return done(err)
      Promise.all([getStream(stream.stderr), getStream(stream)]).then((values) => {
        const stderr = values[0]
        const stdout = values[1]
        if (stderr) return done(new Error(stderr))
        done(null, stdout)
      })
    })
  })
}

Device.prototype.SSHInteractive = function (command, fn) {
  this.SSHConnection((err, conn) => {
    if (err) return fn(err)

    const done = once((err, res) => {
      conn.end()
      fn(err, res)
    })

    conn.exec(command, {pty: true}, (err, stream) => {
      if (err) return done(err)

      let buffer = ''

      process.stdin.on('data', (data) => {
        if (buffer === '[sudo] password for ' + this.username + ': ') {
          stream.write(data) // FIXME hide chars
        } else {
          stream.write(data)
        }
      })

      const dataHandler = (data) => {
        buffer += data.toString()
        if (buffer === '[sudo] password for ' + this.username + ': ') {
          if (this.password) {
            stream.write(this.password + '\n')
            buffer = ''
          } else {
            process.stdout.write(data)
          }
        } else {
          process.stdout.write(data)
        }
      }
      stream.on('data', dataHandler)

      Promise.all([getStream(stream.stderr), getStream(stream)]).then((values) => {
        const stderr = values[0]
        const stdout = values[1]
        if (stderr) return done(new Error(stderr))
        done(null, stdout)
      })
    })
  })
}

module.exports = Device
