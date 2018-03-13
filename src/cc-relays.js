const { Output } = require('easymidi')

const getMidiInput = require('./getMidiInput.js')

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const outputDevice = new Output(`Virtual JS Device v1 CC`, true)
let isSweeping = false

async function run({ channels, controlIds, device, onRelay }) {
  const midiInput = await getMidiInput(device)

  if (midiInput !== null) {
    midiInput.on(
      'message',
      async (deltaTime, [command, inputControlId, value]) => {
        if (176 <= command && command < 192) {
          const inputChannel = command - 176

          if (
            channels.includes(inputChannel + 1) === true &&
            controlIds.includes(inputControlId)
          ) {
            outputDevice.send('cc', {
              channel: 15,
              controller: inputChannel * 16 + inputControlId,
              value,
            })

            if (isSweeping === false) {
              isSweeping = true
              onRelay()
              await delay(1000)
              isSweeping = false
            }
          }
        }
      }
    )
  }
}

module.exports = run
