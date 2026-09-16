import vectorPlayground from './vectorPlayground.js'
import matrixTransform from './matrixTransform.js'
import gradientDescent from './gradientDescent.js'
import attentionTeaser from './attentionTeaser.js'
import attentionFlow from './attentionFlow.js'
import multiHead from './multiHead.js'
import ropeClock from './ropeClock.js'
import samplingPlayground from './samplingPlayground.js'
import kvCache from './kvCache.js'
import parallelismRack from './parallelismRack.js'
import moeRouter from './moeRouter.js'
import scalingSurface from './scalingSurface.js'
import trainingRun from './trainingRun.js'
import superposition from './superposition.js'
import inductionCircuit from './inductionCircuit.js'
import loraRank from './loraRank.js'
import cacheCompare from './cacheCompare.js'
import roofline from './roofline.js'

// Each entry: (stageEl, controlsEl) => disposeFn
export const VIZ_REGISTRY = {
  'vector-playground': vectorPlayground,
  'matrix-transform': matrixTransform,
  'gradient-descent': gradientDescent,
  'attention-teaser': attentionTeaser,
  'attention-flow': attentionFlow,
  'multi-head': multiHead,
  'rope-clock': ropeClock,
  'sampling-playground': samplingPlayground,
  'kv-cache': kvCache,
  'parallelism-rack': parallelismRack,
  'moe-router': moeRouter,
  'scaling-surface': scalingSurface,
  'training-run': trainingRun,
  'superposition': superposition,
  'induction-circuit': inductionCircuit,
  'lora-rank': loraRank,
  'cache-compare': cacheCompare,
  'roofline': roofline,
}
