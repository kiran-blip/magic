/**
 * Encrypted Vault for Gold Digger AGI.
 *
 * Stores API keys and secrets in an AES-256-GCM encrypted file on disk.
 * This replaces .env files entirely — keys are stored encrypted and loaded
 * at runtime without ever existing in plaintext files.
 *
 * HOW IT WORKS:
 *   1. First run: user sets a vault password via setup wizard or CLI
 *   2. A 256-bit encryption key is derived from the password using PBKDF2 (100K iterations)
 *   3. All secrets are encrypted and stored in data/vault.enc
 *   4. At app startup, vault is unlocked with the password (from VAULT_PASSWORD env var
 *      or prompted interactively)
 *   5. Secrets are available in-memory only — never written to plaintext files
 *
 * SECURITY:
 *   - AES-256-GCM authenticated encryption
 *   - PBKDF2 key derivation (100,000 iterations, SHA-512)
 *   - Unique salt per vault, unique IV per encryption
 *   - vault.enc is gitignored (binary, encrypted)
 *   - Even if vault.enc leaks, it's useless without the password
 *   - No plaintext secrets on disk at any point
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ── Constants ────────────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = "sha512";

// ── Types ────────────────────────────────────────────────────────────

export interface VaultData {
  /** Version for future format upgrades */
  version: 1;
  /** Key-value pairs of secrets */
  secrets: Record<string, string>;
  /** When the vault was last modified */
  updatedAt: string;
}

/** Secret keys the vault manages */
export type SecretKey =
  | "ANTHROPIC_API_KEY"
  | "OPENROUTER_API_KEY"
  | "JWT_SECRET"
  | "ALPACA_API_KEY"
  | "ALPACA_API_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET";

// ── Vault State ──────────────────────────────────────────────────────

let vaultUnlocked = false;
let encryptionKey: Buffer | null = null;
let cachedSecrets: Record<string, string> = {};

// ── Paths ────────────────────────────────────────────────────────────

function getVaultPath(): string {
  const dataDir =
    process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "vault.enc");
}

// ── Key Derivation ───────────────────────────────────────────────────

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    PBKDF2_DIGEST
  );
}

// ── Encryption / Decryption ──────────────────────────────────────────

function encrypt(data: string, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: [iv (16)] [authTag (16)] [ciphertext (...)]
  return Buffer.concat([iv, authTag, encrypted]);
}

function decrypt(payload: Buffer, key: Buffer): string {
  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Vault data too short — may be corrupted");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Vault decryption failed — wrong password or corrupted data");
  }
}

// ── File Format ──────────────────────────────────────────────────────
// File: [magic (4)] [version (1)] [salt (32)] [encrypted payload (...)]
const MAGIC = Buffer.from("GDRV"); // Gold Digger Runtime Vault

function writeVaultFile(vaultData: VaultData, key: Buffer, salt: Buffer): void {
  const json = JSON.stringify(vaultData);
  const encryptedPayload = encrypt(json, key);

  const version = Buffer.alloc(1);
  version.writeUInt8(1, 0);

  const file = Buffer.concat([MAGIC, version, salt, encryptedPayload]);
  fs.writeFileSync(getVaultPath(), file, { mode: 0o600 }); // Owner read/write only
}

function readVaultFile(password: string): { data: VaultData; key: Buffer; salt: Buffer } {
  const vaultPath = getVaultPath();
  if (!fs.existsSync(vaultPath)) {
    throw new Error("Vault does not exist. Run setup first.");
  }

  const file = fs.readFileSync(vaultPath);

  // Validate magic bytes
  if (file.subarray(0, 4).toString() !== "GDRV") {
    throw new Error("Invalid vault file format");
  }

  const version = file.readUInt8(4);
  if (version !== 1) {
    throw new Error(`Unsupported vault version: ${version}`);
  }

  const salt = file.subarray(5, 5 + SALT_LENGTH);
  const encryptedPayload = file.subarray(5 + SALT_LENGTH);

  const key = deriveKey(password, salt);
  const json = decrypt(encryptedPayload, key);
  const data = JSON.parse(json) as VaultData;

  return { data, key, salt };
}

// ══════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════

/**
 * Check if a vault file exists on disk.
 */
export function vaultExists(): boolean {
  return fs.existsSync(getVaultPath());
}

/**
 * Check if the vault is currently unlocked in memory.
 */
export function isVaultUnlocked(): boolean {
  return vaultUnlocked;
}

/**
 * Create a new vault with a password. Stores secrets encrypted on disk.
 */
export function createVault(
  password: string,
  initialSecrets?: Record<string, string>
): void {
  if (password.length < 8) {
    throw new Error("Vault password must be at least 8 characters");
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);

  const vaultData: VaultData = {
    version: 1,
    secrets: initialSecrets ?? {},
    updatedAt: new Date().toISOString(),
  };

  writeVaultFile(vaultData, key, salt);

  // Unlock in memory
  encryptionKey = key;
  cachedSecrets = { ...vaultData.secrets };
  vaultUnlocked = true;
}

/**
 * Unlock an existing vault. Loads all secrets into memory.
 */
export function unlockVault(password: string): void {
  const { data, key } = readVaultFile(password);

  encryptionKey = key;
  cachedSecrets = { ...data.secrets };
  vaultUnlocked = true;
}

