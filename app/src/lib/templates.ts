export interface ContainerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  image: string;
  env: string[];
  ports: { [key: string]: string };
  features: string[];
}

export const templates: ContainerTemplate[] = [
  {
    id: "email-manager",
    name: "Email Manager",
    description:
      "AI-powered email management. Summarize, categorize, and draft replies using Claude MCP.",
    icon: "📧",
    category: "productivity",
    image: "magic-email:latest",
    env: ["OPENCLAW_ENABLED=true", "MCP_ENABLED=true"],
    ports: { "3100/tcp": "3100" },
    features: [
      "AI email summarization",
      "Smart categorization",
      "Draft replies with AI",
      "Unsubscribe automation",
    ],
  },
  {
    id: "email-unsubscriber",
    name: "Email Unsubscriber",
    description:
      "Automatically find and unsubscribe from unwanted email lists.",
    icon: "🚫",
    category: "productivity",
    image: "magic-unsubscriber:latest",
    env: ["OPENCLAW_ENABLED=true"],
    ports: { "3101/tcp": "3101" },
    features: [
      "Scan for subscription emails",
      "One-click unsubscribe",
      "Blocklist management",
      "Weekly cleanup reports",
    ],
  },
  {
    id: "email-reader",
    name: "Clean Email Reader",
    description:
      "Distraction-free email reading with yes/no/reply quick actions.",
    icon: "📖",
    category: "productivity",
    image: "magic-reader:latest",
    env: [],
    ports: { "3102/tcp": "3102" },
    features: [
      "Clean reading view",
      "Yes / No / Reply actions",
      "AI-generated draft replies",
      "Priority inbox",
    ],
  },
  {
    id: "crypto-tracker",
    name: "Crypto Workspace",
    description:
      "Private crypto portfolio tracking, DeFi monitoring, and wallet management.",
    icon: "🪙",
    category: "finance",
    image: "magic-crypto:latest",
    env: ["OPENCLAW_ENABLED=true"],
    ports: { "3200/tcp": "3200" },
    features: [
      "Portfolio tracking",
      "DeFi position monitoring",
      "Wallet analytics",
      "Price alerts via AI",
    ],
  },
  {
    id: "dev-workspace",
    name: "Dev Workspace",
    description:
      "Full development environment with code editor, terminal, and AI assistant.",
    icon: "💻",
    category: "development",
    image: "magic-dev:latest",
    env: ["OPENCLAW_ENABLED=true"],
    ports: { "3300/tcp": "3300", "8080/tcp": "8080" },
    features: [
      "VS Code in browser",
      "AI pair programming",
      "Git integration",
      "Live preview",
    ],
  },
  {
    id: "ai-agent",
    name: "AI Agent",
    description:
      "Deploy an OpenClaw agent that runs tasks autonomously on your behalf.",
    icon: "🤖",
    category: "ai",
    image: "magic-agent:latest",
    env: ["OPENCLAW_ENABLED=true", "AGENT_MODE=autonomous"],
    ports: { "3400/tcp": "3400" },
    features: [
      "Autonomous task execution",
      "Long-running workflows",
      "Self-improving skills",
      "Multi-tool integration",
    ],
  },
  {
    id: "file-manager",
    name: "File Manager",
    description: "Cloud file storage with AI-powered search and organization.",
    icon: "📁",
    category: "productivity",
    image: "magic-files:latest",
    env: [],
    ports: { "3500/tcp": "3500" },
    features: [
      "100GB storage",
      "AI file search",
      "Auto-organization",
      "Sync across devices",
    ],
  },
  {
    id: "web-scraper",
    name: "Web Scraper",
    description:
      "Automated web scraping and data collection with AI parsing.",
    icon: "🕷️",
    category: "data",
    image: "magic-scraper:latest",
    env: ["OPENCLAW_ENABLED=true"],
    ports: { "3600/tcp": "3600" },
    features: [
      "Visual scraper builder",
      "AI data extraction",
      "Scheduled scrapes",
      "Export to CSV/JSON",
    ],
  },
];

export function getTemplate(id: string): ContainerTemplate | undefined {
  return templates.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: string): ContainerTemplate[] {
  return templates.filter((t) => t.category === category);
}

export const categories = [
  { id: "productivity", name: "Productivity", icon: "⚡" },
  { id: "finance", name: "Finance", icon: "💰" },
  { id: "development", name: "Development", icon: "🛠️" },
  { id: "ai", name: "AI & Agents", icon: "🧠" },
  { id: "data", name: "Data", icon: "📊" },
];
