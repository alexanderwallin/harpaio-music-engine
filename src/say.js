#!/usr/bin/env node
const args = require('args')

const sayWatson = require('./watson.js')

args.option('sentence', 'What to say')

const { sentence } = args.parse(process.argv)

sayWatson(sentence)
  .then(() => process.exit(0))
  .catch(() => process.exit(0))
