const got = require('got')
const { values } = require('lodash')

const { API_URL } = require('./configs.js')
const { Arousal, Mood } = require('./constants.js')

module.exports.getSentimentalState = async function getSentimentalState() {
  const response = await got(`${API_URL}/aggregated-predictions`, {
    json: true,
  })
  const arousal = values(Arousal)[response.body.data[0][0]]
  const mood = values(Mood)[response.body.data[0][1]]

  return { arousal, mood }
}
