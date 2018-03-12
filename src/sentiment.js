const got = require('got')
const { values } = require('lodash')

const { API_URL } = require('./configs.js')
const { Arousal, Mood } = require('./constants.js')

let arousal = Arousal.NEUTRAL
let mood = Mood.NEUTRAL

async function fetchSentimentalState() {
  const response = await got(`${API_URL}/channel-predictions`, {
    json: true,
  })
  const { data } = response.body

  arousal = data ? values(Arousal)[data[0][0]] : Arousal.NEUTRAL
  mood = data ? values(Mood)[data[0][1]] : Mood.NEUTRAL

  // console.log({ arousal, mood })

  return { arousal, mood }
}

function startSentimentQuerying(intervalMs) {
  setInterval(fetchSentimentalState, intervalMs)
}

function getSentiment() {
  return { arousal, mood }
}

module.exports.startSentimentQuerying = startSentimentQuerying
module.exports.getSentiment = getSentiment
