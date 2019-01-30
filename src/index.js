// eslint-disable-next-line
require = require('@std/esm')(module, { mode: 'js' })

const AbletonLink = require('abletonlink')
const args = require('args')
const spawn = require('cross-spawn')
const { Output } = require('easymidi')
const { clamp, flatten, random, shuffle, values } = require('lodash')
const duration = require('note-duration')
const { midi, Note, transpose } = require('tonal')
const Sequencer = require('um-sequencer').default

const { relayCc, relayOutputDevice } = require('./cc-relays.js')
const {
  Arousal,
  Mood,
  EngineCcControl,
  InstrumentChannel,
  CcRelayChannel,
} = require('./constants.js')
const { getSentence } = require('./poet.js')
const resolumeOsc = require('./resolume-osc.js')
const {
  getActivity,
  getRelativeActivity,
  getSentiment,
  startSentimentQuerying,
} = require('./sentiment.js')

// CLI options
args.option(
  'activity-smoothening',
  'Transition time between levels of relative activity'
)
args.option(
  'arousal-peak',
  'The relative amount of active controls that is considered max arousal'
)
args.option('channels', 'A comma-separated list of channels to listen to')
args.option('controls', 'A comma-separated list of control IDs to listen to')
args.option('relay-device', 'What MIDI device to relay CC from')
args.option('tempo', 'Tempo in bpm', 120)
args.option('verbose', 'Log stuff to console', false)

const {
  activitySmoothening,
  arousalPeak,
  channels,
  controls,
  relayDevice,
  tempo,
  verbose,
} = args.parse(process.argv)

const NOTE_TIME_DELAY = 0.05
const NUM_BARS_BETWEEN_CHORDS = 4
const ACTIVITY_SMOOTHENING = parseFloat(activitySmoothening)
const AROUSAL_PEAK = parseFloat(arousalPeak)

const musicGenerator = new Output(`Sonar Music Generator`, true)

const channelsArray = String(channels)
  .split(',')
  .map(x => parseInt(x, 10))
const resolvedControlIds = String(controls)
  .split(',')
  .map(x => parseInt(x, 10))

const fifthIntervals = ['1P', '5P']
const majorIntervals = ['1P', '3M', '5P']
const minorIntervals = ['1P', '3m', '5P']

const majorRootKeys = ['1P', '4P', '5P']
const minorRootKeys = ['2M', '3M', '6M']

const neutralColoringIntervals = ['9M']
const majorColoringIntervals = ['7M', '9M']
const minorColoringIntervals = ['7m', '9M']

const moodIntervals = {
  [Mood.POSITIVE]: majorIntervals,
  [Mood.NEUTRAL]: fifthIntervals,
  [Mood.NEGATIVE]: minorIntervals,
}

const moodColoringIntervals = {
  [Mood.POSITIVE]: majorColoringIntervals,
  [Mood.NEUTRAL]: neutralColoringIntervals,
  [Mood.NEGATIVE]: minorColoringIntervals,
}

const kickSequences = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  [1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
]

const hihatPatterns = [
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  // [0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1],
  // [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
]

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pickRandom(arr) {
  return shuffle(arr)[0]
}

function log(...restArgs) {
  if (verbose === true) {
    console.log(...restArgs)
  }
}

function cast(val, fromLower, fromUpper, toLower, toUpper) {
  if (toUpper === toLower) {
    return toUpper
  }

  return (
    (val - fromLower) * (toUpper - toLower) / (fromUpper - fromLower) + toLower
  )
}

function createSequencer(getCurrentTime) {
  return new Sequencer(getCurrentTime, {
    useWorker: false,
  })
}

