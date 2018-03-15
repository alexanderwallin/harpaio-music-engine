require('isomorphic-fetch')
const Speaker = require('speaker')
const TextToSpeech = require('watson-developer-cloud/text-to-speech/v1')

async function say(sentence, { pitch }) {
  return new Promise((resolve, reject) => {
    const speaker = new Speaker({
      channels: 1,
      bitDepth: 16,
      sampleRate: 22050,
    })

    // Creats Watson TTS instance
    const tts = new TextToSpeech({
      username: '213e7a88-cf30-4069-b03b-37e7b61d9f0c',
      password: 'aM148k0Ys1Xd',
    })

    const text = `
    <speak>
      <voice-transformation
        type="Custom"
        pitch="${pitch}"
        pitch_range="100%"
        global_tenstion="0%"
        rate="-100%"
        timbre="Sunrise"
        timbre_extent="100%"
      >
        ${sentence}
      </voice-transformation>
    </speak>
    `

    // const voice = 'en-US_AllisonVoice'
    // const voice = 'en-US_LisaVoice'
    const voice = 'en-US_MichaelVoice'
    const accept = 'audio/wav'

    tts
      .synthesize({ text, voice, accept })
      .on('error', err => {
        console.log(`Won't talk to ya:`)
        console.log(err)
        reject(err)
      })
      .pipe(speaker)
      .on('finish', resolve)
  })
}

module.exports = say
