/* global fetch, window, XMLHttpRequest */
require('isomorphic-fetch')

const { API_HOSTNAME } = require('./configs.js')

function fetchToken() {
  return fetch(`http://${API_HOSTNAME}/watson-token`)
    .then(response => response.json())
    .then(({ data }) => data)
}

function fetchSentenceAudio(sentence) {
  return new Promise(resolve => {
    const url = `http://${API_HOSTNAME}/speech?sentence=${window.encodeURIComponent(
      sentence
    )}`
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'arraybuffer'
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        resolve(xhr.response)
      }
    }
    xhr.send()
  })
}

module.exports.fetchToken = fetchToken
module.exports.fetchSentenceAudio = fetchSentenceAudio
