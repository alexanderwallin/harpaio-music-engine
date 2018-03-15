const fs = require('fs')
const path = require('path')

const R = require('../lib/recurrentjs.js')
const { Mood } = require('./constants.js')

const modelJson_AnEverydayGirl = require('./models/learn-text-r-model-aneverydaygirl-1521032825508.json')
const modelJson_Frankenstein = require('./models/learn-text-r-model-frankenstein-1521033647318.json')
const modelJson_InspirationalQuotes = require('./models/learn-text-r-model-inspirational-1521130303308.json')
const modelJson_SenseAndSensibility = require('./models/learn-text-r-model-aneverydaygirl-1521032825508.json')

const inputText_AnEverydayGirl = fs.readFileSync(
  path.resolve(__dirname, './data/An Everyday Girl.txt'),
  'utf8'
)
const inputText_Frankenstein = fs.readFileSync(
  path.resolve(__dirname, './data/Frankenstein.txt'),
  'utf8'
)
const inputText_InspirationalQuotes = fs.readFileSync(
  path.resolve(__dirname, './data/inspirational-quotes.txt'),
  'utf8'
)
const inputText_SenseAndSensibility = fs.readFileSync(
  path.resolve(__dirname, './data/Sense and Sensibility.txt'),
  'utf8'
)

