import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback } from "@/lib/gmail";

function getBaseUrl(req: NextRequest): string {
  // Use X-Forwarded headers from Railway's proxy, or fall back to GOOGLE_REDIRECT_URI
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");

  if (forwardedHost && !forwardedHost.includes("railway.internal")) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // Fall back to deriving from the redirect URI env var
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "";
  if (redirectUri) {
    const url = new URL(redirectUri);
    return url.origin;
  }

  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard/email?error=no_code", baseUrl));
  }

  try {
    await handleAuthCallback(code);
    return NextResponse.redirect(new URL("/dashboard/email", baseUrl));
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(`/dashboard/email?error=${encodeURIComponent(err.message)}`, baseUrl)
    );
  }
}
