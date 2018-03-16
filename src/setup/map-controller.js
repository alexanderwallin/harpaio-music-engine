const { range } = require('lodash')

const { relayCc } = require('../cc-relays.js')

async function run() {
  relayCc({
    channels: range(0, 15),
    controlIds: range(0, 15),
    device: `IAC Driver Bus 1`,
    onRelay: packet => console.log(packet),
  })
}

run()
