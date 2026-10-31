import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@hybrid/core", "@hybrid/runtime"],
  poweredByHeader: false,
};
export default config;
