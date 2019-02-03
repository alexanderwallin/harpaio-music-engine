/* global document, WebSocket, window */
const Tone = require('tone')

class Pad extends Tone.FMSynth {
  constructor(options) {
    super(options)

    this.set('envelope', {
      attack: 0.5,
      decay: 0.8,
      sustain: 0.4,
      release: 2,
    })
  }
}

Tone.Transport.set('bpm', 80)

const pad = new Tone.PolySynth(6, Pad)
const chorus = new Tone.Chorus({ wet: 0.15 })
const lpf = new Tone.Filter(150, 'lowpass')
const pingPong = new Tone.PingPongDelay('4n', 0.4)
pingPong.set('feedback', 0.8)
pingPong.set('wet', 0.5)
const reverb = new Tone.Reverb(10).toMaster({ wet: 1 })

pad.connect(chorus)
chorus.connect(lpf)
lpf.connect(pingPong)
pingPong.connect(reverb)

reverb.generate()

// Meter
const meter = new Tone.Meter(0.9)
reverb.connect(meter)

function updateBackgroundColor() {
  const loudness = Tone.dbToGain(meter.getLevel())
  document.querySelector('#app').style.opacity = loudness * 3

  window.requestAnimationFrame(updateBackgroundColor)
}
updateBackgroundColor()

// Create socket server
const ws = new WebSocket(`ws://${window.location.hostname}:8221`)
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
    console.log('wisdom')
  }
}
