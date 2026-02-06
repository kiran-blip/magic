import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard/email?error=no_code", req.url)
    );
  }

  try {
    await handleAuthCallback(code);
    return NextResponse.redirect(new URL("/dashboard/email", req.url));
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(`/dashboard/email?error=${encodeURIComponent(err.message)}`, req.url)
    );
  }
}
