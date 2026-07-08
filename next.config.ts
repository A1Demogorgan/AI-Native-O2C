import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["duckdb"],
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
