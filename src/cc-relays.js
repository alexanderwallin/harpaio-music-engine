const { Output } = require('easymidi')

const getMidiInput = require('./getMidiInput.js')

const relayOutputDevice = new Output(`Sonar Controller Relay`, true)

async function relayCc({ channels, controlIds, device, onRelay }) {
  const midiInput = await getMidiInput(device)

  const onCcMessage = message => {
    if (
      channels.includes(message.channel) === true &&
      controlIds.includes(message.controller)
    ) {
      const relayedMessage = {
        channel: message.channel,
        controller: message.controller,
        value: message.value,
      }
      relayOutputDevice.send('cc', relayedMessage)
      onRelay(relayedMessage)
    }
  }

  if (midiInput !== null) {
    midiInput.on('message', onCcMessage)
  }
}

module.exports.relayOutputDevice = relayOutputDevice
module.exports.relayCc = relayCc
