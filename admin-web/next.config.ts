import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@evscrap/api-client'],
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
