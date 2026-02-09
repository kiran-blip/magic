/**
 * Broker module — Alpaca integration and Simulator for Gold Digger AGI.
 *
 * IMPORTANT: Use `getActiveBroker()` to get whichever broker is currently
 * connected (simulator OR alpaca). Do NOT use `getBroker()` directly unless
 * you specifically want the Alpaca broker only.
 */

export {
  AlpacaBroker,
  getBroker,
  initBroker,
  disconnectBroker,
  encryptCredential,
  decryptCredential,
  type TradingMode,
  type OrderSide,
  type OrderType,
  type OrderTimeInForce,
  type OrderStatus,
  type BrokerCredentials,
  type BrokerAccount,
  type BrokerPosition,
  type OrderParams,
  type BrokerOrder,
} from "./alpaca";

export {
  SimulatorBroker,
  getSimulator,
  initSimulator,
  disconnectSimulator,
} from "./simulator";

export {
  CryptoBroker,
  getCryptoBroker,
  initCryptoBroker,
  disconnectCryptoBroker,
  getSupportedExchanges,
  type CryptoExchangeId,
  type CryptoBrokerCredentials,
} from "./crypto";

export {
  getBrokerConfig,
  saveBrokerConfig,
  storeBrokerCredentials,
  getBrokerCredentials,
  removeBrokerCredentials,
  checkLiveReadiness,
  type BrokerConfig,
} from "./config";

// ============================================================================
// Unified Broker Accessor
// ============================================================================

import { getBrokerConfig as _getBrokerConfig } from "./config";
import { getBroker as _getBroker } from "./alpaca";
import { getSimulator as _getSimulator } from "./simulator";
import { getCryptoBroker as _getCryptoBroker } from "./crypto";
import type { AlpacaBroker as _AlpacaBroker } from "./alpaca";
import type { SimulatorBroker as _SimulatorBroker } from "./simulator";
import type { CryptoBroker as _CryptoBroker } from "./crypto";

/**
 * Get whichever broker is currently active (simulator, Alpaca, or crypto).
 * This is the CORRECT function to call when you need to interact with the broker.
 * Returns null if no broker is connected.
 */
export function getActiveBroker(): _AlpacaBroker | _SimulatorBroker | _CryptoBroker | null {
  const config = _getBrokerConfig();

  // Check crypto broker first when provider is crypto
  if (config.provider === "crypto") {
    const crypto = _getCryptoBroker();
    if (crypto && crypto.isConnected()) return crypto;
  }

  // Check simulator when provider is simulator
  if (config.provider === "simulator") {
    const sim = _getSimulator();
    if (sim && sim.isConnected()) return sim;
  }

  // Check Alpaca broker
  const broker = _getBroker();
  if (broker && broker.isConnected()) return broker;

  // Fallback: check simulator even if provider isn't "simulator"
  const sim = _getSimulator();
  if (sim && sim.isConnected()) return sim;

  // Fallback: check crypto broker
  const crypto = _getCryptoBroker();
  if (crypto && crypto.isConnected()) return crypto;

  return null;
}
