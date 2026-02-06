import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { disconnectGmail } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  disconnectGmail();
  return NextResponse.json({ success: true });
}
