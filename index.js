const { flatten, intersection, random, shuffle, values } = require('lodash')
const { midi, Note, transpose } = require('tonal')

const device = require('./midi-device.js')

const duration = parseInt(process.argv[2]) || 2000

const Arousal = {
  ACTIVE: 'ACTIVE',
  NEUTRAL: 'NEUTRAL',
  PASSIVE: 'PASSIVE',
}

const Mood = {
  POSITIVE: 'POSITIVE',
  NEUTRAL: 'NEUTRAL',
  NEGATIVE: 'NEGATIVE',
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pickRandom(arr) {
  return shuffle(arr)[0]
}

function getArousal(frame) {
  const idx = Math.floor(frame / 5) % 3
  return values(Arousal)[idx]
}

function getMood(frame) {
  const idx = Math.floor(frame / 3) % 3
  return values(Mood)[idx]
}

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

let f = 0
let rootKey = 'C4'
let lastChord = []

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
  let f = 0
  let rootKey = 'C4'
  let chord = [rootKey]
  let lastChord = []
  let lastSoloNote = null
  let mood = null
  let arousal = Arousal.PASSIVE

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
    arousal = getArousal(f)

    lastChord = [...chord]
    chord = getChord(mood, arousal, rootKey)
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
    console.log(`${mood} (${arousal}) - ${rootKey}: [${chord.join(', ')}]`)
  }, duration)

  // Play solo note
  function playSoloNote() {
    const soloNoteDurations = {
      [Arousal.ACTIVE]: duration / 4,
      [Arousal.NEUTRAL]: duration / 2,
      [Arousal.PASSIVE]: duration,
    }

    const soloNote = transpose(
      transpose(pickRandom(chord), '8P'),
      arousal === Arousal.ACTIVE ? '8P' : '1P'
    )
    device.send('noteoff', { channel: 1, note: midi(lastSoloNote) })
    device.send('noteon', {
      channel: 1,
      note: midi(soloNote),
      velocity: random(50, 100),
    })

    lastSoloNote = soloNote
    console.log(`+ ${soloNote}`)

    setTimeout(playSoloNote, soloNoteDurations[arousal])
  }
  playSoloNote()
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
