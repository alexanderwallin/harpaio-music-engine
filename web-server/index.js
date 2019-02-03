const express = require('express')
const http = require('http')
const WebSocket = require('ws')

const { Arousal, Mood } = require('../src/constants.js')
const { getChord, getMelodyNotes } = require('../src/orchestration.js')

function stepThroughObject(object, currentValue, steps = 1) {
  const currentIndex = Object.values(object).indexOf(currentValue)
  const keys = Object.keys(object)
  return object[keys[(currentIndex + steps) % keys.length]]
}

const PORT = process.env.PORT || 8221

const app = express()
const server = http.createServer(app)
const wsServer = new WebSocket.Server({ server })

wsServer.on('connection', wsSocket => {
  console.log('connection activate')
  wsSocket.send(JSON.stringify({ type: 'greeting', body: 'HELO' }))
})

server.listen(PORT, () => {
  console.log(`running socket server on ${server.address().port}`)

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
    wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'music', body }))
      }
    })
  }, 4 * 4 * (60 / TEMPO) * 1000)
})
