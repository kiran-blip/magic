import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback } from "@/lib/gmail";

function getPublicUrl(): string {
  // Derive from the redirect URI we already know is correct
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (redirectUri) {
    return redirectUri.replace("/api/email/auth/callback", "");
  }
  // Fall back to Railway public domain
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) {
    return `https://${railwayDomain}`;
  }
  return "http://localhost:3000";
}

export async function GET(req: NextRequest) {
  const publicUrl = getPublicUrl();
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${publicUrl}/dashboard/email?error=no_code`);
  }

  try {
    await handleAuthCallback(code);
    return NextResponse.redirect(`${publicUrl}/dashboard/email?connected=true`);
  } catch (err: any) {
    console.error("OAuth callback error:", err.message);
    return NextResponse.redirect(
      `${publicUrl}/dashboard/email?error=${encodeURIComponent(err.message)}`
    );
  }
}
