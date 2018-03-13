const got = require('got')
const { values } = require('lodash')

const { API_URL } = require('./configs.js')
const { Arousal, Mood } = require('./constants.js')

let arousal = Arousal.NEUTRAL
let mood = Mood.NEUTRAL
let activeControls = {}

async function fetchSentimentalState() {
  const [predictionsResponse, activeControlsResponse] = await Promise.all([
    await got(`${API_URL}/channel-predictions`, {
      json: true,
    }),
    await got(`${API_URL}/active-controls`, {
      json: true,
    }),
  ])

  mood = predictionsResponse.body.data
    ? values(Mood)[predictionsResponse.body.data[0][1]]
    : Mood.NEUTRAL

  activeControls = activeControlsResponse.body

  const activeCount = activeControls.data.length
  if (activeCount === 0) {
    arousal = Arousal.PASSIVE
  } else if (activeCount < 3) {
    arousal = Arousal.NEUTRAL
  } else {
    arousal = Arousal.ACTIVE
  }
  // arousal = activeControls.body.data ? values(Arousal)[data[0][0]] : Arousal.NEUTRAL

  // console.log({ arousal, mood })

  return { arousal, mood }
}

function startSentimentQuerying(intervalMs) {
  setInterval(fetchSentimentalState, intervalMs)
}

function getSentiment() {
  return { arousal, mood }
}

function getActivity() {
  return activeControls
}

module.exports.startSentimentQuerying = startSentimentQuerying
module.exports.getSentiment = getSentiment
module.exports.getActivity = getActivity
