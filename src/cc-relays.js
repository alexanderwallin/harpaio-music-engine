const { Output } = require('easymidi')

const getMidiInput = require('./getMidiInput.js')

const outputDevice = new Output(`Virtual JS Device v1 CC`, true)

async function run({ channels, controlIds, device }) {
  const midiInput = await getMidiInput(device)
  // console.log({ midiInput })

  if (midiInput !== null) {
    midiInput.on('message', (deltaTime, [command, inputControlId, value]) => {
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
        }
      }
    })
  }
}

module.exports = run
