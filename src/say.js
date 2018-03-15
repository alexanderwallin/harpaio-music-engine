#!/usr/bin/env node
const args = require('args')

const sayWatson = require('./watson.js')

args.option('pitch', 'Pitch')
args.option('sentence', 'What to say')

const { pitch, sentence } = args.parse(process.argv)

sayWatson(sentence, { pitch })
  .then(() => process.exit(0))
  .catch(() => process.exit(0))
