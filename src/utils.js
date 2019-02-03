const { shuffle } = require('lodash')

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pickRandom(arr) {
  return shuffle(arr)[0]
}

function cast(val, fromLower, fromUpper, toLower, toUpper) {
  if (toUpper === toLower) {
    return toUpper
  }

  return (
    ((val - fromLower) * (toUpper - toLower)) / (fromUpper - fromLower) +
    toLower
  )
}

module.exports.delay = delay
module.exports.pickRandom = pickRandom
module.exports.cast = cast
