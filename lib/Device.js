'use strict'

const EventEmitter = require('events').EventEmitter
const inherits = require('util').inherits
const dns = require('dns')
const net = require('net')
const child_process = require('child_process')

const ping = require('net-ping')
const wake_on_lan = require('wake_on_lan')
const ssh2 = require('ssh2')
const once = require('once')
const getStream = require('get-stream')
// const Telnet = require('telnet-client')

const uptime = require('./uptime')
const meminfo = require('./meminfo')
const HOSTNAME = require('os').hostname()

function Device (name, attrs) {
  attrs = attrs || {}

  EventEmitter.call(this)
  this.name = name

  this.platform = attrs.platform
  this.description = attrs.description || ''
  this.MAC = attrs.MAC || ''
  this.hostname = attrs.hostname || name
  this.address = attrs.address || net.isIP(name) && name
  this.username = attrs.username || process.env.SUDO_USER || process.env.USER
  this.password = attrs.password
  this.interval = attrs.interval
  this.timeout = attrs.timeout

  const SSH = attrs.SSH || {}
  this.SSH = {
    port: SSH.port || 22,
    username: SSH.username || this.username,
    password: SSH.password || this.password,
    passphrase: SSH.passphrase,
    agent: SSH.agent || process.env.SSH_AUTH_SOCK,
    agentForward: typeof SSH.agentForward === 'boolean' ? SSH.agentForward : false
  }

  const telnet = attrs.telnet || {}
  this.telnet = {
    port: telnet.port || 23,
    username: telnet.username || this.username,
    password: telnet.password || this.password,
    loginPrompt: telnet.loginPrompt,
    shellPrompt: telnet.shellPrompt,
    passwordPrompt: telnet.passwordPrompt
  }

  this.pingconf = attrs.ping ? attrs.ping : (attrs.SSH !== false ? this.SSH.port : null)
}
inherits(Device, EventEmitter)

Device.prototype.resolve = function (fn) {
  if (this.address) return fn(null, this.address)
  dns.resolve(this.hostname, (err, addresses) => {
    if (err) return fn(new Error('cannot resolve "' + this.hostname + '"'))
    fn(null, addresses[0])
  })
}

Device.prototype.ping = function (fn) {
  if (typeof this.pingconf === 'number') {
    this.pingTCPPort(this.pingconf, fn)
  } else {
    this.pingHost(fn)
  }
}

Device.prototype.pingHost = function (fn) {
  this.resolve((err, address) => {
    if (err) return fn(err)
    ping.createSession().pingHost(address, fn)
  })
}

Device.prototype.pingTCPPort = function (port, fn) {
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
    if (!err) fn(null, true)
    else if (err instanceof ping.RequestTimedOutError) fn(null, false)
    else fn(err)
  })
}

Device.prototype.isDown = function (fn) {
  this.isUp(function (err, up) {
    if (err) return fn(err)
    fn(null, !up)
  })
}

Device.prototype.wake = function (fn) {
  wake_on_lan.wake(this.MAC, this.address, fn)
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

Device.prototype.uptime = function (fn) {
  if (this.platform !== 'linux') return fn(new Error('uptime not supported for platform ' + this.platform))
  this.exec('cat /proc/uptime', (err, res) => {
    if (err) return fn(err)
    fn(null, uptime.round(uptime.parse(+res.split(' ')[0])))
  })
}

Device.prototype.meminfo = function (fn) {
  if (this.platform !== 'linux') return fn(new Error('uptime not supported for platform ' + this.platform))
  this.exec('cat /proc/meminfo', (err, res) => {
    if (err) return fn(err)
    fn(null, meminfo.parse(res))
  })
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

// Device.prototype.execTelnet = function (cmd, fn) {
//   fn = once(fn)
//   const conn = new Telnet()
//   conn.once('ready', prompt => {
//     conn.exec(cmd, (err, res) => {
//       if (err) return fn(err)
//       console.log(res)
//       conn.end()
//     })
//   })
//   conn.once('error', err => {
//     console.log('error')
//     fn(err)
//   })
//   conn.on('timeout', () => {
//     console.error('socket timeout!')
//     conn.end()
//   })
//   conn.on('close', () => {
//     console.log('connection closed')
//   })
//
//   this.resolve((err, address) => {
//     if (err) return fn(err)
//     conn.connect({
//       host: address,
//       port: this.telnet.port,
//       shellPrompt: this.telnet.shellPrompt,
//       loginPrompt: this.telnet.loginPrompt,
//       passwordPrompt: this.telnet.passwordPrompt,
//       username: this.telnet.username,
//       password: this.telnet.password
//     })
//     // conn.telnetSocket.on('data', data => {
//     //   console.log('data', "ooo" + data.toString() + 'ooo')
//     // })
//   })
// }

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
      port: this.SSH.port,
      username: this.SSH.username,
      passphrase: this.SSH.passphrase,
      agent: this.SSH.agent,
      agentForward: this.SSH.agentForward,
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
