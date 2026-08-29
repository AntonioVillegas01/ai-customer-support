import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output is required by apps/web/Dockerfile runtime stage.
  output: 'standalone',
  transpilePackages: ['@acs/contracts'],
};

export default nextConfig;
