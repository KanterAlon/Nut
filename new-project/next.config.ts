import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly define the project root so Next.js doesn't
    // mistakenly treat the repository root as the workspace root
    // when multiple lockfiles are present.
    root: __dirname,
  },
};

export default nextConfig;
