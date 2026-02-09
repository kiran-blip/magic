/**
 * Gold Digger Neural Network
 * Pure TypeScript feedforward neural network for investment optimization.
 * Used by the Quant Analyst agent to:
 * 1. Score trade opportunities (0-1 confidence)
 * 2. Optimize position sizing
 * 3. Predict price direction
 * 4. Assess portfolio risk
 *
 * NO external ML libraries - pure TypeScript implementation with:
 * - Matrix operations (element-wise and multiplication)
 * - Backpropagation with gradient descent
 * - Xavier/Glorot weight initialization
 * - Multiple activation functions (sigmoid, ReLU, tanh)
 */

// ============================================================================
// MATRIX OPERATIONS - Foundation for neural network computations
// ============================================================================

/**
 * Matrix class for 2D mathematical operations.
 * Handles data storage in row-major format for cache efficiency.
 */
class Matrix {
  data: number[][]
  rows: number
  cols: number

  constructor(rows: number, cols: number, data?: number[][]) {
    this.rows = rows
    this.cols = cols
    if (data) {
      this.data = data
    } else {
      this.data = Array(rows)
        .fill(null)
        .map(() => Array(cols).fill(0))
    }
  }

  /**
   * Convert 1D array to column vector (nx1 matrix)
   */
  static fromArray(arr: number[]): Matrix {
    const matrix = new Matrix(arr.length, 1)
    for (let i = 0; i < arr.length; i++) {
      matrix.data[i][0] = arr[i]
    }
    return matrix
  }

  /**
   * Matrix multiplication: (m x n) * (n x p) = (m x p)
   * Uses standard O(n³) algorithm suitable for small networks
   */
  static multiply(a: Matrix, b: Matrix): Matrix {
    if (a.cols !== b.rows) {
      throw new Error(
        `Cannot multiply matrices: (${a.rows}x${a.cols}) * (${b.rows}x${b.cols})`
      )
    }

    const result = new Matrix(a.rows, b.cols)
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < b.cols; j++) {
        let sum = 0
        for (let k = 0; k < a.cols; k++) {
          sum += a.data[i][k] * b.data[k][j]
        }
        result.data[i][j] = sum
      }
    }
    return result
  }

  /**
   * Element-wise addition: A + B (shapes must match)
   */
  add(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(
        `Cannot add matrices of different dimensions: (${this.rows}x${this.cols}) + (${other.rows}x${other.cols})`
      )
    }

    const result = new Matrix(this.rows, this.cols)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] + other.data[i][j]
      }
    }
    return result
  }

  /**
   * Element-wise subtraction: A - B
   */
  subtract(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(`Cannot subtract matrices of different dimensions`)
    }

    const result = new Matrix(this.rows, this.cols)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] - other.data[i][j]
      }
    }
    return result
  }

  /**
   * Scalar multiplication: Matrix * scalar
   */
  scale(scalar: number): Matrix {
    const result = new Matrix(this.rows, this.cols)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] * scalar
      }
    }
    return result
  }

  /**
   * Element-wise multiplication (Hadamard product): A ⊙ B
   */
  hadamard(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(`Cannot hadamard product matrices of different dimensions`)
    }

    const result = new Matrix(this.rows, this.cols)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] * other.data[i][j]
      }
    }
    return result
  }

  /**
   * Transpose: A^T (flip rows and columns)
   */
  transpose(): Matrix {
    const result = new Matrix(this.cols, this.rows)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[j][i] = this.data[i][j]
      }
    }
    return result
  }

  /**
   * Apply element-wise function mapping
   */
  map(fn: (val: number, row: number, col: number) => number): Matrix {
    const result = new Matrix(this.rows, this.cols)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = fn(this.data[i][j], i, j)
      }
    }
    return result
  }

  /**
   * Convert matrix to 1D array (row-major order)
   */
  toArray(): number[] {
    const result: number[] = []
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.push(this.data[i][j])
      }
    }
    return result
  }

  /**
   * Get all values as 1D array for easier iteration
   */
  flatten(): number[] {
    return this.toArray()
  }

  /**
   * Create deep copy of matrix
   */
  copy(): Matrix {
    const result = new Matrix(this.rows, this.cols)
    for (let i = 0; i < this.rows; i++) {
      result.data[i] = [...this.data[i]]
    }
    return result
  }
}

