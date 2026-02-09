/**
 * Vault module re-exports.
 */
export {
  type SecretKey,
  type VaultData,
  vaultExists,
  isVaultUnlocked,
  createVault,
  unlockVault,
  lockVault,
  getSecret,
  getSecretKeys,
  setSecret,
  removeSecret,
  changeVaultPassword,
  autoUnlock,
  migrateFromEnv,
} from "./vault";
