/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // mammoth (разбор .docx) тянет Node-зависимости — не бандлить в webpack.
  serverExternalPackages: ['mammoth'],
  experimental: {
    // Парсинг ТЗ принимает пакет до 400 МБ (разделы ПД с ЭЦП бывают тяжёлыми,
    // один файл до 200 МБ) — поднимаем лимит тела Server Actions
    // (по умолчанию Next режет на 1 МБ).
    // allowedOrigins — чтобы Server Actions работали через туннель/прокси
    // (ngrok) и в Docker за nginx, иначе Next блокирует запрос по Origin.
    serverActions: {
      bodySizeLimit: '400mb',
      allowedOrigins: ['localhost:3007', '127.0.0.1:3007', '*.ngrok-free.dev', '*.ngrok.app'],
    }
  },
  env: {
    NEXT_PUBLIC_AI_MODE: process.env.NEXT_PUBLIC_AI_MODE || 'mock'
  }
};

export default nextConfig;
