import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const isCloudflare = process.env.CF_PAGES === '1';
const repoName = 'weborgnizatoinmgt'; // 레포지토리 이름

const nextConfig: NextConfig = {
  output: 'export',
  // Cloudflare에서는 루트(/)를 사용하고, GitHub Pages에서는 레포지토리 이름을 사용합니다.
  basePath: isProd && !isCloudflare ? `/${repoName}` : '',
  assetPrefix: isProd && !isCloudflare ? `/${repoName}/` : '',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  /* config options here */
};

export default nextConfig;
