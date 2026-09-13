import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server's HMR/JS assets load when opened from another
  // device on the LAN (e.g. testing on a phone) — Next.js 16 blocks
  // cross-origin dev resource requests by default. Dev-only; irrelevant
  // in production, where there's no dev server to protect.
  allowedDevOrigins: ["192.168.1.30"],
};

export default nextConfig;
