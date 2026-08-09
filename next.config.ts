import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist resolves its worker script relative to its own package
  // directory at runtime; bundling it breaks that resolution, so it needs
  // to stay a native require in server code.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