/**
 * Lock the vault — clears all secrets from memory.
 */
export function lockVault(): void {
  encryptionKey = null;
  cachedSecrets = {};
  vaultUnlocked = false;
}

/**
 * Get a secret from the unlocked vault.
 */
export function getSecret(key: SecretKey): string | undefined {
  // Fallback chain: vault → environment variable → golddigger-config.json
  if (vaultUnlocked && cachedSecrets[key]) {
    return cachedSecrets[key];
  }
  // Fallback to env var (for Railway deployments and backwards compatibility)
  return process.env[key] || undefined;
}

/**
 * Get all secrets (for display purposes — values should be masked).
 */
export function getSecretKeys(): Array<{ key: string; hasValue: boolean; source: string }> {
  const allKeys: SecretKey[] = [
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
    "JWT_SECRET",
    "ALPACA_API_KEY",
    "ALPACA_API_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];

  return allKeys.map((k) => {
    if (vaultUnlocked && cachedSecrets[k]) {
      return { key: k, hasValue: true, source: "vault" };
    }
    if (process.env[k]) {
      return { key: k, hasValue: true, source: "env" };
    }
    return { key: k, hasValue: false, source: "none" };
  });
}

/**
 * Store or update a secret in the vault. Requires vault to be unlocked.
 */
export function setSecret(key: SecretKey, value: string): void {
  if (!vaultUnlocked || !encryptionKey) {
    throw new Error("Vault is locked. Unlock first.");
  }

  cachedSecrets[key] = value;

  // Re-encrypt and save
  const vaultPath = getVaultPath();
  const file = fs.readFileSync(vaultPath);
  const salt = file.subarray(5, 5 + SALT_LENGTH);

  const vaultData: VaultData = {
    version: 1,
    secrets: { ...cachedSecrets },
    updatedAt: new Date().toISOString(),
  };

  writeVaultFile(vaultData, encryptionKey, salt);
}

/**
 * Remove a secret from the vault.
 */
export function removeSecret(key: SecretKey): void {
  if (!vaultUnlocked || !encryptionKey) {
    throw new Error("Vault is locked. Unlock first.");
  }

  delete cachedSecrets[key];

  const vaultPath = getVaultPath();
  const file = fs.readFileSync(vaultPath);
  const salt = file.subarray(5, 5 + SALT_LENGTH);

  const vaultData: VaultData = {
    version: 1,
    secrets: { ...cachedSecrets },
    updatedAt: new Date().toISOString(),
  };

  writeVaultFile(vaultData, encryptionKey, salt);
}

/**
 * Change the vault password. Re-encrypts all secrets with new key.
 */
export function changeVaultPassword(
  currentPassword: string,
  newPassword: string
): void {
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  // Decrypt with current password
  const { data } = readVaultFile(currentPassword);

  // Re-encrypt with new password
  const newSalt = crypto.randomBytes(SALT_LENGTH);
  const newKey = deriveKey(newPassword, newSalt);

  writeVaultFile(data, newKey, newSalt);

  // Update in-memory state
  encryptionKey = newKey;
}

/**
 * Auto-unlock vault on app startup.
 * Tries: VAULT_PASSWORD env var → falls back to env vars for secrets.
 */
export function autoUnlock(): boolean {
  if (vaultUnlocked) return true;

  if (!vaultExists()) {
    return false;
  }

  const password = process.env.VAULT_PASSWORD;
  if (!password) {
    // No vault password available — secrets will fall back to env vars
    return false;
  }

  try {
    unlockVault(password);
    return true;
  } catch {
    console.warn("[Vault] Auto-unlock failed — falling back to environment variables");
    return false;
  }
}

/**
 * Migrate secrets from .env / environment variables into the vault.
 * Call this during setup to move keys from env into encrypted storage.
 */
export function migrateFromEnv(password: string): {
  migrated: string[];
  skipped: string[];
} {
  const envKeys: SecretKey[] = [
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
    "JWT_SECRET",
    "ALPACA_API_KEY",
    "ALPACA_API_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];

  const secrets: Record<string, string> = {};
  const migrated: string[] = [];
  const skipped: string[] = [];

  for (const key of envKeys) {
    const value = process.env[key];
    if (value && value.length > 0) {
      secrets[key] = value;
      migrated.push(key);
    } else {
      skipped.push(key);
    }
  }

  // Also check golddigger-config.json for keys stored there
  try {
    const configPath = path.join(
      process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data"),
      "golddigger-config.json"
    );
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.openrouterApiKey && !secrets.OPENROUTER_API_KEY) {
        secrets.OPENROUTER_API_KEY = config.openrouterApiKey;
        migrated.push("OPENROUTER_API_KEY (from config)");
      }
      if (config.anthropicApiKey && !secrets.ANTHROPIC_API_KEY) {
        secrets.ANTHROPIC_API_KEY = config.anthropicApiKey;
        migrated.push("ANTHROPIC_API_KEY (from config)");
      }
    }
  } catch {
    // Config file doesn't exist or is invalid — skip
  }

  if (vaultExists()) {
    // Vault exists — unlock and merge
    unlockVault(password);
    for (const [k, v] of Object.entries(secrets)) {
      setSecret(k as SecretKey, v);
    }
  } else {
    // Create new vault
    createVault(password, secrets);
  }

  return { migrated, skipped };
}
