/**
 * Broker module — Alpaca integration and Simulator for Gold Digger AGI.
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
  getBrokerConfig,
  saveBrokerConfig,
  storeBrokerCredentials,
  getBrokerCredentials,
  removeBrokerCredentials,
  checkLiveReadiness,
  type BrokerConfig,
} from "./config";
