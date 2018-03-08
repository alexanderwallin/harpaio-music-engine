const { flatten, intersection, random, shuffle } = require('lodash')
const { midi, Note, transpose } = require('tonal')

const device = require('./midi-device.js')

const duration = parseInt(process.argv[2]) || 2000

const Mood = {
  POSITIVE: 'POSITIVE',
  NEGATIVE: 'NEGATIVE',
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pickRandom(arr) {
  return shuffle(arr)[0]
}

function getMood(frame) {
  const idx = Math.floor(frame / 3) % 2
  return idx === 0 ? Mood.NEGATIVE : Mood.POSITIVE
}

const majorIntervals = ['1P', '3M', '5P']
const minorIntervals = ['1P', '3m', '5P']

const majorRootKeys = ['1P', '4P', '5P']
const minorRootKeys = ['2M', '3M', '6M']

const majorColoringIntervals = ['7M', '9M']
const minorColoringIntervals = ['7m', '9M']

let f = 0
let rootKey = 'C4'
let lastChord = []

function getChord(mood, rootKey) {
  // Get key
  const chordKey =
    mood === Mood.POSITIVE
      ? majorRootKeys[random(majorRootKeys.length - 1)]
      : minorRootKeys[random(minorRootKeys.length - 1)]

  // Get the chord intervals for the key
  const chordIntervals =
    mood === Mood.POSITIVE ? majorIntervals : minorIntervals

  // Select extra colorings
  const coloringIntervals = shuffle(
    mood === Mood.POSITIVE ? majorColoringIntervals : minorColoringIntervals
  )
  const appliedColoringIntervals = coloringIntervals.slice(
    0,
    random(majorColoringIntervals.length - 1)
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
  let f = 0
  let rootKey = 'C4'
  let chord = [rootKey]
  let lastChord = []
  let lastSoloNote = null
  let mood = null

  await delay(100)

  // Update chords
  setInterval(() => {
    if (f % 12 === 11) {
      // Perform mediantic transposition in the same mood
      console.log('--- change key ---')
      const medians = ['M-3', 'm-3', '3m', '3M']
      const median = pickRandom(medians)
      rootKey = Note.fromMidi(midi(transpose(rootKey, median)))
    } else {
      // Update mood
      mood = getMood(f)
    }

    lastChord = [...chord]
    chord = getChord(mood, rootKey)
    f++
  }, duration)

  // Play chords
  setInterval(() => {
    // Play chord
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
    console.log(mood, rootKey, `[${chord.join(', ')}]`)
  }, duration)

  // Play solo note
  setInterval(() => {
    const soloNote = transpose(pickRandom(chord), '8P')
    device.send('noteoff', { channel: 1, note: midi(lastSoloNote) })
    device.send('noteon', {
      channel: 1,
      note: midi(soloNote),
      velocity: random(50, 100),
    })

    lastSoloNote = soloNote
    console.log(`+ ${soloNote}`)
  }, duration / 2)
}

run()

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
