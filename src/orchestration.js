const duration = require('note-duration')
const { flatten, random, shuffle } = require('lodash')
const { transpose } = require('tonal')

const { Arousal, Mood } = require('./constants.js')
const { pickRandom } = require('./utils.js')

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

function getMelodyNotes(mood, arousal, relativeActivity, chord) {
  const notes = shuffle(chord)
    .slice(0, Math.round(relativeActivity * chord.length))
    .map(note => transpose(note, '8P'))
    .map(note => transpose(note, arousal === Arousal.ACTIVE ? '8P' : '1P'))
  const durations = notes.map(() => pickRandom(['16', '8']))
  const delay = pickRandom(['16', '8', '4'].map(duration).concat(0))

  return { notes, durations, delay }
}

function getNoteVelocityByColor(note) {
  return flatten([majorColoringIntervals, minorColoringIntervals]).includes(
    note
  ) === true
    ? random(10, 40)
    : random(60, 100)
}

module.exports.getChord = getChord
module.exports.getMelodyNotes = getMelodyNotes
module.exports.getNoteVelocityByColor = getNoteVelocityByColor
