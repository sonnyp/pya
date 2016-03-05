'use strict'

function parse (meminfo) {
  const result = {}
  meminfo.split('\n').forEach(function (line) {
    var parts = line.split(':')
    if (parts.length === 2) {
      result[parts[0]] = +parts[1].trim().split(' ', 1)[0]
    }
  })
  return result
}

module.exports.parse = parse