function createPoet(modelJson, inputText) {
  // prediction params
  let sample_softmax_temperature = 0.4 // how peaky model predictions should be
  let max_chars_gen = 50 // max length of generated sentences

  // various global var inits
  let epoch_size = -1
  let input_size = -1
  let output_size = -1
  let letterToIndex = {}
  let indexToLetter = {}
  let vocab = []
  let data_sents = []
  let solver = new R.Solver() // should be class because it needs memory for step caches
  // let pplGraph = new Rvis.Graph()
  let model = {}

  // missing declarations in exmaple
  let hidden_sizes = [20, 20]
  let letter_size = 5
  let generator = 'lstm'

  // optimization
  let regc = 0.000001 // L2 regularization strength
  let learning_rate = 0.01 // learning rate
  let clipval = 5.0 // clip gradients at this value

  let initVocab = function(sents, count_threshold) {
    // go over all characters and keep track of all unique ones seen
    let txt = sents.join('') // concat all
    // count up all characters
    let d = {}
    for (var i = 0, n = txt.length; i < n; i++) {
      let txti = txt[i]
      if (txti in d) {
        d[txti] += 1
      } else {
        d[txti] = 1
      }
    }
    // filter by count threshold and create pointers
    letterToIndex = {}
    indexToLetter = {}
    vocab = []
    // NOTE: start at one because we will have START and END tokens!
    // that is, START token will be index 0 in model letter vectors
    // and END token will be index 0 in the next character softmax
    let q = 1
    for (ch in d) {
      if (d.hasOwnProperty(ch)) {
        if (d[ch] >= count_threshold) {
          // add character to vocab
          letterToIndex[ch] = q
          indexToLetter[q] = ch
          vocab.push(ch)
          q++
        }
      }
    }
    // globals written: indexToLetter, letterToIndex, vocab (list), and:
    input_size = vocab.length + 1
    output_size = vocab.length + 1
    epoch_size = sents.length
    console.log(
      'found ' + vocab.length + ' distinct characters: ' + vocab.join('')
    )
  }

  let utilAddToModel = function(modelto, modelfrom) {
    for (var k in modelfrom) {
      if (modelfrom.hasOwnProperty(k)) {
        // copy over the pointer but change the key to use the append
        modelto[k] = modelfrom[k]
      }
    }
  }

  let initModel = function() {
    // letter embedding vectors
    let model = {}
    model['Wil'] = new R.RandMat(input_size, letter_size, 0, 0.08)

    if (generator === 'rnn') {
      let rnn = R.initRNN(letter_size, hidden_sizes, output_size)
      utilAddToModel(model, rnn)
    } else {
      let lstm = R.initLSTM(letter_size, hidden_sizes, output_size)
      utilAddToModel(model, lstm)
    }
    return model
  }

  // let reinit_learning_rate_slider = function() {
  //   // init learning rate slider for controlling the decay
  //   // note that learning_rate is a global variable
  //   $('#lr_slider').slider({
  //     min: Math.log10(0.01) - 3.0,
  //     max: Math.log10(0.01) + 0.05,
  //     step: 0.05,
  //     value: Math.log10(learning_rate),
  //     slide: function(event, ui) {
  //       learning_rate = Math.pow(10, ui.value)
  //       $('#lr_text').text(learning_rate.toFixed(5))
  //     },
  //   })
  //   $('#lr_text').text(learning_rate.toFixed(5))
  // }
  let reinit = function(input_text) {
    // note: reinit writes global vars

    // eval options to set some globals
    // eval($('#newnet').val())
    // reinit_learning_rate_slider()
    solver = new R.Solver() // reinit solver
    // pplGraph = new Rvis.Graph()
    ppl_list = []
    tick_iter = 0
    // process the input, filter out blanks
    // let data_sents_raw = $('#ti')
    //   .val()
    //   .split('\n')
    let data_sents_raw = input_text
      // .toLowerCase()
      // .split('\n')
      // .reduce((aggr, block) => aggr.concat(block.split('.').map(x => x.trim())))
      .split('\n')
    data_sents = []
    for (var i = 0; i < data_sents_raw.length; i++) {
      let sent = data_sents_raw[i].trim()
      if (sent.length > 0) {
        data_sents.push(sent)
      }
    }
    initVocab(data_sents, 1) // takes count threshold for characters
    model = initModel()
  }

  let saveModel = function() {
    let out = {}
    out['hidden_sizes'] = hidden_sizes
    out['generator'] = generator
    out['letter_size'] = letter_size
    let model_out = {}
    for (var k in model) {
      if (model.hasOwnProperty(k)) {
        model_out[k] = model[k].toJSON()
      }
    }
    out['model'] = model_out
    let solver_out = {}
    solver_out['decay_rate'] = solver.decay_rate
    solver_out['smooth_eps'] = solver.smooth_eps
    step_cache_out = {}
    for (var k in solver.step_cache) {
      if (solver.step_cache.hasOwnProperty(k)) {
        step_cache_out[k] = solver.step_cache[k].toJSON()
      }
    }
    solver_out['step_cache'] = step_cache_out
    out['solver'] = solver_out
    out['letterToIndex'] = letterToIndex
    out['indexToLetter'] = indexToLetter
    out['vocab'] = vocab
    // $('#tio').val(JSON.stringify(out))
    console.log('model:', out)

    fs.writeFileSync(
      `models/learn-text-r-model-${output}-${Date.now()}.json`,
      JSON.stringify(out)
    )
  }

  let loadModel = function(j) {
    hidden_sizes = j.hidden_sizes
    generator = j.generator
    letter_size = j.letter_size
    model = {}
    for (var k in j.model) {
      if (j.model.hasOwnProperty(k)) {
        let matjson = j.model[k]
        model[k] = new R.Mat(1, 1)
        model[k].fromJSON(matjson)
      }
    }
    solver = new R.Solver() // have to reinit the solver since model changed
    solver.decay_rate = j.solver.decay_rate
    solver.smooth_eps = j.solver.smooth_eps
    solver.step_cache = {}
    for (var k in j.solver.step_cache) {
      if (j.solver.step_cache.hasOwnProperty(k)) {
        let matjson = j.solver.step_cache[k]
        solver.step_cache[k] = new R.Mat(1, 1)
        solver.step_cache[k].fromJSON(matjson)
      }
    }
    letterToIndex = j['letterToIndex']
    indexToLetter = j['indexToLetter']
    vocab = j['vocab']
    // reinit these
    ppl_list = []
    tick_iter = 0
  }

  let forwardIndex = function(G, model, ix, prev) {
    let x = G.rowPluck(model['Wil'], ix)
    let out_struct
    // forward prop the sequence learner
    if (generator === 'rnn') {
      out_struct = R.forwardRNN(G, model, hidden_sizes, x, prev)
    } else {
      out_struct = R.forwardLSTM(G, model, hidden_sizes, x, prev)
    }
    return out_struct
  }

  let predictSentence = function(model, samplei, temperature) {
    if (typeof samplei === 'undefined') {
      samplei = false
    }
    if (typeof temperature === 'undefined') {
      temperature = 1.0
    }

    let G = new R.Graph(false)
    let s = ''
    let prev = {}
    while (true) {
      // RNN tick
      let ix = s.length === 0 ? 0 : letterToIndex[s[s.length - 1]]
      let lh = forwardIndex(G, model, ix, prev)
      prev = lh

      // sample predicted letter
      logprobs = lh.o
      if (temperature !== 1.0 && samplei) {
        // scale log probabilities by temperature and renormalize
        // if temperature is high, logprobs will go towards zero
        // and the softmax outputs will be more diffuse. if temperature is
        // very low, the softmax outputs will be more peaky
        for (var q = 0, nq = logprobs.w.length; q < nq; q++) {
          logprobs.w[q] /= temperature
        }
      }
      probs = R.softmax(logprobs)
      if (samplei) {
        ix = R.samplei(probs.w)
      } else {
        ix = R.maxi(probs.w)
      }

      if (ix === 0) {
        break // END token predicted, break out
      }
      if (s.length > max_chars_gen) {
        break
      } // something is wrong
      let letter = indexToLetter[ix]
      s += letter
    }
    return s
  }
  let costfun = function(model, sent) {
    // takes a model and a sentence and
    // calculates the loss. Also returns the Graph
    // object which can be used to do backprop
    let n = sent.length
    let G = new R.Graph()
    let log2ppl = 0.0
    let cost = 0.0
    let prev = {}
    for (var i = -1; i < n; i++) {
      // start and end tokens are zeros
      let ix_source = i === -1 ? 0 : letterToIndex[sent[i]] // first step: start with START token
      let ix_target = i === n - 1 ? 0 : letterToIndex[sent[i + 1]] // last step: end with END token
      lh = forwardIndex(G, model, ix_source, prev)
      prev = lh
      // set gradients into logprobabilities
      logprobs = lh.o // interpret output as logprobs
      probs = R.softmax(logprobs) // compute the softmax probabilities
      log2ppl += -Math.log2(probs.w[ix_target]) // accumulate base 2 log prob and do smoothing
      cost += -Math.log(probs.w[ix_target])
      // write gradients into log probabilities
      logprobs.dw = probs.w
      logprobs.dw[ix_target] -= 1
    }
    let ppl = Math.pow(2, log2ppl / (n - 1))
    return { G: G, ppl: ppl, cost: cost }
  }
  function median(values) {
    values.sort(function(a, b) {
      return a - b
    })
    let half = Math.floor(values.length / 2)
    if (values.length % 2) return values[half]
    else return (values[half - 1] + values[half]) / 2.0
  }
  let ppl_list = []
  let tick_iter = 0

  let tick = function() {
    // sample sentence fromd data
    let sentix = R.randi(0, data_sents.length)
    let sent = data_sents[sentix]
    let t0 = +new Date() // log start timestamp
    // evaluate cost function on a sentence
    let cost_struct = costfun(model, sent)

    // use built up graph to compute backprop (set .dw fields in mats)
    cost_struct.G.backward()
    // perform param update
    let solver_stats = solver.step(model, learning_rate, regc, clipval)
    //$("#gradclip").text('grad clipped ratio: ' + solver_stats.ratio_clipped)
    let t1 = +new Date()
    let tick_time = t1 - t0
    ppl_list.push(cost_struct.ppl) // keep track of perplexity
    // evaluate now and then
    tick_iter += 1
    if (tick_iter % 50 === 0) {
      // draw samples
      // $('#samples').html('')
      console.log('epoch: ' + (tick_iter / epoch_size).toFixed(2))
      console.log('perplexity: ' + cost_struct.ppl.toFixed(2))
      console.log('forw/bwd time per example: ' + tick_time.toFixed(1) + 'ms')
      for (var q = 0; q < 5; q++) {
        let pred = predictSentence(model, true, sample_softmax_temperature)
        // let pred_div = '<div class="apred">' + pred + '</div>'
        // $('#samples').append(pred_div)
        console.log('pred:', pred)
      }
    }
    if (tick_iter % 10 === 0) {
      // draw argmax prediction
      // $('#argmax').html('')
      // let pred = predictSentence(model, false)
      // let pred_div = '<div class="apred">' + pred + '</div>'
      // $('#argmax').append(pred_div)
      // console.log('pred:', pred)

      // keep track of perplexity
      if (tick_iter % 100 === 0) {
        let median_ppl = median(ppl_list)
        ppl_list = []
        // pplGraph.add(tick_iter, median_ppl)
        // pplGraph.drawSelf(document.getElementById('pplgraph'))
      }
    }
  }

  let gradCheck = function() {
    let model = initModel()
    let sent = '^test sentence$'
    let cost_struct = costfun(model, sent)
    cost_struct.G.backward()
    let eps = 0.000001
    for (var k in model) {
      if (model.hasOwnProperty(k)) {
        let m = model[k] // mat ref
        for (var i = 0, n = m.w.length; i < n; i++) {
          oldval = m.w[i]
          m.w[i] = oldval + eps
          let c0 = costfun(model, sent)
          m.w[i] = oldval - eps
          let c1 = costfun(model, sent)
          m.w[i] = oldval
          let gnum = (c0.cost - c1.cost) / (2 * eps)
          let ganal = m.dw[i]
          let relerr = (gnum - ganal) / (Math.abs(gnum) + Math.abs(ganal))
          if (relerr > 1e-1) {
            console.log(
              k +
                ': numeric: ' +
                gnum +
                ', analytic: ' +
                ganal +
                ', err: ' +
                relerr
            )
          }
        }
      }
    }
  }
  let iid = null

  reinit(inputText)
  loadModel(modelJson)

  return {
    predict: numChars => {
      max_chars_gen = numChars
      const sentence = predictSentence(model, true, sample_softmax_temperature)
        .trim()
        .replace(/\s\w$/, '')
        .replace(/(of|the)$/, '')
      return sentence
    },
  }
}

const poetNeutral = createPoet(
  modelJson_AnEverydayGirl,
  inputText_AnEverydayGirl
)
const poetPositive = createPoet(
  modelJson_SenseAndSensibility,
  inputText_SenseAndSensibility
)
const poetNegative = createPoet(modelJson_Frankenstein, inputText_Frankenstein)

const poetInspirational = createPoet(
  modelJson_InspirationalQuotes,
  inputText_InspirationalQuotes
)

function getSentence(mood, numChars = 40) {
  // if (mood === Mood.NEUTRAL) {
  //   return poetNeutral.predict(numChars)
  // }
  // if (mood === Mood.POSITIVE) {
  //   return poetPositive.predict(numChars)
  // }
  // if (mood === Mood.NEGATIVE) {
  //   return poetNegative.predict(numChars)
  // }

  // return null

  return poetInspirational.predict(numChars)
}

module.exports.getSentence = getSentence
