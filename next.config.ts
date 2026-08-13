import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist resolves its worker script relative to its own package
  // directory at runtime; bundling it breaks that resolution, so it needs
  // to stay a native require in server code.
  serverExternalPackages: ["pdfjs-dist"],

  // Reaching the dev server over the LAN — from a phone, or another machine —
  // otherwise loads the page but not its JavaScript: `next dev` blocks
  // cross-origin requests to /_next/* dev resources by default, and the origin
  // it was started on (localhost) is the only one allowed. The pages and API
  // routes are never blocked, so the failure looks like a working site whose
  // buttons do nothing: every "use client" component silently fails to hydrate.
  //
  // Matching is segment-wise on ".", so this covers the whole local subnet and
  // survives DHCP handing out a different address. Development only — `next
  // build` ignores it.
  allowedDevOrigins: ["192.168.1.*"],
};

export default nextConfig;
