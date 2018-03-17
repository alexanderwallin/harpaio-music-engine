/* eslint new-cap: 0 */
const easymidi = require('easymidi')
const inquirer = require('inquirer')

module.exports = async function getMidiInput({ device }) {
  const portNames = easymidi.getInputs()
  if (portNames.length === 0) {
    return null
  }

  let resolvedPort = device
  if (!resolvedPort) {
    const { port } = await inquirer.prompt([
      {
        type: 'list',
        name: 'port',
        message: 'Choose a MIDI port',
        choices: portNames,
      },
    ])
    resolvedPort = port
  }

  return new easymidi.Input(resolvedPort)
}
