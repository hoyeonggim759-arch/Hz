import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
  async rewrites() {
    // Keep browser requests same-origin so the HttpOnly __Host- session cookie
    // is handled by the JinqSMS web origin. Render supplies API_ORIGIN at build time.
    const apiOrigin = (process.env.API_ORIGIN || "http://localhost:4000").replace(/\/+$/, "");
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
};
export default nextConfig;
