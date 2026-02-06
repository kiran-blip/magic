import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  listWorkspaces,
  createWorkspace,
  startWorkspace,
} from "@/lib/workspaces";
import { getTemplate } from "@/lib/templates";

function authenticate(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const containers = listWorkspaces();
  return NextResponse.json({ containers });
}

export async function POST(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { templateId, name } = body;

  try {
    if (templateId) {
      const template = getTemplate(templateId);
      if (!template) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }
      const workspace = createWorkspace(
        name || template.id,
        template.id,
        template.features
      );
      startWorkspace(workspace.id);
      return NextResponse.json({ id: workspace.id, success: true });
    } else {
      const workspace = createWorkspace(name || "custom", "custom", []);
      startWorkspace(workspace.id);
      return NextResponse.json({ id: workspace.id, success: true });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create workspace" },
      { status: 500 }
    );
  }
}
