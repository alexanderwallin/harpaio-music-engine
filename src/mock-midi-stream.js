const { Output } = require('easymidi')
const { random } = require('lodash')
const readline = require('readline')

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const device = new Output(`Mock MIDI stream`, true)
const numChannels = 6
const numControls = 16

const delays = [30, 40, 60, 80, 100, 200, 400, 800, 1200]
let currentDelay = 80

async function next() {
  const channel = random(0, numChannels - 1)
  const controller = random(1, numControls)
  const value = random(0, 127)

  // console.log({ channel, controller })
  console.log(`${channel} -> ${controller} : ${value}`)
  device.send('cc', { channel, controller, value })
  await delay(1)
  device.send('cc', { channel, controller, value: random(0, 127) })

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
      currentDelay = delays[num - 1]
    }
  })
}

function run() {
  next()
  listenToKeyboard()
}

run()
