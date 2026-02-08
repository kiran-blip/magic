/**
 * Gold Digger API Key Test Endpoint
 *
 * POST /api/jarvis/settings/test — Tests an API key against the provider
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { testApiKey } from "@/lib/jarvis/config";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { provider, apiKey } = body;

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "provider and apiKey are required" },
        { status: 400 }
      );
    }

    if (provider !== "anthropic" && provider !== "openrouter") {
      return NextResponse.json(
        { error: "provider must be 'anthropic' or 'openrouter'" },
        { status: 400 }
      );
    }

    const result = await testApiKey(provider, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Gold Digger] Key test error:", err);
    return NextResponse.json(
      { success: false, message: "Test failed unexpectedly" },
      { status: 500 }
    );
  }
}