function getChord(mood, arousal, rootKey) {
  // Get key
  const chordKey =
    mood === Mood.POSITIVE
      ? majorRootKeys[random(majorRootKeys.length - 1)]
      : minorRootKeys[random(minorRootKeys.length - 1)]

  // Get the chord intervals for the key
  const chordIntervals = moodIntervals[mood]

  // Select extra colorings
  const coloringIntervals = shuffle(moodColoringIntervals[mood])
  const numAppliedColorIntervals = {
    [Arousal.PASSIVE]: 0,
    [Arousal.NEUTRAL]: 1,
    [Arousal.ACTIVE]: 2,
  }[arousal]
  const appliedColoringIntervals = coloringIntervals.slice(
    0,
    numAppliedColorIntervals
  )

  // Transpose and actualise chord notes
  const chordAbsoluteKey = transpose(rootKey, chordKey)
  const chord = chordIntervals
    .concat(appliedColoringIntervals)
    .concat('P-8')
    .map(interval => transpose(chordAbsoluteKey, interval))

  return chord
}

let lastAbletonBeat = 0

async function syncWithAbleton() {
  return new Promise(resolve => {
    const link = new AbletonLink()
    link.startUpdate(25, beat => {
      lastAbletonBeat = beat
      resolve()
    })
  })
}

