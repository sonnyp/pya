pya
===

[![build status](https://img.shields.io/travis/sonnyp/pya/master.svg?style=flat-square)](https://travis-ci.org/sonnyp/pya/branches)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](http://standardjs.com/)

CLI application to manage and monitor devices

![screenshot of "pya list"](https://raw.githubusercontent.com/sonnyp/pya/master/screenshot.png)

`pya` only uses common tools and protocols which means there is nothing to install and/or configure on the devices, in most cases a SSH access is enough.

## Features

* Wake-on-LAN
* reboot/poweroff/suspend over SSH via systemctl
* uptime
* memory usage
* interactive sudo over SSH
* ...

## Install

`npm install -g pya`

## Usage

```
➜  ~  pya help

  CLI application to manage and monitor devices

  Usage
    $ pya <action> <device>

  Options
    -h, --help print this help
    -v, --version print version

  Examples
    $ pya help # print this help
    $ pya list # list devices
    $ pya sleep <device> # put device to sleep
    $ pya wake <device> # wake device up
    $ pya ping <device> # ping device
    $ pya poweroff <device> # shutdown the device
    $ pya reboot <device> # reboot the device
    $ pya uptime <device> # get device uptime
    $ pya exec <device> exec # exec command on device
    $ pya pingport <device> <port> # ping TCP port on device
    $ pya waitup <device> # wait for the device to be available
    $ pya waitdown <device> # wait for device to be unavailable
    $ pya show <device> # show listing for device
    $ pya version # print pya version
```

## Test

`npm test`
