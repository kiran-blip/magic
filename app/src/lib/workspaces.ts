import { spawn, ChildProcess, execSync } from "child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), ".magic-data");

export interface Workspace {
  id: string;
  name: string;
  type: string;
  status: "running" | "stopped";
  created: string;
  pid: number | null;
  port: number | null;
  features: string[];
}

// In-memory workspace registry (persisted to disk)
let workspaces: Map<string, Workspace> = new Map();
let processes: Map<string, ChildProcess> = new Map();
let logBuffers: Map<string, string[]> = new Map();

function getStatePath() {
  mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, "workspaces.json");
}

function saveState() {
  const state = Array.from(workspaces.values()).map((w) => ({
    ...w,
    pid: null,
    status: "stopped" as const,
  }));
  writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
}

function loadState() {
  const path = getStatePath();
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      for (const w of data) {
        workspaces.set(w.id, { ...w, status: "stopped", pid: null });
      }
    } catch {}
  }
}

// Load on startup
loadState();

export function listWorkspaces(): Workspace[] {
  return Array.from(workspaces.values());
}

export function getWorkspace(id: string): Workspace | undefined {
  return workspaces.get(id);
}

export function createWorkspace(
  name: string,
  type: string,
  features: string[] = []
): Workspace {
  const id = uuidv4().slice(0, 12);
  const workDir = join(DATA_DIR, "workspaces", id);
  mkdirSync(workDir, { recursive: true });

  const workspace: Workspace = {
    id,
    name: `magic-${name}`,
    type,
    status: "stopped",
    created: new Date().toISOString(),
    pid: null,
    port: null,
    features,
  };

  workspaces.set(id, workspace);
  logBuffers.set(id, []);
  saveState();
  return workspace;
}

export function startWorkspace(id: string): Workspace {
  const workspace = workspaces.get(id);
  if (!workspace) throw new Error("Workspace not found");
  if (workspace.status === "running") return workspace;

  const workDir = join(DATA_DIR, "workspaces", id);
  mkdirSync(workDir, { recursive: true });

  // Start a shell process for this workspace
  const proc = spawn("sh", [], {
    cwd: workDir,
    env: {
      ...process.env,
      MAGIC_WORKSPACE_ID: id,
      MAGIC_WORKSPACE_TYPE: workspace.type,
      HOME: workDir,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  processes.set(id, proc);
  logBuffers.set(id, logBuffers.get(id) || []);

  const appendLog = (data: Buffer) => {
    const lines = logBuffers.get(id) || [];
    lines.push(data.toString());
    // Keep last 500 lines
    if (lines.length > 500) lines.splice(0, lines.length - 500);
    logBuffers.set(id, lines);
  };

  proc.stdout?.on("data", appendLog);
  proc.stderr?.on("data", appendLog);

  proc.on("exit", () => {
    workspace.status = "stopped";
    workspace.pid = null;
    processes.delete(id);
    saveState();
  });

  workspace.status = "running";
  workspace.pid = proc.pid || null;
  saveState();
  return workspace;
}

export function stopWorkspace(id: string): Workspace {
  const workspace = workspaces.get(id);
  if (!workspace) throw new Error("Workspace not found");

  const proc = processes.get(id);
  if (proc) {
    proc.kill("SIGTERM");
    processes.delete(id);
  }

  workspace.status = "stopped";
  workspace.pid = null;
  saveState();
  return workspace;
}

export function removeWorkspace(id: string): void {
  stopWorkspace(id);
  workspaces.delete(id);
  logBuffers.delete(id);
  saveState();
}

export function getWorkspaceLogs(id: string): string {
  const lines = logBuffers.get(id) || [];
  return lines.join("") || "No logs yet.";
}

export function execInWorkspace(id: string, command: string): Promise<string> {
  const workspace = workspaces.get(id);
  if (!workspace) return Promise.reject(new Error("Workspace not found"));

  const workDir = join(DATA_DIR, "workspaces", id);
  mkdirSync(workDir, { recursive: true });

  return new Promise((resolve, reject) => {
    try {
      const output = execSync(command, {
        cwd: workDir,
        timeout: 10000,
        env: {
          ...process.env,
          MAGIC_WORKSPACE_ID: id,
          MAGIC_WORKSPACE_TYPE: workspace.type,
          HOME: workDir,
        },
        maxBuffer: 1024 * 1024,
      });
      const text = output.toString();

      // Also append to logs
      const lines = logBuffers.get(id) || [];
      lines.push(`$ ${command}\n${text}`);
      logBuffers.set(id, lines);

      resolve(text);
    } catch (err: any) {
      resolve(err.stderr?.toString() || err.stdout?.toString() || err.message);
    }
  });
}
