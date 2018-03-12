const got = require('got')
const { values } = require('lodash')

const { API_URL } = require('./configs.js')
const { Arousal, Mood } = require('./constants.js')

let arousal = Arousal.NEUTRAL
let mood = Mood.NEUTRAL

async function fetchSentimentalState() {
  const response = await got(`${API_URL}/aggregated-predictions`, {
    json: true,
  })
  arousal = values(Arousal)[response.body.data[0][0]]
  mood = values(Mood)[response.body.data[0][1]]

  return { arousal, mood }
}

module.exports.startSentimentQuerying = function(intervalMs) {
  setInterval(fetchSentimentalState, intervalMs)
}

module.exports.getSentiment = function() {
  return { arousal, mood }
}
