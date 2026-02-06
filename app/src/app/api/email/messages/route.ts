import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { listEmails, isAuthenticated } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAuthenticated()) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 403 }
    );
  }

  const query = req.nextUrl.searchParams.get("q") || "";
  const max = parseInt(req.nextUrl.searchParams.get("max") || "20");

  try {
    const emails = await listEmails(max, query);
    return NextResponse.json({ emails });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
