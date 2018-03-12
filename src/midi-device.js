const { Output } = require('easymidi')

const device = new Output(`Virtual JS Device v1`, true)

module.exports = device
