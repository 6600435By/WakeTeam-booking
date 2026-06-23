import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