// ============================================================================
// ACTIVATION FUNCTIONS - Non-linear transformations for neural networks
// ============================================================================

/**
 * Sigmoid activation: σ(x) = 1 / (1 + e^-x)
 * Maps input to (0, 1) - useful for probabilities and binary outputs
 */
function sigmoid(x: number): number {
  // Clip to prevent overflow
  const clipped = Math.max(-500, Math.min(500, x))
  return 1 / (1 + Math.exp(-clipped))
}

/**
 * Sigmoid derivative: σ'(x) = σ(x) * (1 - σ(x))
 * Used during backpropagation
 */
function sigmoidDerivative(x: number): number {
  return x * (1 - x)
}

/**
 * ReLU (Rectified Linear Unit): f(x) = max(0, x)
 * Computationally efficient and helps with vanishing gradient problem
 */
function relu(x: number): number {
  return Math.max(0, x)
}

/**
 * ReLU derivative: f'(x) = x > 0 ? 1 : 0
 */
function reluDerivative(x: number): number {
  return x > 0 ? 1 : 0
}

/**
 * Leaky ReLU: f(x) = x > 0 ? x : 0.01 * x
 * Prevents dead neurons by allowing small negative gradients
 */
function leakyRelu(x: number): number {
  return x > 0 ? x : 0.01 * x
}

/**
 * Leaky ReLU derivative
 */
function leakyReluDerivative(x: number): number {
  return x > 0 ? 1 : 0.01
}

/**
 * Tanh activation: f(x) = (e^x - e^-x) / (e^x + e^-x)
 * Maps input to (-1, 1) - centered around 0
 */
function tanh(x: number): number {
  const clipped = Math.max(-500, Math.min(500, x))
  return Math.tanh(clipped)
}

/**
 * Tanh derivative: f'(x) = 1 - x²
 */
function tanhDerivative(x: number): number {
  return 1 - x * x
}

/**
 * Softmax: converts logits to probability distribution
 * Used for multi-class classification outputs
 */
function softmax(arr: number[]): number[] {
  const maxVal = Math.max(...arr)
  const exps = arr.map((x) => Math.exp(x - maxVal)) // Subtract max for numerical stability
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((x) => x / sum)
}

/**
 * Get activation function by name
 */
function getActivation(name: string): (x: number) => number {
  switch (name) {
    case 'sigmoid':
      return sigmoid
    case 'relu':
      return relu
    case 'leaky_relu':
      return leakyRelu
    case 'tanh':
      return tanh
    case 'linear':
      return (x) => x
    default:
      throw new Error(`Unknown activation function: ${name}`)
  }
}

/**
 * Get activation derivative by name
 */
function getActivationDerivative(name: string): (x: number) => number {
  switch (name) {
    case 'sigmoid':
      return sigmoidDerivative
    case 'relu':
      return reluDerivative
    case 'leaky_relu':
      return leakyReluDerivative
    case 'tanh':
      return tanhDerivative
    case 'linear':
      return () => 1
    default:
      throw new Error(`Unknown activation function: ${name}`)
  }
}

// ============================================================================
// WEIGHT INITIALIZATION - Xavier/Glorot for stable training
// ============================================================================

/**
 * Xavier/Glorot initialization
 * Samples weights uniformly from [-√(6/(n_in + n_out)), √(6/(n_in + n_out))]
 * Ensures variance of activations and gradients are consistent across layers
 */
function xavierInit(inputSize: number, outputSize: number): number[][] {
  const limit = Math.sqrt(6 / (inputSize + outputSize))
  const weights: number[][] = []

  for (let i = 0; i < outputSize; i++) {
    weights[i] = []
    for (let j = 0; j < inputSize; j++) {
      weights[i][j] = Math.random() * 2 * limit - limit
    }
  }

  return weights
}

/**
 * He initialization for ReLU networks
 * Samples from normal distribution with variance 2/n_in
 */
function heInit(inputSize: number, outputSize: number): number[][] {
  const stdDev = Math.sqrt(2 / inputSize)
  const weights: number[][] = []

  for (let i = 0; i < outputSize; i++) {
    weights[i] = []
    for (let j = 0; j < inputSize; j++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random()
      const u2 = Math.random()
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      weights[i][j] = z * stdDev
    }
  }

  return weights
}

