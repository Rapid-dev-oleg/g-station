/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {},
  env: {
    NEXT_PUBLIC_AI_MODE: process.env.NEXT_PUBLIC_AI_MODE || 'mock'
  }
};

export default nextConfig;
