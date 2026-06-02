/**
 * Публичный доступ к приложению через ngrok — БИБЛИОТЕКА (@ngrok/ngrok), не CLI.
 * Работает с включённым VPN/прокси (на pay-as-you-go проксируемое соединение
 * разрешено; библиотека внутри node-процесса поднимает туннель надёжнее CLI).
 *
 * Запуск:  npm run tunnel    (или  node scripts/tunnel.mjs)
 * Держите терминал открытым — туннель живёт, пока работает процесс.
 *
 * Параметры через env (есть дефолты):
 *   NGROK_AUTHTOKEN  — токен агента (по умолчанию — текущий аккаунта).
 *   NGROK_DOMAIN     — статический домен (по умолчанию registrar-scheme-headsman).
 *   PORT             — порт приложения (по умолчанию 3007).
 */
import ngrok from '@ngrok/ngrok';

const authtoken = process.env.NGROK_AUTHTOKEN;
const domain = process.env.NGROK_DOMAIN || 'registrar-scheme-headsman.ngrok-free.dev';
const addr = Number(process.env.PORT || 3007);

if (!authtoken) {
  console.error('\n❌ Не задан NGROK_AUTHTOKEN (положите его в .env или передайте через env).');
  process.exit(1);
}

try {
  const listener = await ngrok.forward({ addr, authtoken, domain });
  console.log('\n✅ Туннель поднят:');
  console.log('   ' + listener.url());
  console.log(`   → проксирует на http://localhost:${addr}`);
  console.log('\nДержите это окно открытым. Ctrl+C — остановить.\n');
} catch (e) {
  console.error('\n❌ Не удалось поднять туннель:');
  console.error('   ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
}

// Держим процесс живым и аккуратно гасим по Ctrl+C.
const keep = setInterval(() => {}, 1 << 30);
const stop = async () => {
  clearInterval(keep);
  try { await ngrok.disconnect(); } catch { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
