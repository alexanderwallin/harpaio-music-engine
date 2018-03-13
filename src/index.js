// eslint-disable-next-line
require = require('@std/esm')(module, { mode: 'js' })

const args = require('args')
const { flatten, random, shuffle } = require('lodash')
const duration = require('note-duration')
const { midi, Note, transpose } = require('tonal')
const Sequencer = require('um-sequencer').default

const relayCc = require('./cc-relays.js')
const { Arousal, Mood } = require('./constants.js')
const device = require('./midi-device.js')
const {
  getActivity,
  getSentiment,
  startSentimentQuerying,
} = require('./sentiment.js')

// CLI options
args.option('channels', 'A comma-separated list of channels to listen to')
args.option('controls', 'A comma-separated list of control IDs to listen to')
args.option('relay-device', 'What MIDI device to relay CC from')
args.option('tempo', 'Tempo in bpm', 120)
args.option('verbose', 'Log stuff to console', false)

const { channels, controls, relayDevice, tempo, verbose } = args.parse(
  process.argv
)

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
  [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
]

const hihatPatterns = [
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1],
  [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1],
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

function createSequencer(dawnOfTime) {
  return new Sequencer(() => (Date.now() - dawnOfTime) / 1000, {
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

async function run() {
  startSentimentQuerying(500)
  await relayCc({
    channels: channelsArray,
    controlIds: resolvedControlIds,
    device: relayDevice,
  })

  let f = -1
  let rootKey = 'C4'
  let chord = [rootKey]
  let lastChord = []
  let bassline = []
  let basslineHitOrder = []
  let bassSequence = []
  let mood = null
  let arousal = Arousal.PASSIVE
  let relativeActivity = 0

  const startTime = Date.now()
  const clockSequencer = createSequencer(startTime)
  const soloNoteSequencer = createSequencer(startTime)
  const drumSequencer = createSequencer(startTime)
  const bassSequencer = createSequencer(startTime)
  const kickSequencer = createSequencer(startTime)
  const hihatSequencer = createSequencer(startTime)

  // Update chords
  function updateChord() {
    if (f % 24 === 23) {
      // Perform mediantic transposition in the same mood
      log('--- change key ---')
      const medians = ['M-3', 'm-3', '3m', '3M']
      const median = pickRandom(medians)
      rootKey = Note.fromMidi(midi(transpose(rootKey, median)))
    }

    const sentiment = getSentiment()
    arousal = sentiment.arousal // eslint-disable-line
    mood = sentiment.mood // eslint-disable-line

    lastChord = [...chord]
    chord = getChord(mood, arousal, rootKey)
  }

  // Play chords
  function playChords() {
    if (f % 2 === 1) {
      return
    }

    const allChordChannels = [0, 5]
    const chordChannels = arousal === Arousal.PASSIVE ? [0] : [0, 5]

    allChordChannels.forEach(channel => {
      lastChord.forEach(note =>
        device.send('noteoff', {
          channel,
          note: midi(note),
        })
      )
    })

    chordChannels.forEach(channel => {
      chord.forEach(note =>
        device.send('noteon', {
          channel,
          note: midi(note),
          velocity:
            flatten([majorColoringIntervals, minorColoringIntervals]).includes(
              note
            ) === true
              ? random(10, 40)
              : random(60, 100),
        })
      )
    })

    log(`${mood} (${arousal}) - ${rootKey}: [${chord.join(', ')}]`)
  }

  // Play solo note
  function playSoloNotes() {
    if (arousal === Arousal.PASSIVE) {
      return
    }

    const soloNotes = shuffle(chord)
      .slice(0, Math.round(relativeActivity * chord.length))
      .map(note => transpose(note, '8P'))
      .map(note => transpose(note, arousal === Arousal.ACTIVE ? '8P' : '1P'))
    const soloNoteDurations = soloNotes.map(() => pickRandom(['16', '8']))
    const soloNoteDelay = pickRandom(['16', '8', '4'].map(duration).concat(0))

    const scheduledSoloNotes = soloNotes.map((note, i) => ({
      time: soloNoteDurations
        .slice(0, i)
        .map(x => duration(x))
        .reduce((aggr, x) => aggr + x, soloNoteDelay + 0.05),
      callback: async () => {
        device.send('noteon', {
          channel: 1,
          note: midi(note),
          velocity: random(50, 100),
        })

        log(`+ ${note}`)

        await delay(1000 * (60 / tempo) / 8)
        device.send('noteoff', {
          channel: 1,
          note: midi(note),
        })
      },
    }))

    soloNoteSequencer.play(scheduledSoloNotes, { tempo })
  }

  function playDrums() {
    if (arousal === Arousal.PASSIVE) {
      return
    }

    const patterns = [0, 1, 2].map(() =>
      new Array(16).fill(0).map(() => Math.random() <= relativeActivity / 4)
    )

    log(
      patterns
        .map(pattern => pattern.map(x => (x ? 'x' : '-')).join(''))
        .join('\n')
    )

    const sequences = patterns.map((pattern, patternIdx) =>
      pattern.map((hit, i) => ({
        time: i * 1 / 16 + 0.05,
        callback: async () => {
          const note = midi('C#2') + patternIdx

          if (hit === true) {
            device.send('noteon', {
              channel: 2,
              note,
              velocity: random(20, 100),
            })
            await delay(1)
            device.send('noteoff', {
              channel: 2,
              note,
            })
          }
        },
      }))
    )
    drumSequencer.play(flatten(sequences), { tempo })
  }

  function playBass() {
    if (f % 8 === 0) {
      const shuffledChord = shuffle(chord)
      bassline = new Array(16)
        .fill(0)
        .map((x, i) => shuffledChord[i % shuffledChord.length])
        .map(note => transpose(note, 'P-8'))
        .map(note => transpose(note, 'P-8'))
      bassline[0] = transpose(transpose(rootKey, 'P-8'), 'P-8')

      basslineHitOrder = shuffle(new Array(16).fill(0).map((x, i) => i))
    }

    if (arousal === Arousal.PASSIVE) {
      return
    }

    const numNotes = Math.round(relativeActivity * 16)
    const bassHits = basslineHitOrder.slice(0, numNotes)
    // log({ bassHits })
    const rhythm = new Array(16).fill(0).map((x, i) => bassHits.includes(i))
    // log({ rhythm })
    // rhythm[0] = 1

    bassSequence = rhythm.reduce(
      (aggr, isOn, i) =>
        isOn
          ? [
              ...aggr,
              {
                time: duration('16') * i + 0.05,
                callback: async () => {
                  device.send('noteon', {
                    channel: 3,
                    note: midi(bassline[i]),
                    velocity: random(75, 120),
                  })
                  await delay(1000 * duration('32'))
                  device.send('noteoff', {
                    channel: 3,
                    note: midi(bassline[i]),
                  })
                },
              },
            ]
          : aggr,
      []
    )

    log({ bassline })
    log(
      rhythm
        .map((isOn, i) => (isOn ? bassline[i].padStart(3, ' ') + ' ' : ' ·· '))
        .join('')
    )

    // log({ bassSequence })
    bassSequencer.play(bassSequence, { tempo })
  }

  function playKick() {
    if (arousal !== Arousal.ACTIVE) {
      return
    }

    const kickPattern = kickSequences[Math.floor(f / 6) % kickSequences.length]
    const kickSequence = kickPattern
      .map(
        (isOn, i) =>
          isOn
            ? {
                time: duration('16') * i + 0.05,
                callback: async () => {
                  device.send('noteon', {
                    channel: 4,
                    note: midi('C2'),
                    velocity: 100,
                  })
                  await delay(1)
                  device.send('noteon', {
                    channel: 4,
                    note: midi('C2'),
                  })
                },
              }
            : null
      )
      .filter(x => x !== null)

    kickSequencer.play(kickSequence, { tempo })
  }

  function playHihat() {
    if (arousal !== Arousal.ACTIVE) {
      return
    }

    const pattern =
      hihatPatterns[Math.floor(relativeActivity * hihatPatterns.length)]
    const sequences = pattern
      .map(
        (isOn, i) =>
          isOn
            ? {
                time: duration('16') * i + 0.05,
                callback: async () => {
                  const channel = 6
                  const note = midi('C2') + Math.floor(f / 12) % 2
                  device.send('noteon', { channel, note, velocity: 100 })
                  await delay(100)
                  device.send('noteoff', { channel, note })
                },
              }
            : null
      )
      .filter(x => x)
    hihatSequencer.play(sequences, { tempo })
  }

  function nextBar() {
    f += 1

    try {
      const activityInfo = getActivity()
      relativeActivity =
        activityInfo.meta === undefined
          ? 0
          : activityInfo.data.length / (activityInfo.meta.numControls - 1)

      updateChord()
      playChords()
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
  device.close()
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
