import type { NextConfig } from "next";

// Where Express runs. Read when Next.js builds, so Docker and Vercel must pass it at build time.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Minimal self-contained server in .next/standalone, used by the Dockerfile
  output: "standalone",
  // The browser only talks to Next.js, which forwards /api/* to Express.
  // One site for the browser, so the httpOnly login cookie works without CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
