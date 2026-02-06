import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  getEmail,
  markAsRead,
  archiveEmail,
  trashEmail,
  replyToEmail,
  isAuthenticated,
} from "@/lib/gmail";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const email = await getEmail(id);
    return NextResponse.json({ email });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch email" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAuthenticated()) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 403 });
  }

  const { id } = await params;
  const { action, replyBody, threadId, to, subject } = await req.json();

  try {
    switch (action) {
      case "read":
        await markAsRead(id);
        return NextResponse.json({ success: true });
      case "archive":
        await archiveEmail(id);
        return NextResponse.json({ success: true });
      case "trash":
        await trashEmail(id);
        return NextResponse.json({ success: true });
      case "reply":
        const replyId = await replyToEmail(id, threadId, to, subject, replyBody);
        return NextResponse.json({ success: true, replyId });
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Action failed" },
      { status: 500 }
    );
  }
}
