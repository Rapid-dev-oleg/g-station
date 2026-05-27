/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // mammoth (разбор .docx) тянет Node-зависимости — не бандлить в webpack.
  serverExternalPackages: ['mammoth'],
  experimental: {
    // Парсинг ТЗ принимает пакет до 40 МБ — поднимаем лимит тела Server Actions
    // (по умолчанию Next режет на 1 МБ).
    serverActions: { bodySizeLimit: '40mb' }
  },
  env: {
    NEXT_PUBLIC_AI_MODE: process.env.NEXT_PUBLIC_AI_MODE || 'mock'
  }
};

export default nextConfig;
