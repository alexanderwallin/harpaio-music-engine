const args = require('args')
const { Output } = require('easymidi')
const { random } = require('lodash')
const readline = require('readline')

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

args.option('verbose', 'You know what this means', false)
const { verbose } = args.parse(process.argv)

const device = new Output(`Mock MIDI stream`, true)
const numChannels = 6
const numControls = 16

const delays = [30, 40, 60, 80, 100, 200, 400, 800, 1200]
let currentDelay = delays[8]

let isEnabled = true

async function next() {
  if (isEnabled === true) {
    const channel = random(0, numChannels - 1)
    const controller = random(1, numControls)
    const value = random(0, 127)

    if (verbose === true) {
      console.log(`${channel} -> ${controller} : ${value}`)
    }

    device.send('cc', { channel, controller, value })
    await delay(1)
    device.send('cc', { channel, controller, value: random(0, 127) })
  }

  setTimeout(next, currentDelay)
}

function listenToKeyboard() {
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)

  process.stdin.on('keypress', (str, key) => {
    console.log(str)
    console.log(key)

    if (str === 'c') {
      process.exit(0)
    }

    const num = parseInt(str, 10)
    if (1 <= num && num <= 9) {
      isEnabled = true
      currentDelay = delays[num - 1]
    } else if (num === 0) {
      isEnabled = false
    }
  })
}

function run() {
  next()
  listenToKeyboard()
}

run()
