/* global fetch, window, XMLHttpRequest */
require('isomorphic-fetch')

function fetchToken() {
  return fetch('http://localhost:8221/watson-token')
    .then(response => response.json())
    .then(({ data }) => data)
}

function fetchSentenceAudio(sentence) {
  return new Promise(resolve => {
    const url = `http://localhost:8221/speech?sentence=${window.encodeURIComponent(
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
