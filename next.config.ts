import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 采集站/豆瓣等地址运行时由管理员配置，构建期无法枚举，关闭图片优化
  images: { unoptimized: true },
};

export default nextConfig;

initOpenNextCloudflareForDev();
