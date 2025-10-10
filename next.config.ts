import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import fs from "fs";
import path from "path";

const secretsPath = path.join(__dirname, ".env.local.secrets");

if (process.env.NODE_ENV !== "production" && fs.existsSync(secretsPath)) {
  loadEnv({ path: secretsPath });
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["onnxruntime-node", "sharp", "@huggingface/transformers", "tesseract.js"],
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.cache = { type: "memory" };
    }
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = config.resolve.alias ?? {};
      config.resolve.alias["onnxruntime-node"] = false;
      config.resolve.alias["sharp"] = false;
    }
    return config;
  },
  turbopack: {
    // Explicitly define the project root so Next.js doesn't
    // mistakenly treat the repository root as the workspace root
    // when multiple lockfiles are present.
    root: __dirname,
  },
};

export default nextConfig;
