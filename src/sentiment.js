const got = require('got')
const { values } = require('lodash')

const { API_URL } = require('./configs.js')
const { Arousal, Mood } = require('./constants.js')

let hasCalibrated = false
let defaultMood = null

let arousal = Arousal.PASSIVE
let mood = Mood.NEUTRAL

let moodIterator = 0

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

  if (hasCalibrated === false && predictionsResponse.body.data) {
    // eslint-disable-next-line
    defaultMood = predictionsResponse.body.data[0][1]
    hasCalibrated = true
  }

  // const sortedMoods = values(Mood)
  // const temp = sortedMoods[defaultMood]
  // const neutralIdx = sortedMoods.indexOf(Mood.NEUTRAL)
  // sortedMoods[defaultMood] = Mood.NEUTRAL
  // sortedMoods[neutralIdx] = temp

  // mood = predictionsResponse.body.data
  //   ? sortedMoods[predictionsResponse.body.data[0][1]]
  //   : Mood.NEUTRAL

  if (predictionsResponse.body.data[0][1] !== defaultMood) {
    moodIterator += 1
  }
  mood = values(Mood)[moodIterator % 3]

  activeControls = activeControlsResponse.body

  const activeCount = activeControls.data.length
  if (activeCount === 0) {
    arousal = Arousal.PASSIVE
  } else if (activeCount < 3) {
    arousal = Arousal.NEUTRAL
  } else {
    arousal = Arousal.ACTIVE
  }

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
