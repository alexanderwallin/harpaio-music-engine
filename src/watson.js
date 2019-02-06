require('isomorphic-fetch')
const got = require('got')
const { shuffle } = require('lodash')
const Speaker = require('speaker')
const watson = require('watson-developer-cloud')
const TextToSpeech = require('watson-developer-cloud/text-to-speech/v1')

// const USERNAME = '213e7a88-cf30-4069-b03b-37e7b61d9f0c'
// const PASSWORD = 'aM148k0Ys1Xd'

console.log(watson.TextToSpeechV1.URL)

const USERNAME = process.env.WATSON_USERNAME
const PASSWORD = process.env.WATSON_PASSWORD
const WATSON_API_KEY = process.env.WATSON_API_KEY

async function getToken() {
  return new Promise((resolve, reject) => {
    console.log('getToken()', { WATSON_API_KEY, USERNAME, PASSWORD })

    try {
      const watsonAuthService = new watson.AuthorizationV1({
        // username: USERNAME,
        // password: PASSWORD,
        iam_apikey: WATSON_API_KEY,
      })

      watsonAuthService.getToken(
        { url: watson.TextToSpeechV1.URL },
        (err, token) => {
          console.log({ err, token })
          if (err) {
            reject(err)
          } else {
            resolve(token)
          }
        }
      )
    } catch (err) {
      console.log('err', err)
    }
  })
}

async function fetchSpeech(sentence) {
  return new Promise((resolve, reject) => {
    const text = `
    <speak>
      <voice-transformation
        type="Custom"
        pitch="-100%"
        pitch_range="0%"
        global_tenstion="-100%"
        rate="-100%"
        timbre="Breeze"
        timbre_extent="0%"
      >
        ${sentence}
      </voice-transformation>
    </speak>
    `

    const voice = shuffle([
      'en-US_AllisonVoice',
      'en-US_LisaVoice',
      'en-US_MichaelVoice',
    ])[0]

    const body = JSON.stringify({ text, voice })

    const headers = {
      Accept: 'audio/wav',
      Authorization: `Basic ${Buffer.from(`apikey:${WATSON_API_KEY}`).toString(
        'base64'
      )}`,
      'Content-Type': 'application/json',
    }

    got(
      `https://gateway-lon.watsonplatform.net/text-to-speech/api/v1/synthesize?voice=${voice}`,
      {
        method: 'POST',
        encoding: null,
        headers,
        body,
      }
    )
      .then(response => {
        resolve(response.body)
      })
      .catch(err => {
        console.error(err)
        reject(err)
      })
  })
}

async function say(sentence) {
  return new Promise((resolve, reject) => {
    const speaker = new Speaker({
      channels: 1,
      bitDepth: 16,
      sampleRate: 22050,
    })

    // Creats Watson TTS instance
    const tts = new TextToSpeech({
      // username: USERNAME,
      // password: PASSWORD,
      iam_apikey: WATSON_API_KEY,
    })

    const text = `
    <speak>
      <voice-transformation
        type="Custom"
        pitch="-100%"
        pitch_range="0%"
        global_tenstion="-100%"
        rate="-100%"
        timbre="Breeze"
        timbre_extent="0%"
      >
        ${sentence}
      </voice-transformation>
    </speak>
    `

    const voice = shuffle([
      'en-US_AllisonVoice',
      'en-US_LisaVoice',
      'en-US_MichaelVoice',
    ])[0]

    const accept = 'audio/wav'

    tts
      .synthesize({ text, voice, accept })
      .on('error', err => {
        console.log(`Won't talk to ya:`)
        console.log(err)
        reject(err)
      })
      .on('message', data => console.log({ data }))
      .pipe(speaker)
      .on('finish', resolve)
  })
}

module.exports = say
module.exports.getToken = getToken
module.exports.fetchSpeech = fetchSpeech
