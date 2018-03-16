const { Output } = require('easymidi')

const getMidiInput = require('./getMidiInput.js')

const relayOutputDevice = new Output(`Sonar Controller Relay`, true)

async function relayCc({ channels, controlIds, device, onRelay }) {
  const midiInput = await getMidiInput(device)

  const onMidiMessage = (deltaTime, [command, inputControlId, value]) => {
    if (176 <= command && command < 192) {
      const inputChannel = command - 176

      if (
        channels.includes(inputChannel) === true &&
        controlIds.includes(inputControlId)
      ) {
        const message = {
          channel: inputChannel,
          controller: inputControlId,
          value,
        }
        relayOutputDevice.send('cc', message)
        onRelay(message)
      }
    }
  }

  if (midiInput !== null) {
    midiInput.on('message', onMidiMessage)
  }
}

module.exports.relayOutputDevice = relayOutputDevice
module.exports.relayCc = relayCc
