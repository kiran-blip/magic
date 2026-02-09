/**
 * Vault API — Encrypted secret management.
 *
 * GET  ?action=status           — vault status (exists, unlocked, key inventory)
 *
 * POST { action: "create",  password, secrets? }     — create new vault
 * POST { action: "unlock",  password }               — unlock vault
 * POST { action: "lock" }                            — lock vault
 * POST { action: "set",     key, value }             — store/update a secret
 * POST { action: "remove",  key }                    — remove a secret
 * POST { action: "migrate", password }               — migrate env vars into vault
 * POST { action: "change-password", current, new }   — change vault password
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  vaultExists,
  isVaultUnlocked,
  createVault,
  unlockVault,
  lockVault,
  getSecretKeys,
  setSecret,
  removeSecret,
  changeVaultPassword,
  migrateFromEnv,
  type SecretKey,
} from "@/lib/vault";

// ── Auth ─────────────────────────────────────────────────────────────

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function checkAuth(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("magic-token")?.value;
  if (!cookie) return false;
  try {
    await verifyToken(cookie);
    return true;
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function maskValue(key: string): string {
  if (key.length <= 8) return "****";
  return key.substring(0, 7) + "..." + key.substring(key.length - 4);
}

// ── GET ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  const exists = vaultExists();
  const unlocked = isVaultUnlocked();
  const keys = getSecretKeys();

  return NextResponse.json({
    exists,
    unlocked,
    keys: keys.map((k) => ({
      key: k.key,
      hasValue: k.hasValue,
      source: k.source,
    })),
  });
}

// ── POST ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "create": {
        const { password, secrets } = body;
        if (!password || password.length < 8) {
          return NextResponse.json(
            { error: "Password must be at least 8 characters" },
            { status: 400 }
          );
        }
        if (vaultExists()) {
          return NextResponse.json(
            { error: "Vault already exists. Use 'change-password' to update." },
            { status: 409 }
          );
        }
        createVault(password, secrets);
        return NextResponse.json({
          success: true,
          message: "Vault created and unlocked",
        });
      }

      case "unlock": {
        const { password } = body;
        if (!password) {
          return NextResponse.json({ error: "Password required" }, { status: 400 });
        }
        try {
          unlockVault(password);
          return NextResponse.json({ success: true, message: "Vault unlocked" });
        } catch (e) {
          return NextResponse.json(
            { error: "Wrong password or corrupted vault" },
            { status: 403 }
          );
        }
      }

      case "lock": {
        lockVault();
        return NextResponse.json({ success: true, message: "Vault locked" });
      }

      case "set": {
        const { key, value } = body;
        if (!key || value === undefined) {
          return NextResponse.json(
            { error: "Missing key or value" },
            { status: 400 }
          );
        }
        if (!isVaultUnlocked()) {
          return NextResponse.json(
            { error: "Vault is locked. Unlock first." },
            { status: 403 }
          );
        }
        setSecret(key as SecretKey, value);
        return NextResponse.json({
          success: true,
          key,
          masked: maskValue(value),
        });
      }

      case "remove": {
        const { key } = body;
        if (!key) {
          return NextResponse.json({ error: "Missing key" }, { status: 400 });
        }
        if (!isVaultUnlocked()) {
          return NextResponse.json(
            { error: "Vault is locked. Unlock first." },
            { status: 403 }
          );
        }
        removeSecret(key as SecretKey);
        return NextResponse.json({ success: true, key });
      }

      case "migrate": {
        const { password } = body;
        if (!password || password.length < 8) {
          return NextResponse.json(
            { error: "Password must be at least 8 characters" },
            { status: 400 }
          );
        }
        const result = migrateFromEnv(password);
        return NextResponse.json({
          success: true,
          ...result,
          message: `Migrated ${result.migrated.length} keys into vault`,
        });
      }

      case "change-password": {
        const { current, new: newPwd } = body;
        if (!current || !newPwd) {
          return NextResponse.json(
            { error: "Both current and new password required" },
            { status: 400 }
          );
        }
        try {
          changeVaultPassword(current, newPwd);
          return NextResponse.json({
            success: true,
            message: "Vault password changed",
          });
        } catch (e) {
          return NextResponse.json(
            { error: "Wrong current password" },
            { status: 403 }
          );
        }
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