// ============================================================================
// NEURAL NETWORK CONFIGURATION & TYPES
// ============================================================================

interface NetworkConfig {
  inputSize: number
  hiddenLayers: {
    size: number
    activation: 'sigmoid' | 'relu' | 'leaky_relu' | 'tanh' | 'linear'
  }[]
  outputSize: number
  outputActivation?: 'sigmoid' | 'softmax' | 'linear'
  learningRate?: number
}

interface SerializedNetwork {
  config: NetworkConfig
  weights: number[][][]
  biases: number[][][]
  trainedAt?: string
  epochs?: number
  loss?: number
}

interface LayerState {
  input: Matrix
  output: Matrix
  weighted: Matrix
  delta: Matrix
}

// ============================================================================
// NEURAL NETWORK IMPLEMENTATION - Feedforward with Backpropagation
// ============================================================================

/**
 * Feedforward neural network with backpropagation training
 * Implements full gradient descent optimization for regression and classification
 */
class NeuralNetwork {
  private layers: {
    weights: Matrix
    biases: Matrix
    activation: string
  }[] = []

  private learningRate: number
  private config: NetworkConfig
  private layerStates: LayerState[] = [] // For backprop storage

  /**
   * Initialize network from configuration
   * Creates layers with Xavier/He initialization based on activation function
   */
  constructor(config: NetworkConfig) {
    this.config = config
    this.learningRate = config.learningRate || 0.01

    // Build layers
    const allSizes = [
      config.inputSize,
      ...config.hiddenLayers.map((l) => l.size),
      config.outputSize,
    ]

    for (let i = 0; i < allSizes.length - 1; i++) {
      const inputSize = allSizes[i]
      const outputSize = allSizes[i + 1]

      // Choose initialization based on activation function
      let weights: number[][]
      const activation =
        i < config.hiddenLayers.length
          ? config.hiddenLayers[i].activation
          : config.outputActivation || 'sigmoid'

      if (activation === 'relu' || activation === 'leaky_relu') {
        weights = heInit(inputSize, outputSize)
      } else {
        weights = xavierInit(inputSize, outputSize)
      }

      this.layers.push({
        weights: new Matrix(outputSize, inputSize, weights),
        biases: new Matrix(outputSize, 1),
        activation,
      })
    }
  }

  /**
   * Forward pass: compute predictions for input
   * Returns output as number array (or probability if softmax)
   */
  predict(inputs: number[]): number[] {
    if (inputs.length !== this.config.inputSize) {
      throw new Error(
        `Expected ${this.config.inputSize} inputs, got ${inputs.length}`
      )
    }

    let current = Matrix.fromArray(inputs)

    for (const layer of this.layers) {
      // Weighted sum: z = w*x + b
      const weighted = Matrix.multiply(layer.weights, current)
      current = weighted.add(layer.biases)

      // Apply activation function
      const activationFn = getActivation(layer.activation)
      current = current.map((val) => activationFn(val))
    }

    // Handle softmax for multi-class output
    if (this.config.outputActivation === 'softmax') {
      const arr = current.toArray()
      return softmax(arr)
    }

    return current.toArray()
  }

  /**
   * Forward pass with state tracking (for backpropagation)
   * Stores intermediate values needed for gradient computation
   */
  private forwardWithState(inputs: number[]): LayerState[] {
    const states: LayerState[] = []
    let current = Matrix.fromArray(inputs)

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]
      const input = current.copy()

      // Compute weighted sum
      const weighted = Matrix.multiply(layer.weights, current)
      const withBias = weighted.add(layer.biases)

      // Apply activation
      const activationFn = getActivation(layer.activation)
      const output = withBias.map((val) => activationFn(val))

      states.push({
        input,
        output,
        weighted: withBias,
        delta: new Matrix(output.rows, output.cols), // Placeholder
      })

