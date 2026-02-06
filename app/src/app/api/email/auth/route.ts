import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAuthUrl, isAuthenticated } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isAuthenticated()) {
    return NextResponse.json({ authenticated: true });
  }

  try {
    const authUrl = getAuthUrl();
    return NextResponse.json({ authenticated: false, authUrl });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "OAuth not configured" },
      { status: 500 }
    );
  }
}
