import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent SDK spawns the native `claude` binary and pulls in Node built-ins
  // (child_process, fs). Keep it (and the CLI package) out of the bundler so
  // Turbopack doesn't try to trace/inline a compiled executable.
  serverExternalPackages: ['@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-code'],
};

export default nextConfig;
