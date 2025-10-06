import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import fs from "fs";
import path from "path";

const secretsPath = path.join(__dirname, ".env.local.secrets");

if (process.env.NODE_ENV !== "production" && fs.existsSync(secretsPath)) {
  loadEnv({ path: secretsPath });
}

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly define the project root so Next.js doesn't
    // mistakenly treat the repository root as the workspace root
    // when multiple lockfiles are present.
    root: __dirname,
  },
};

export default nextConfig;
