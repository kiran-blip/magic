import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "ccxt", "protobufjs"],
  turbopack: {
    resolveAlias: {
      // Avoid bundling ccxt which has protobufjs issues
      "ccxt": { import: "ccxt", require: "ccxt" },
    },
  },
};

export default nextConfig;
