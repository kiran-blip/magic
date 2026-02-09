/**
 * Notifications API
 *
 * GET /api/golddigger/notifications → get notifications list + unread count
 * POST /api/golddigger/notifications → mark read/mark all read
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "@/lib/golddigger/notifications";

// ── Auth helper ─────────────────────────────────────────────────────────

async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("magic-token")?.value;
    if (!token) return false;
    return !!verifyToken(token);
  } catch {
    return false;
  }
}

// ── GET — List notifications ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const unreadOnly = searchParams.get("unread") === "true";

  try {
    let notifs = getNotifications(limit);
    if (unreadOnly) {
      notifs = notifs.filter((n) => !n.read);
    }

    return NextResponse.json({
      notifications: notifs,
      unreadCount: getUnreadCount(),
      total: notifs.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — Mark notifications as read ────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, id } = body as {
      action?: string;
      id?: string;
    };

    if (action === "mark-all-read") {
      markAllRead();
      return NextResponse.json({
        success: true,
        unreadCount: getUnreadCount(),
      });
    }

    if (action === "mark-read" && id) {
      markRead(id);
      return NextResponse.json({
        success: true,
        unreadCount: getUnreadCount(),
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
