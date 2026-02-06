import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { execSync } from "child_process";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { command } = await req.json();
  if (!command) {
    return NextResponse.json({ error: "Command required" }, { status: 400 });
  }

  try {
    const output = execSync(command, {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      cwd: process.env.HOME || "/tmp",
    });
    return NextResponse.json({ output: output.toString() });
  } catch (err: any) {
    return NextResponse.json({
      output:
        err.stderr?.toString() || err.stdout?.toString() || err.message,
    });
  }
}