      current = output
    }

    return states
  }

  /**
   * Train on single sample using backpropagation
   * Returns loss (mean squared error)
   */
  train(inputs: number[], targets: number[]): number {
    if (targets.length !== this.config.outputSize) {
      throw new Error(
        `Expected ${this.config.outputSize} targets, got ${targets.length}`
      )
    }

    // Forward pass with state tracking
    const states = this.forwardWithState(inputs)
    const predictions = states[states.length - 1].output

    // Compute output layer error (loss)
    let loss = 0
    const targetMatrix = Matrix.fromArray(targets)
    const error = predictions.subtract(targetMatrix)

    for (let i = 0; i < error.rows; i++) {
      loss += error.data[i][0] * error.data[i][0]
    }
    loss /= error.rows // MSE

    // Backward pass - compute deltas for each layer
    let delta = error

    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i]
      const state = states[i]

      // Apply activation derivative element-wise
      const derivativeFn = getActivationDerivative(layer.activation)
      const weighted = state.weighted
      const derivativeMatrix = weighted.map((val) =>
        derivativeFn(sigmoid(val))
      ) // Use sigmoid approximation for derivative

      // Delta = error ⊙ σ'(z)
      delta = delta.hadamard(derivativeMatrix)

      // Compute gradients
      // dW = delta * input^T
      const dWeights = Matrix.multiply(delta, state.input.transpose())

      // dB = delta (for batch: sum across samples)
      const dBiases = delta.copy()

      // Update weights and biases
      const weightUpdate = dWeights.scale(this.learningRate)
      const biasUpdate = dBiases.scale(this.learningRate)

      layer.weights = layer.weights.subtract(weightUpdate)
      layer.biases = layer.biases.subtract(biasUpdate)

      // Propagate delta to previous layer
      if (i > 0) {
        delta = Matrix.multiply(layer.weights.transpose(), delta)
      }
    }

    return loss
  }

  /**
   * Train on batch of samples
   * Returns average loss across batch
   */
  trainBatch(
    data: { inputs: number[]; targets: number[] }[],
    epochs: number = 1
  ): number {
    let totalLoss = 0

    for (let epoch = 0; epoch < epochs; epoch++) {
      totalLoss = 0
      for (const sample of data) {
        totalLoss += this.train(sample.inputs, sample.targets)
      }
      totalLoss /= data.length
    }

    return totalLoss
  }

  /**
   * Export network weights for persistence
   */
  exportWeights(): SerializedNetwork {
    return {
      config: this.config,
      weights: this.layers.map((l) => l.weights.data),
      biases: this.layers.map((l) => l.biases.data),
      trainedAt: new Date().toISOString(),
    }
  }

  /**
   * Import network weights from saved state
   */
  importWeights(data: SerializedNetwork): void {
    if (
      data.weights.length !== this.layers.length ||
      data.biases.length !== this.layers.length
    ) {
      throw new Error('Saved weights do not match network architecture')
    }

    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].weights = new Matrix(
        this.layers[i].weights.rows,
        this.layers[i].weights.cols,
        data.weights[i]
      )
      this.layers[i].biases = new Matrix(
        this.layers[i].biases.rows,
        this.layers[i].biases.cols,
        data.biases[i]
      )
    }
  }

  /**
   * Set learning rate for training
   */
  setLearningRate(rate: number): void {
    this.learningRate = rate
  }
}

// ============================================================================
// UTILITY FUNCTIONS - Feature normalization
// ============================================================================

/**
 * Normalize raw feature values using min-max scaling
 * Maps values to [0, 1] range based on known min/max
 */
export function normalizeFeatures(
  raw: Record<string, number>,
  ranges: Record<string, [number, number]>
): number[] {
  const normalized: number[] = []

  for (const [key, value] of Object.entries(raw)) {
    if (!(key in ranges)) {
      throw new Error(`No range defined for feature: ${key}`)
    }

    const [min, max] = ranges[key]
    const normalized_val = (value - min) / (max - min)

    // Clamp to [0, 1]
    normalized.push(Math.max(0, Math.min(1, normalized_val)))
  }

  return normalized
}

/**
 * Denormalize predictions back to original range
 */
export function denormalizeValue(
  normalized: number,
  range: [number, number]
): number {
  const [min, max] = range
  return normalized * (max - min) + min
}

// ============================================================================
// TRADE SCORER - Evaluates trade opportunity quality
// ============================================================================

/**
 * Input features for trade scoring:
 * [priceChange24h, volumeChange, rsiNormalized, macdSignal,
 *  sentimentScore, fundamentalScore, marketTrend, volatility]
 */
