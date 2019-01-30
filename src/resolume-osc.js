const dgram = require('dgram')
const osc = require('osc-min')

const OSC_IP_ADDRESS = '10.102.20.145'
const OSC_PORT = 7002

const socket = dgram.createSocket('udp4')
socket.on('error', err => {
  console.log('Error:')
  console.log(err)
  console.log(err.stack)
})

function sendValue(address, value) {
  return new Promise((resolve, reject) => {
    const message = osc.toBuffer({
      address,
      args: [value],
    })
    socket.send(message, 0, message.length, OSC_PORT, OSC_IP_ADDRESS, err => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

module.exports.sendValue = sendValue
