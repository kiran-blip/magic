import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  stopContainer,
  startContainer,
  removeContainer,
  getContainerLogs,
  execInContainer,
} from "@/lib/docker";

function authenticate(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action, command } = await req.json();

  try {
    switch (action) {
      case "start":
        await startContainer(id);
        return NextResponse.json({ success: true });
      case "stop":
        await stopContainer(id);
        return NextResponse.json({ success: true });
      case "remove":
        await removeContainer(id);
        return NextResponse.json({ success: true });
      case "logs":
        const logs = await getContainerLogs(id);
        return NextResponse.json({ logs });
      case "exec":
        if (!command) {
          return NextResponse.json(
            { error: "Command required" },
            { status: 400 }
          );
        }
        const output = await execInContainer(id, [
          "sh",
          "-c",
          command,
        ]);
        return NextResponse.json({ output });
      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Action failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await removeContainer(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to remove" },
      { status: 500 }
    );
  }
}