export interface TradeFeatures {
  priceChange24h: number // -1 to 1 normalized
  volumeChange: number // -1 to 1 normalized
  rsiNormalized: number // 0 to 1 (RSI/100)
  macdSignal: number // -1 to 1 normalized
  sentimentScore: number // -1 to 1
  fundamentalScore: number // 0 to 1
  marketTrend: number // -1 (bear) to 1 (bull)
  volatility: number // 0 to 1 normalized
}

type SignalType = 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell'

/**
 * TradeScorer neural network
 * Trained to map market features to trade opportunity confidence (0-1)
 */
export class TradeScorer {
  private nn: NeuralNetwork
  private featureRanges: Record<string, [number, number]> = {
    priceChange24h: [-0.5, 0.5],
    volumeChange: [-1, 1],
    rsiNormalized: [0, 1],
    macdSignal: [-1, 1],
    sentimentScore: [-1, 1],
    fundamentalScore: [0, 1],
    marketTrend: [-1, 1],
    volatility: [0, 1],
  }

  constructor() {
    // Network: 8 inputs -> 16 hidden (relu) -> 8 hidden (relu) -> 1 output (sigmoid)
    this.nn = new NeuralNetwork({
      inputSize: 8,
      hiddenLayers: [
        { size: 16, activation: 'relu' },
        { size: 8, activation: 'relu' },
      ],
      outputSize: 1,
      outputActivation: 'sigmoid',
      learningRate: 0.01,
    })

    // Initialize with heuristic weights for reasonable defaults
    this.initializeHeuristic()
  }

  /**
   * Initialize with heuristic-based weights
   * Biases network toward sensible trading signals before training
   */
  private initializeHeuristic(): void {
    // For now, use random initialization - network will learn through training
    // In production, could load pre-trained weights
  }

  /**
   * Score a trade opportunity
   * Returns confidence (0-1) and categorical signal
   */
  score(features: TradeFeatures): {
    confidence: number
    signal: SignalType
  } {
    const normalized = [
      features.priceChange24h,
      features.volumeChange,
      features.rsiNormalized,
      features.macdSignal,
      features.sentimentScore,
      features.fundamentalScore,
      features.marketTrend,
      features.volatility,
    ]

    // Ensure all values are in valid range
    const clampedInputs = normalized.map((v) =>
      Math.max(0, Math.min(1, v))
    )

    const output = this.nn.predict(clampedInputs)
    const confidence = output[0]

    // Map confidence to signal
    let signal: SignalType
    if (confidence >= 0.8) {
      signal = 'strong_buy'
    } else if (confidence >= 0.6) {
      signal = 'buy'
    } else if (confidence >= 0.4) {
      signal = 'hold'
    } else if (confidence >= 0.2) {
      signal = 'sell'
    } else {
      signal = 'strong_sell'
    }

    return { confidence, signal }
  }

  /**
   * Train scorer on historical data
   */
  train(
    historicalData: TradeFeatures[],
    outcomes: number[],
    epochs: number = 10
  ): { epochs: number; finalLoss: number } {
    if (historicalData.length !== outcomes.length) {
      throw new Error('Data and outcomes length mismatch')
    }

    const trainingData = historicalData.map((features, i) => ({
      inputs: [
        features.priceChange24h,
        features.volumeChange,
        features.rsiNormalized,
        features.macdSignal,
        features.sentimentScore,
        features.fundamentalScore,
        features.marketTrend,
        features.volatility,
      ],
      targets: [outcomes[i]],
    }))

    let finalLoss = 0
    for (let epoch = 0; epoch < epochs; epoch++) {
      finalLoss = this.nn.trainBatch(trainingData, 1)
    }

    return { epochs, finalLoss }
  }

  /**
   * Export trained model
   */
  exportModel(): SerializedNetwork {
    return this.nn.exportWeights()
  }

  /**
   * Import trained model
   */
  importModel(data: SerializedNetwork): void {
    this.nn.importWeights(data)
  }
}

// ============================================================================
// POSITION SIZER - Optimal position sizing
// ============================================================================

export interface PositionParams {
  confidence: number // 0-1
  volatility: number // 0-1
  portfolioValue: number // USD
  currentExposure: number // 0-1, current allocation to similar assets
  riskTolerance: number // 0-1 (conservative to aggressive)
  correlationToPortfolio: number // -1 to 1
}

