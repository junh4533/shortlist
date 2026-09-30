import type { NextConfig } from "next";
import { loadEnvDev } from "./src/lib/load-env-dev";

loadEnvDev();

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "unpdf", "mammoth"],
  agentRules: false,
};

export default nextConfig;
