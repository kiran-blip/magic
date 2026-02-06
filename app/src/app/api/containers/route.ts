import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  listContainers,
  createContainer,
} from "@/lib/docker";
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

  const containers = await listContainers();
  return NextResponse.json({ containers });
}

export async function POST(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { templateId, name, customImage, env, ports } = body;

  try {
    let containerId: string;

    if (templateId) {
      const template = getTemplate(templateId);
      if (!template) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }
      containerId = await createContainer(
        name || template.id,
        template.id,
        template.image,
        [...template.env, ...(env || [])],
        template.ports
      );
    } else {
      containerId = await createContainer(
        name || "custom",
        "custom",
        customImage || "ubuntu:latest",
        env || [],
        ports || {}
      );
    }

    return NextResponse.json({ id: containerId, success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create container" },
      { status: 500 }
    );
  }
}
