const cors = require('cors')
const express = require('express')
const http = require('http')
const uuid = require('uuid')
const WebSocket = require('ws')

const { Arousal, Mood } = require('../src/constants.js')
const { getChord, getMelodyNotes } = require('../src/orchestration.js')
const { getSentence } = require('../src/poet.js')
const { getToken, fetchSpeech } = require('../src/watson.js')

function stepThroughObject(object, currentValue, steps = 1) {
  const currentIndex = Object.values(object).indexOf(currentValue)
  const keys = Object.keys(object)
  return object[keys[(currentIndex + steps) % keys.length]]
}

function broadcast(wsServerInstance, type, body) {
  wsServerInstance.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, body }))
    }
  })
}

const PORT = process.env.PORT || 8221

const app = express()
const server = http.createServer(app)
const wsServer = new WebSocket.Server({ server })

wsServer.on('connection', wsSocket => {
  console.log('connection activate')
  wsSocket.send(JSON.stringify({ type: 'greeting', body: 'HELO' }))
})

app.use(
  cors({
    origin: 'http://localhost:8220',
  })
)

app.get('/watson-token', async (req, res) => {
  console.log('watson-token', getToken)
  try {
    const token = await getToken()
    return res.json({ data: token })
  } catch (err) {
    return res.status(500).json({ error: err })
  }
})

app.get('/speech', async (req, res) => {
  const { sentence } = req.query

  try {
    const speechAudio = await fetchSpeech(sentence)
    res.send(speechAudio)
  } catch (err) {
    res.status(500).json({ error: err })
  }
})

server.listen(PORT, () => {
  console.log(`running socket server on ${server.address().port}`)

  /**
   * Orchestration
   */
  const TEMPO = 80
  const ROOT_KEY = 'C3'
  let mood = Mood.POSITIVE
  let arousal = Arousal.ACTIVE
  const RELATIVE_ACTIVITY = 0.3

  setInterval(() => {
    mood = stepThroughObject(Mood, mood)
  }, 10000)

  setInterval(() => {
    arousal = stepThroughObject(Arousal, arousal)
  }, 8000)

  setInterval(() => {
    console.log({ mood, arousal })

    const chord = getChord(mood, arousal, ROOT_KEY)
    const notes = getMelodyNotes(mood, arousal, RELATIVE_ACTIVITY, chord)

    const body = { chord, notes }
    console.log(body)

    // Broadcast chords and notes
    broadcast(wsServer, 'music', body)
  }, 4 * 4 * (60 / TEMPO) * 1000)

  /**
   * Wisdom
   */
  setInterval(() => {
    const sentence = {
      id: uuid.v4(),
      text: getSentence(mood, 80),
    }

    broadcast(wsServer, 'wisdom', sentence)

    setTimeout(() => {
      broadcast(wsServer, 'speak', { id: sentence.id })
    }, 5000)
  }, 20000)
})
