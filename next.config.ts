import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'weborgnizatoinmgt'; // 레포지토리 이름 (오타 포함)

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isProd ? `/${repoName}` : '',
  assetPrefix: isProd ? `/${repoName}/` : '',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  /* config options here */
};

export default nextConfig;
