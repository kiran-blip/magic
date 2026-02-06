import Docker from "dockerode";

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
});

export interface MagicContainer {
  id: string;
  name: string;
  type: string;
  status: string;
  created: string;
  ports: { [key: string]: string };
  labels: { [key: string]: string };
}

export async function listContainers(): Promise<MagicContainer[]> {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["magic.computer=true"] },
    });
    return containers.map((c) => ({
      id: c.Id.slice(0, 12),
      name: c.Names[0]?.replace("/", "") || "unknown",
      type: c.Labels["magic.type"] || "custom",
      status: c.State || "unknown",
      created: new Date(c.Created * 1000).toISOString(),
      ports: Object.fromEntries(
        (c.Ports || []).map((p) => [
          `${p.PrivatePort}/${p.Type}`,
          p.PublicPort ? `${p.IP || "0.0.0.0"}:${p.PublicPort}` : "not exposed",
        ])
      ),
      labels: c.Labels || {},
    }));
  } catch (err) {
    console.error("Docker list error:", err);
    return [];
  }
}

export async function createContainer(
  name: string,
  type: string,
  image: string,
  env: string[] = [],
  ports: { [key: string]: string } = {}
): Promise<string> {
  const exposedPorts: { [key: string]: {} } = {};
  const portBindings: { [key: string]: { HostPort: string }[] } = {};

  for (const [containerPort, hostPort] of Object.entries(ports)) {
    exposedPorts[containerPort] = {};
    portBindings[containerPort] = [{ HostPort: hostPort }];
  }

  const container = await docker.createContainer({
    Image: image,
    name: `magic-${name}`,
    Env: env,
    Labels: {
      "magic.computer": "true",
      "magic.type": type,
      "magic.name": name,
    },
    ExposedPorts: exposedPorts,
    HostConfig: {
      PortBindings: portBindings,
      RestartPolicy: { Name: "unless-stopped" },
    },
  });

  await container.start();
  return container.id.slice(0, 12);
}

export async function stopContainer(id: string): Promise<void> {
  const container = docker.getContainer(id);
  await container.stop();
}

export async function startContainer(id: string): Promise<void> {
  const container = docker.getContainer(id);
  await container.start();
}

export async function removeContainer(id: string): Promise<void> {
  const container = docker.getContainer(id);
  try {
    await container.stop();
  } catch {
    // already stopped
  }
  await container.remove();
}

export async function getContainerLogs(
  id: string,
  tail: number = 100
): Promise<string> {
  const container = docker.getContainer(id);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    follow: false,
  });
  return logs.toString();
}

export async function execInContainer(
  id: string,
  cmd: string[]
): Promise<string> {
  const container = docker.getContainer(id);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    let output = "";
    stream.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    stream.on("end", () => resolve(output));
    stream.on("error", reject);
  });
}

export { docker };
