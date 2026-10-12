import os from "node:os";
import type { NextConfig } from "next";

// LAN addresses of this machine, so other devices on the Wi-Fi can use the dev server.
const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  // The dev indicator sits bottom-left, on top of the rail's profile avatar.
  devIndicators: false,
  // slack.localhost / slack.local are served by scripts/lan.mjs (make lan).
  // *.trycloudflare.com: public tunnel (make tunnel).
  allowedDevOrigins: ["slack.local", "*.local", "*.trycloudflare.com", ...lanIps],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
