require = require('@std/esm')(module, { mode: 'js' })

const { flatten, intersection, random, shuffle, values } = require('lodash')
const duration = require('note-duration')
const { midi, Note, transpose } = require('tonal')
const Sequencer = require('um-sequencer').default

const { Arousal, Mood } = require('./constants.js')
const device = require('./midi-device.js')
const { getSentiment, startSentimentQuerying } = require('./sentiment.js')

const tempo = parseInt(process.argv[2]) || 120

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

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pickRandom(arr) {
  return shuffle(arr)[0]
}

function createSequencer(dawnOfTime) {
  return new Sequencer(() => (Date.now() - dawnOfTime) / 1000, {
    useWorker: false,
  })
}

function getArousal() {
  return globalArousal
}

function getMood() {
  return globalMood
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
  startSentimentQuerying()

  let f = 0
  let rootKey = 'C4'
  let chord = [rootKey]
  let lastChord = []
  let mood = null
  let arousal = Arousal.PASSIVE

  const startTime = Date.now()
  const clockSequencer = createSequencer(startTime)
  const chordsSequencer = createSequencer(startTime)
  const soloNoteSequencer = createSequencer(startTime)
  const drumSequencer = createSequencer(startTime)

  function nextBar() {
    updateChord()
    playChords()
    playSoloNotes()
    playDrums()
  }

  // Update chords
  function updateChord() {
    if (f % 12 === 11) {
      // Perform mediantic transposition in the same mood
      console.log('--- change key ---')
      const medians = ['M-3', 'm-3', '3m', '3M']
      const median = pickRandom(medians)
      rootKey = Note.fromMidi(midi(transpose(rootKey, median)))
    }

    const sentiment = getSentiment()
    arousal = sentiment.arousal
    mood = sentiment.mood

    lastChord = [...chord]
    chord = getChord(mood, arousal, rootKey)
    f++
  }

  // Play chords
  function playChords() {
    lastChord.forEach(note =>
      device.send('noteoff', {
        channel: 0,
        note: midi(note),
      })
    )

    chord.forEach(note =>
      device.send('noteon', {
        channel: 0,
        note: midi(note),
        velocity:
          flatten([majorColoringIntervals, minorColoringIntervals]).includes(
            note
          ) === true
            ? random(10, 40)
            : random(60, 100),
      })
    )

    console.log(`${mood} (${arousal}) - ${rootKey}: [${chord.join(', ')}]`)
  }

  // Play solo note
  function playSoloNotes() {
    const soloNoteCounts = {
      [Arousal.ACTIVE]: 3,
      [Arousal.NEUTRAL]: 1,
      [Arousal.PASSIVE]: 0,
    }

    const soloNotes = shuffle(chord)
      .slice(0, soloNoteCounts[arousal])
      .map(note => transpose(note, '8P'))
      .map(note => transpose(note, arousal === Arousal.ACTIVE ? '8P' : '1P'))
    const soloNoteDurations = soloNotes.map(() => pickRandom(['16', '8']))
    const soloNoteDelay = pickRandom(['16', '8', '4'].map(duration).concat(0))

    const scheduledSoloNotes = soloNotes.map((note, i) => ({
      time: soloNoteDurations
        .slice(0, i)
        .map(x => duration(x))
        .reduce((aggr, x) => aggr + x, 0.01 + soloNoteDelay),
      callback: async () => {
        device.send('noteon', {
          channel: 1,
          note: midi(note),
          velocity: random(50, 100),
        })

        console.log(`+ ${note}`)

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
    const noteProbability = {
      [Arousal.ACTIVE]: () => 0.3,
      [Arousal.NEUTRAL]: () => 0.1,
      [Arousal.PASSIVE]: () => 0.05,
    }

    const patterns = [0, 1, 2].map(x =>
      new Array(16)
        .fill(0)
        .map(() => Math.random() <= noteProbability[arousal]())
    )

    console.log(
      patterns
        .map(pattern => pattern.map(x => (x ? 'x' : '-')).join(''))
        .join('\n')
    )

    const sequences = patterns.map((pattern, patternIdx) =>
      pattern.map((hit, i) => ({
        time: i * 1 / 16 + 0.01,
        callback: async () => {
          const note = midi('C2') + patternIdx

          if (hit === true) {
            device.send('noteon', {
              channel: 2,
              note: note,
              velocity: random(20, 100),
            })
            await delay(1)
            device.send('noteoff', {
              channel: 2,
              note: note,
            })
          }
        },
      }))
    )
    drumSequencer.play(flatten(sequences), { tempo })
  }

  await delay(100)

  clockSequencer.play([{ time: 0, callback: nextBar }], {
    loopLength: duration('1'),
    tempo,
  })
}

run().catch(err => {
  console.log('Ouch!')
  console.log(err)
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
