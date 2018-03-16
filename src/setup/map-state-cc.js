const { Output } = require('easymidi')
const inquirer = require('inquirer')

const { CcRelayChannel } = require('../constants.js')

const device = new Output(`Sonar Controller Relay`, true)

async function nextInteractive() {
  const channel = CcRelayChannel.STATE
  const value = 0
  const { controller } = await inquirer.prompt([
    {
      type: 'input',
      name: 'controller',
      message: 'Controller',
      default: '0',
      filter: x => parseInt(x, 10),
    },
  ])

  device.send('cc', { channel, controller, value })
  console.log(`Send ${value} from ${controller} on channel ${channel}`)

  nextInteractive()
}

async function run() {
  try {
    await nextInteractive()
  } catch (err) {
    console.log('Failed sending CC in interactive mode:')
    console.log(err)
  }
}

run()
