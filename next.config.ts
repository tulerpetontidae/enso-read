import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack config for production builds (Vercel uses webpack for production)
  webpack: (config, { isServer }) => {
    // Handle WASM files for Bergamot translator
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    
    // Ensure .wasm files are handled correctly
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    
    return config;
  },
  // Turbopack config for dev mode (Next.js 16 uses Turbopack by default in dev)
  // WASM support in Turbopack is enabled by default, so empty config is fine
  turbopack: {},
};

export default nextConfig;
