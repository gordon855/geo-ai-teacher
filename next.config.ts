import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers(){return [{source:'/vendor/maplibre/:version/:file.mjs',headers:[{key:'Content-Type',value:'application/javascript; charset=utf-8'},{key:'X-Content-Type-Options',value:'nosniff'}]}];},
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["ali-oss", "pg", "undici"],
  experimental: {
    serverActions: {
      bodySizeLimit: "85mb",
    },
  },
};

export default nextConfig;
