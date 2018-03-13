/* eslint new-cap: 0 */
const midi = require('midi')

module.exports = async function getMidiInput(name) {
  const input = new midi.input()
  const portNames = new Array(input.getPortCount())
    .fill(null)
    .map((nothing, i) => input.getPortName(i))

  if (portNames.length === 0) {
    return null
  }

  const portIdx = portNames.indexOf(name)
  if (portIdx === -1) {
    return null
  }

  input.openPort(portIdx)
  return input
}
