import type { NextConfig } from "next";

const repositoryRoot = process.cwd();

const nextConfig: NextConfig = {
  // Keep the repository-owned AGENTS.md stable when `next dev` detects a coding tool.
  agentRules: false,
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;
