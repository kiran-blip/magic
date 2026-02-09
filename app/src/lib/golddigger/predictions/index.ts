/**
 * Predictions module re-exports.
 */

export {
  type PredictionType,
  type PredictionOutcome,
  type TrackedPrediction,
  type PredictionStats,
  trackPrediction,
  resolvePendingPredictions,
  getPredictions,
  getPrediction,
  getPredictionStats,
} from "./tracker";