async function run() {
  // Frame
  let f = -1

  // Notes and patterns
  let rootKey = 'C4'
  let chord = [rootKey]
  let chordChannels = []
  let scheduledSoloNotes = []
  let drumSequence = []
  let bassline = []
  let basslineHitOrder = []
  let bassSequence = []
  let kickSequence = []
  let hihatSequence = []
  let isSweeping = false

  // Sentiment and activity
  let mood = Mood.NEUTRAL
  let arousal = Arousal.PASSIVE
  let activityData = []
  let lastActivity = Date.now()
  let relativeActivity = 0
  log({ ACTIVITY_SMOOTHENING })
  startSentimentQuerying(500, {
    activityPeak: AROUSAL_PEAK,
    activitySmoothening: ACTIVITY_SMOOTHENING,
  })

  // Sequencing
  await syncWithAbleton()
  const getCurrentTime = () => lastAbletonBeat * 60 / tempo

  const clockSequencer = createSequencer(getCurrentTime)
  const soloNoteSequencer = createSequencer(getCurrentTime)
  const drumSequencer = createSequencer(getCurrentTime)
  const bassSequencer = createSequencer(getCurrentTime)
  const kickSequencer = createSequencer(getCurrentTime)
  const hihatSequencer = createSequencer(getCurrentTime)

  // CC relaying
  await relayCc({
    channels: channelsArray,
    controlIds: resolvedControlIds,
    device: relayDevice,
    onRelay: async packet => {
      // log('onRelay', packet)

      // Play a swell if we have come back from idle
      if (arousal === Arousal.PASSIVE && isSweeping === false) {
        triggerSwells()
        isSweeping = true
        await delay(2000)
        isSweeping = false
      }

      if (packet.controller <= 7) {
        resolumeOsc.sendValue(
          `/composition/link${packet.controller + 1}/values`,
          packet.value / 127
        )
      } else if (packet.controller === 8) {
        resolumeOsc.sendValue(
          `/layer1/clip1/connect`,
          packet.value >= 64 ? 1 : 0
        )
      } else if (packet.controller === 64) {
        resolumeOsc.sendValue(
          `/layer1/clip2/connect`,
          packet.value >= 64 ? 1 : 0
        )
      }
    },
  })

  // Update chords
  function updateChord() {
    // Skip changes to harmonics for now, since staying enables use
    // of tonal samples and other things.
    //
    // if (f % 1024 === 1023) {
    //   log('--- reset key ---')
    //   rootKey = 'C4'
    // } else if (f % 48 === 47) {
    //   // Perform mediantic transposition in the same mood
    //   log('--- change key ---')
    //   const medians = ['M-3', 'm-3', '3m', '3M']
    //   const median = pickRandom(medians)
    //   rootKey = Note.fromMidi(midi(transpose(rootKey, median)))
    // }

    chord = getChord(mood, arousal, rootKey)
  }

  // Play chords
  function setChords() {
    // chordChannels = arousal === Arousal.PASSIVE ? [0] : [0, 5]
  }

  function playChords() {
    chord.forEach(async note => {
      musicGenerator.send('noteon', {
        channel: InstrumentChannel.PAD,
        note: midi(note),
        velocity:
          flatten([majorColoringIntervals, minorColoringIntervals]).includes(
            note
          ) === true
            ? random(10, 40)
            : random(60, 100),
      })
      await delay(NUM_BARS_BETWEEN_CHORDS / 2 * 3.95 * 60 * 1000 / tempo)
      musicGenerator.send('noteoff', {
        channel: InstrumentChannel.PAD,
        note: midi(note),
      })
    })

    if (arousal !== Arousal.PASSIVE) {
      const numNotes = Math.round(
        chord.length *
          cast(
            clamp(relativeActivity, 0, AROUSAL_PEAK),
            0,
            AROUSAL_PEAK,
            0.1,
            1
          )
      )
      log({ numNotes })
      chord.slice(0, numNotes).forEach(async note => {
        musicGenerator.send('noteon', {
          channel: InstrumentChannel.ARPEGGIATOR,
          note: midi(note),
          velocity: 100,
        })
        await delay(duration('1') * 1.95 * 1000 * 4 * tempo / 60)
        musicGenerator.send('noteoff', {
          channel: InstrumentChannel.ARPEGGIATOR,
          note: midi(note),
        })
      })
    }

    log(`${mood} (${arousal}) - ${rootKey}: [${chord.join(', ')}]`)
  }

  // Play solo note
  function setSoloNotes() {
    const soloNotes = shuffle(chord)
      .slice(0, Math.round(relativeActivity * chord.length))
      .map(note => transpose(note, '8P'))
      .map(note => transpose(note, arousal === Arousal.ACTIVE ? '8P' : '1P'))
    const soloNoteDurations = soloNotes.map(() => pickRandom(['16', '8']))
    const soloNoteDelay = pickRandom(['16', '8', '4'].map(duration).concat(0))

    scheduledSoloNotes = soloNotes.map((note, i) => ({
      time: soloNoteDurations
        .slice(0, i)
        .map(x => duration(x))
        .reduce((aggr, x) => aggr + x, soloNoteDelay + NOTE_TIME_DELAY),
      callback: async () => {
        musicGenerator.send('noteon', {
          channel: InstrumentChannel.MELODY,
          note: midi(note),
          velocity: random(50, 100),
        })

        log(`+ ${note}`)

        await delay(1000 * (60 / tempo) / 8)
        musicGenerator.send('noteoff', {
          channel: InstrumentChannel.MELODY,
          note: midi(note),
        })
      },
    }))
  }

  function playSoloNotes() {
    if (arousal !== Arousal.PASSIVE) {
      soloNoteSequencer.play(scheduledSoloNotes, { tempo })
    }
  }

  function setDrums() {
    const patterns = [0, 1, 2].map(() =>
      new Array(16).fill(0).map(() => {
        const castedRelativeActivity = cast(
          clamp(relativeActivity, 0, AROUSAL_PEAK),
          0,
          AROUSAL_PEAK,
          0,
          1
        )
        const hitProbability = Math.random() < castedRelativeActivity / 3
        return hitProbability
      })
    )

    log(
      patterns
        .map(pattern => pattern.map(x => (x ? 'x' : '-')).join(''))
        .join('\n')
    )

    drumSequence = patterns.map((pattern, patternIdx) =>
      pattern.map((hit, i) => ({
        time: i * duration('16') + NOTE_TIME_DELAY,
        callback: async () => {
          const note = midi('C#2') + patternIdx

          if (hit === true) {
            musicGenerator.send('noteon', {
              channel: InstrumentChannel.DRUMS,
              note,
              velocity: random(20, 100),
            })
            await delay(1)
            musicGenerator.send('noteoff', {
              channel: InstrumentChannel.DRUMS,
              note,
            })
          }
        },
      }))
    )
  }

  function playDrums() {
    if (arousal === Arousal.PASSIVE || relativeActivity < AROUSAL_PEAK / 3) {
      return
    }

    drumSequencer.play(flatten(drumSequence), { tempo })
  }

  function setBass() {
    if (f % 8 === 0) {
      const shuffledChord = shuffle(chord)
      bassline = new Array(16)
        .fill(0)
        .map((x, i) => shuffledChord[i % shuffledChord.length])
        .map(note => transpose(note, 'P-8'))
        .map(note => transpose(note, 'P-8'))
      bassline[0] = ['P-8', 'P-8'].reduce(
        (note, pitch) => transpose(note, pitch),
        chord[0]
      )
      basslineHitOrder = shuffle(new Array(16).fill(0).map((x, i) => i))
    }

    const numNotes = Math.round(relativeActivity * 16)
    const bassHits = basslineHitOrder.slice(0, numNotes)
    const rhythm = new Array(16).fill(0).map((x, i) => bassHits.includes(i))
    rhythm[0] = Math.random() < 0.75

    bassSequence = rhythm.reduce(
      (aggr, isOn, i) =>
        isOn
          ? [
              ...aggr,
              {
                time: duration('16') * i + NOTE_TIME_DELAY,
                callback: async () => {
                  musicGenerator.send('noteon', {
                    channel: InstrumentChannel.BASS,
                    note: midi(bassline[i]),
                    velocity: random(75, 120),
                  })
                  await delay(1000 * duration('32'))
                  musicGenerator.send('noteoff', {
                    channel: InstrumentChannel.BASS,
                    note: midi(bassline[i]),
                  })
                },
              },
            ]
          : aggr,
      []
    )

    log(rhythm.map((isOn, i) => (isOn ? bassline[i] : '·')).join(' '))
  }

  function playBass() {
    log('playBass', arousal)
    if (arousal !== Arousal.PASSIVE) {
      bassSequencer.play(bassSequence, { tempo })
    }
  }

  function setKick() {
    const kickPattern = kickSequences[Math.floor(f / 6) % kickSequences.length]
    kickSequence = kickPattern
      .map(
        (isOn, i) =>
          isOn
            ? {
                time: duration('16') * i + NOTE_TIME_DELAY,
                callback: async () => {
                  musicGenerator.send('noteon', {
                    channel: InstrumentChannel.KICK,
                    note: midi('C2'),
                    velocity: 100,
                  })
                  await delay(1)
                  musicGenerator.send('noteon', {
                    channel: InstrumentChannel.KICK,
                    note: midi('C2'),
                  })
                },
              }
            : null
      )
      .filter(x => x !== null)
  }

  function playKick() {
    if (arousal === Arousal.ACTIVE) {
      kickSequencer.play(kickSequence, { tempo })
    }
  }

  function setHihat() {
    const hihatPatternIdx = Math.floor(
      cast(clamp(relativeActivity, 0, AROUSAL_PEAK), 0, AROUSAL_PEAK, 0, 1) *
        (hihatPatterns.length - 1)
    )
    log({ hihatPatternIdx })
    const pattern = hihatPatterns[hihatPatternIdx]
    hihatSequence = pattern
      .map(
        (isOn, i) =>
          isOn
            ? {
                time: duration('16') * i + NOTE_TIME_DELAY,
                callback: async () => {
                  const note = midi('C2') + Math.floor(f / 12) % 2
                  musicGenerator.send('noteon', {
                    channel: InstrumentChannel.HIHAT,
                    note,
                    velocity: 100,
                  })
                  await delay(100)
                  musicGenerator.send('noteoff', {
                    channel: InstrumentChannel.HIHAT,
                    note,
                  })
                },
              }
            : null
      )
      .filter(x => x)
  }

  function playHihat() {
    if (arousal === Arousal.PASSIVE) {
      return
    }
    if (relativeActivity < 0.1) {
      return
    }

    hihatSequencer.play(hihatSequence, { tempo })
  }

  function sendStateCC() {
    relayOutputDevice.send('cc', {
      channel: CcRelayChannel.STATE,
      controller: EngineCcControl.MOOD,
      value: mood === Mood.NEGATIVE ? 127 : 0,
    })

    const ArousalCcValue = {
      [Arousal.PASSIVE]: 0,
      [Arousal.NEUTRAL]: 64,
      [Arousal.ACTIVE]: 127,
    }
    relayOutputDevice.send('cc', {
      channel: CcRelayChannel.STATE,
      controller: EngineCcControl.AROUSAL,
      value: ArousalCcValue[arousal],
    })
  }

  /**
   * Poetry
   */
  let isReadingPoetry = false
  let poetryTimer = null
  function startReadingPoetry() {
    isReadingPoetry = true

    poetryTimer = setInterval(() => {
      const sentence = getSentence(mood)
      spawn('node', ['src/say.js', '--sentence', `'${sentence}'`])
      log({ sentence })
    }, 15000)
  }

  function stopReadingPoetry() {
    isReadingPoetry = false
    clearInterval(poetryTimer)
  }

  /**
   * Swells
   */
  async function triggerSwells() {
    log('triggerSwells()')
    musicGenerator.send('noteon', {
      channel: InstrumentChannel.SWELLS,
      note: midi('C2'),
      velocity: 100,
    })
    await delay(50)
    musicGenerator.send('noteoff', {
      channel: InstrumentChannel.SWELLS,
      note: midi('C2'),
    })
  }

  /**
   * Main loop
   */
  function nextBar() {
    f += 1

    let didChangeMood = false
    let didComeBack = false

    try {
      // Get latest activity
      const activityInfo = getActivity()

      activityData = activityInfo.data || []
      if (activityData.length > 0 && Date.now() - lastActivity > 3000) {
        didComeBack = true
      }

      relativeActivity = getRelativeActivity()
      log({ relativeActivity })

      if (activityData.length > 0) {
        lastActivity = Date.now()
      }

      // Update sentiment
      if (f % NUM_BARS_BETWEEN_CHORDS === 0) {
        const sentiment = getSentiment()
        if (mood !== sentiment.mood) {
          didChangeMood = true
        }

        arousal = sentiment.arousal // eslint-disable-line
        mood = sentiment.mood // eslint-disable-line
      }

      // Resolume OSC
      const oscMoodValue =
        values(Mood).indexOf(mood) / (values(Mood).length - 1)
      const oscArousalValue =
        values(Arousal).indexOf(arousal) / (values(Arousal).length - 1)
      resolumeOsc.sendValue('/composition/link1/values', oscMoodValue)
      resolumeOsc.sendValue('/composition/link2/values', oscArousalValue)
      resolumeOsc.sendValue(
        '/composition/link3/values',
        cast(relativeActivity, 0, 0.3, 0, 1)
      )

      // Poetry
      if (
        activityData.length === 0 &&
        Date.now() - lastActivity > 6000 &&
        isReadingPoetry === false
      ) {
        startReadingPoetry()
      } else if (activityData.length > 0 && isReadingPoetry === true) {
        stopReadingPoetry()

        const greeting = shuffle([
          `Hello there`,
          `Greetings`,
          `Glad to have some company`,
          `Good evening stranger`,
        ])[0]
        spawn('node', ['src/say.js', '--sentence', `'${greeting}'`])
      } else if (activityData.length > 0 && didChangeMood === true) {
        // People seem to get confused by this
        // const sentence = shuffle([
        //   `Oh... there we are`,
        //   `Nice!`,
        //   `That's what I'm talking about`,
        //   `Feel the groove`,
        // ])[0]
        // spawn('node', ['src/say.js', '--sentence', `'${sentence}'`])
      }

      if (f % NUM_BARS_BETWEEN_CHORDS === 0) {
        updateChord()
      }

      setChords()
      setSoloNotes()
      setDrums()
      setBass()
      setKick()
      setHihat()

      sendStateCC()

      if (f % (NUM_BARS_BETWEEN_CHORDS / 2) === 0) {
        playChords()
      }
      playSoloNotes()
      playDrums()
      playBass()
      playKick()
      playHihat()
    } catch (err) {
      log('An error occured during measure', f)
      log(err)
    }
  }

  await delay(100)

  clockSequencer.play([{ time: 0, callback: nextBar }], {
    loopLength: duration('1'),
    tempo,
  })
}

run().catch(err => {
  log('Ouch!')
  log(err)
})

async function exitHandler() {
  musicGenerator.close()
  await delay(500)
  process.exit(0)
}

// do something when app is closing
process.on('exit', exitHandler)

// catches ctrl+c event
process.on('SIGINT', exitHandler)

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler)
process.on('SIGUSR2', exitHandler)

// catches uncaught exceptions
process.on('uncaughtException', exitHandler)
