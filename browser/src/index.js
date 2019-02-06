/* global document, WebSocket, window */
const Tone = require('tone')
const getAudioContext = require('audio-context')

const { API_HOSTNAME } = require('./configs.js')
const { fetchSentenceAudio } = require('./watson.js')

const decodeContext = getAudioContext()

class Pad extends Tone.FMSynth {
  constructor(options) {
    super(options)

    this.set('envelope', {
      attack: 0.5,
      decay: 0.8,
      sustain: 0,
      release: 5,
    })
  }
}

Tone.Transport.set('bpm', 80)

const pad = new Tone.PolySynth(6, Pad)
const chorus = new Tone.Chorus({ wet: 0.15 })
const pingPong = new Tone.PingPongDelay('4n', 0.4)
pingPong.set('feedback', 0.8)
pingPong.set('wet', 0.5)
const lpf = new Tone.Filter(150, 'lowpass')
const lpfLfo = new Tone.LFO(0.1, 80, 400)
lpfLfo.connect(lpf.frequency)
lpfLfo.start()
const reverb = new Tone.Reverb(10).toMaster()
reverb.set('wet', 1)

pad.connect(chorus)
chorus.connect(pingPong)
pingPong.connect(lpf)
lpf.connect(reverb)

reverb.generate()

// Meter
const meter = new Tone.Meter(0.95)
reverb.connect(meter)

// Speech effects
// const speechChorus = new Tone.Chorus(0.5, 10, 0.3)
const speechPitch = new Tone.PitchShift(-3)
speechPitch.set('feedback', 0.1)
const speechReverb = new Tone.Reverb(5).toMaster()
speechReverb.set('wet', 0.5)
speechReverb.generate()

speechPitch.connect(speechReverb)
// speechChorus.connect(speechReverb)

const speechMeter = new Tone.Meter(0.95)
speechReverb.connect(speechMeter)

const $app = document.querySelector('#app')
const $speechMeter = document.querySelector('#speech')

function updateBackgroundColor() {
  const loudness = Tone.dbToGain(meter.getLevel())
  $app.style.opacity = loudness * 3

  const speechLoudness = Tone.dbToGain(speechMeter.getLevel()) * 2
  $speechMeter.style.transform = `scaleX(${speechLoudness})`

  window.requestAnimationFrame(updateBackgroundColor)
}
updateBackgroundColor()

// Wisdom state
const wisdomQueue = {}

// Create socket server
const ws = new WebSocket(`ws://${API_HOSTNAME}`)
ws.onerror = () => console.log('WebSocket error')
ws.onopen = () => console.log('WebSocket connection established')
ws.onclose = () => console.log('WebSocket connection closed')

// Handle socket messages
ws.onmessage = ({ data }) => {
  const { type, body } = JSON.parse(data)
  console.log('message', { type, body })

  if (type === 'music') {
    pad.triggerAttackRelease(body.chord, '8n')
  } else if (type === 'wisdom') {
    fetchSentenceAudio(body.text)
      .then(sentenceBuffer => {
        return new Promise((resolve, reject) => {
          decodeContext.decodeAudioData(sentenceBuffer, resolve, reject)
        })
      })
      .then(sentenceAudioBuffer => {
        wisdomQueue[body.id] = sentenceAudioBuffer
      })
      .catch(err => {
        console.log('failed to fetch speech')
        console.error(err)
      })
  } else if (type === 'speak') {
    const audioBuffer = wisdomQueue[body.id]

    if (audioBuffer) {
      const source = new Tone.BufferSource(audioBuffer)
      source.connect(speechPitch)
      source.onended = () => {
        source.disconnect()
        delete wisdomQueue[body.id]
      }
      source.start()
    }
  }
}