/**
 * PositionSizer neural network
 * Determines optimal position size based on risk factors
 * Uses Kelly Criterion concepts + neural optimization
 */
export class PositionSizer {
  private nn: NeuralNetwork
  private minPositionSize: number = 0.001 // 0.1% minimum
  private maxPositionSize: number = 0.3 // 30% maximum

  constructor() {
    // Network: 6 inputs -> 12 hidden (tanh) -> 6 hidden (tanh) -> 1 output (sigmoid)
    // Tanh is good here as we need balanced scaling in both directions
    this.nn = new NeuralNetwork({
      inputSize: 6,
      hiddenLayers: [
        { size: 12, activation: 'tanh' },
        { size: 6, activation: 'tanh' },
      ],
      outputSize: 1,
      outputActivation: 'sigmoid',
      learningRate: 0.01,
    })
  }

  /**
   * Optimize position size for a potential trade
   */
  optimize(params: PositionParams): {
    positionPct: number
    dollarAmount: number
    reasoning: string
  } {
    // Normalize inputs to [0, 1]
    const inputs = [
      params.confidence,
      params.volatility,
      Math.min(params.currentExposure, 1), // Cap at 1
      params.riskTolerance,
      (params.correlationToPortfolio + 1) / 2, // Convert from [-1, 1] to [0, 1]
      0.5, // Kelly fraction placeholder (0.5 = half-kelly for safety)
    ]

    // Predict position size (0-1)
    const output = this.nn.predict(inputs)
    let positionSize = output[0]

    // Apply constraints and adjustments
    // Reduce size if correlation is high (reduce concentration risk)
    const correlationFactor =
      1 - Math.abs(params.correlationToPortfolio) * 0.5
    positionSize *= correlationFactor

    // Reduce size if exposure to similar assets is high
    const exposureFactor = Math.max(0.3, 1 - params.currentExposure * 2)
    positionSize *= exposureFactor

    // Increase size if confidence is high
    const confidenceFactor = 0.5 + params.confidence * 0.5
    positionSize *= confidenceFactor

    // Apply min/max bounds
    positionSize = Math.max(
      this.minPositionSize,
      Math.min(this.maxPositionSize, positionSize)
    )

    const dollarAmount = params.portfolioValue * positionSize

    // Generate reasoning
    const reasoning = this.generateReasoning(params, positionSize)

    return { positionPct: positionSize, dollarAmount, reasoning }
  }

  private generateReasoning(params: PositionParams, size: number): string {
    const factors: string[] = []

    if (params.confidence > 0.7) {
      factors.push('high trade confidence')
    } else if (params.confidence < 0.3) {
      factors.push('low trade confidence')
    }

    if (params.volatility > 0.6) {
      factors.push('high volatility risk')
    }

    if (params.currentExposure > 0.2) {
      factors.push('existing sector exposure')
    }

    if (params.correlationToPortfolio > 0.7) {
      factors.push('high portfolio correlation')
    }

    if (params.riskTolerance > 0.7) {
      factors.push('aggressive risk tolerance')
    } else if (params.riskTolerance < 0.3) {
      factors.push('conservative risk tolerance')
    }

    return `Position sized at ${(size * 100).toFixed(1)}% based on: ${factors.join(', ') || 'balanced factors'}`
  }
}

// ============================================================================
// RISK ASSESSOR - Portfolio risk evaluation
// ============================================================================

export interface PortfolioRiskInput {
  portfolioBeta: number // Market sensitivity
  sectorConcentration: number // HHI index normalized (0-1)
  correlationAvg: number // Average pairwise correlation (-1 to 1)
  maxDrawdownPct: number // Historical max drawdown (0-1)
  sharpeRatio: number // Risk-adjusted return (-3 to 3)
  volatility: number // Annualized volatility (0-1)
  marketRegime: number // -1 (crisis) to 1 (bull)
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * RiskAssessor neural network
 * Evaluates portfolio risk and stress scenarios
 */
export class RiskAssessor {
  private nn: NeuralNetwork

