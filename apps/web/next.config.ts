import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@acs/contracts'],
};

export default nextConfig;
