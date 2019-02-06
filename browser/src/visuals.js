/* global document */
const harpaFaces = {
  front: { width: 38, height: 13 },
  side: { width: 39, height: 9 },
}

const $canvas = document.querySelector('#visuals')

$canvas.width = harpaFaces.front.width + harpaFaces.side.width
$canvas.height = harpaFaces.front.height + harpaFaces.side.height

const SPEECH_METER_HEIGHT = 2

const context = $canvas.getContext('2d')

function updateVisuals(musicLoudness, speechLoudness) {
  const whiteAmount = Math.round(Math.min(255, musicLoudness * 2 * 255))
  context.fillStyle = `rgb(${whiteAmount}, ${whiteAmount}, ${whiteAmount})`
  context.fillRect(0, 0, $canvas.width, $canvas.height)

  const speechMeterWidth = $canvas.width * speechLoudness
  context.fillStyle = '#fff'
  context.fillRect(
    $canvas.width / 2 - speechMeterWidth / 2,
    $canvas.height / 2 - SPEECH_METER_HEIGHT / 2,
    speechMeterWidth,
    SPEECH_METER_HEIGHT
  )
}

module.exports.updateVisuals = updateVisuals
