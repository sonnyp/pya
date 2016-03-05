'use strict'

const units = [
  ['year', 31536000],
  ['month', 2628000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1]
]

function toSeconds (uptime) {
  let seconds = 0
  uptime.forEach((item, idx) => {
    seconds += item * units[idx][1]
  })
  return seconds
}

function parse (seconds, flags) {
  flags = flags || {}

  return units.map((item) => {
    const name = item[0]
    const unit = item[1]
    let value = flags[name] === false ? 0 : seconds / unit
    if (value < 1) return 0

    value = Math.trunc(value)
    seconds %= unit
    return value
  })
}

function short (uptime, sep) {
  let s = ''
  sep = typeof sep === 'string' ? sep : ' '

  units.forEach((item, i) => {
    const name = item[0]
    const value = uptime[i]
    if (value >= 1) s += value + name[0] + sep
  })

  return s
}

function extended (uptime, sep) {
  let s = ''
  sep = typeof sep === 'string' ? sep : ' '

  units.forEach((item, i) => {
    const name = item[0]
    const value = uptime[i]
    if (value >= 1) s += value + ' ' + name + (value > 1 ? 's' : '') + sep
  })

  return s
}

function round (uptime) {
  const seconds = toSeconds(uptime)
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    const name = unit[0]
    const value = unit[1]
    const r = Math.round(seconds / value)
    if (r > 0) {
      return r + ' ' + name + (r > 1 ? 's' : '')
    }
  }
}

exports.parse = parse
exports.short = short
exports.extended = extended
exports.round = round
