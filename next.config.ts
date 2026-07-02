import type { NextConfig } from "next";
import os from "os";

/** LAN IPs for mobile testing — Next.js 16 blocks /_next/* without this in dev. */
function localDevOrigins(): string[] {
  const origins = new Set([
    "localhost",
    "127.0.0.1",
    "*.localhost",
  ]);

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        origins.add(entry.address);
      }
    }
  }

  const extra = process.env.DEV_ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const host of extra ?? []) origins.add(host);

  return [...origins];
}

const devOrigins = localDevOrigins();

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: devOrigins,
    },
  },
  async headers() {
    return [
      {
        source: "/book/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://waketeam.by https://www.waketeam.by http://localhost:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
