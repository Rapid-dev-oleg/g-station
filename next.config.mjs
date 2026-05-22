/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // mammoth (разбор .docx) тянет Node-зависимости — не бандлить в webpack.
  serverExternalPackages: ['mammoth'],
  experimental: {},
  env: {
    NEXT_PUBLIC_AI_MODE: process.env.NEXT_PUBLIC_AI_MODE || 'mock'
  }
};

export default nextConfig;
