import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { templates, categories } from "@/lib/templates";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ templates, categories });
}