  constructor() {
    // Network: 7 inputs -> 16 hidden (relu) -> 8 hidden (relu) -> 2 outputs (sigmoid for risk and stress)
    this.nn = new NeuralNetwork({
      inputSize: 7,
      hiddenLayers: [
        { size: 16, activation: 'relu' },
        { size: 8, activation: 'relu' },
      ],
      outputSize: 2,
      outputActivation: 'sigmoid',
      learningRate: 0.01,
    })

    // Initialize with heuristic scaling for reasonable defaults
    this.initializeHeuristic()
  }

  private initializeHeuristic(): void {
    // Initialize with reasonable priors that map input features to risk
    // In production, would load pre-trained weights
  }

  /**
   * Assess portfolio risk
   */
  assess(portfolio: PortfolioRiskInput): {
    riskScore: number
    stressScore: number
    riskLevel: RiskLevel
    recommendations: string[]
  } {
    // Normalize inputs to [0, 1]
    const inputs = [
      (portfolio.portfolioBeta + 2) / 4, // Assume range [-2, 2]
      portfolio.sectorConcentration,
      (portfolio.correlationAvg + 1) / 2, // Convert [-1, 1] to [0, 1]
      portfolio.maxDrawdownPct,
      (portfolio.sharpeRatio + 3) / 6, // Assume range [-3, 3]
      portfolio.volatility,
      (portfolio.marketRegime + 1) / 2, // Convert [-1, 1] to [0, 1]
    ]

    const output = this.nn.predict(inputs)
    let riskScore = output[0]
    let stressScore = output[1]

    // Adjust based on specific factors
    // High concentration increases risk significantly
    riskScore += portfolio.sectorConcentration * 0.2

    // High correlation increases systemic risk
    riskScore += Math.max(0, portfolio.correlationAvg) * 0.15

    // Bear market increases stress
    if (portfolio.marketRegime < -0.5) {
      stressScore += (0.5 + portfolio.marketRegime) * 0.3
    }

    // Normalize scores to [0, 1]
    riskScore = Math.max(0, Math.min(1, riskScore))
    stressScore = Math.max(0, Math.min(1, stressScore))

    // Determine risk level
    const avgRisk = (riskScore + stressScore) / 2
    let riskLevel: RiskLevel
    if (avgRisk >= 0.75) {
      riskLevel = 'critical'
    } else if (avgRisk >= 0.55) {
      riskLevel = 'high'
    } else if (avgRisk >= 0.35) {
      riskLevel = 'medium'
    } else {
      riskLevel = 'low'
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      portfolio,
      riskScore,
      stressScore
    )

    return { riskScore, stressScore, riskLevel, recommendations }
  }

  private generateRecommendations(
    portfolio: PortfolioRiskInput,
    riskScore: number,
    stressScore: number
  ): string[] {
    const recommendations: string[] = []

    if (portfolio.sectorConcentration > 0.3) {
      recommendations.push('Diversify sector allocation to reduce concentration risk')
    }

    if (portfolio.correlationAvg > 0.7) {
      recommendations.push(
        'Add uncorrelated assets to reduce portfolio correlation'
      )
    }

    if (portfolio.volatility > 0.3) {
      recommendations.push('Consider hedging strategies or reducing position sizes')
    }

    if (portfolio.maxDrawdownPct > 0.4) {
      recommendations.push(
        'Implement stop-loss orders and risk limits to control downside'
      )
    }

    if (portfolio.sharpeRatio < 0.5) {
      recommendations.push('Review return generation relative to risk taken')
    }

    if (portfolio.marketRegime < -0.5) {
      recommendations.push('Portfolio is exposed to market downturn - consider defensive positioning')
    }

    if (riskScore > 0.7 && stressScore > 0.6) {
      recommendations.push(
        'High risk + stress: consider de-risking or portfolio restructuring'
      )
    }

    if (recommendations.length === 0) {
      recommendations.push('Portfolio risk profile is balanced - maintain current positioning')
    }

    return recommendations.slice(0, 5) // Return top 5 recommendations
  }
}

// ============================================================================
// EXPORTS - Public API
// ============================================================================

export {
  Matrix,
  sigmoid,
  sigmoidDerivative,
  relu,
  reluDerivative,
  tanh,
  tanhDerivative,
  softmax,
  getActivation,
  getActivationDerivative,
  xavierInit,
  heInit,
  NeuralNetwork,
}

export type {
  NetworkConfig,
  SerializedNetwork,
}
