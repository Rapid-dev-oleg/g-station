/**
 * Пробник логина на v3.cnppump.ltd. Запускает headless Chrome, идёт на форму
 * логина по email, заполняет креды, ждёт ответ, печатает:
 *   - URL и payload запроса логина (откуда узнать API);
 *   - URL и заголовок ответа (формат токена/куки);
 *   - localStorage и cookies после успешного логина (что хранится для сессии).
 *
 * Если не находит селекторы формы — выведет HTML страницы для ручного разбора.
 *
 * Запуск: node scripts/cnp-login-probe.mjs <email> <password>
 */
import puppeteer from 'puppeteer-core';

const EMAIL = process.argv[2];
const PASS = process.argv[3];
if (!EMAIL || !PASS) {
  console.error('usage: node cnp-login-probe.mjs <email> <password>');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ru-RU'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const reqs = [];
page.on('request', (r) => {
  if (r.resourceType() === 'xhr' || r.resourceType() === 'fetch') {
    reqs.push({ url: r.url(), method: r.method(), body: r.postData() });
  }
});
const resps = [];
page.on('response', async (r) => {
  const ct = r.headers()['content-type'] ?? '';
  if (ct.includes('json')) {
    try {
      const text = await r.text();
      resps.push({ url: r.url(), status: r.status(), body: text.slice(0, 800) });
    } catch {
      /* ignore */
    }
  }
});

console.error('[probe] открываю /RU/login/email');
await page.goto('https://v3.cnppump.ltd/#/RU/login/email', {
  waitUntil: 'networkidle2',
  timeout: 60_000,
});
await new Promise((r) => setTimeout(r, 3000));

// Печатаем HTML формы (для отладки селекторов)
const formHtml = await page.evaluate(() => {
  const form =
    document.querySelector('form') ||
    document.querySelector('.login') ||
    document.querySelector('[class*=login]');
  return form ? form.outerHTML.slice(0, 4000) : document.body.innerHTML.slice(0, 4000);
});
console.error('[probe] HTML формы (первые 4 КБ):');
console.error(formHtml);
console.error('---');

// Активная вкладка — email (по умолчанию). Ищем поля ВНУТРИ pane-email.
const inputIds = await page.evaluate(() => {
  const pane = document.querySelector('#pane-email');
  if (!pane) return { ok: false, reason: 'no pane-email' };
  const inputs = Array.from(pane.querySelectorAll('input'));
  const emailIn = inputs.find(
    (i) =>
      i.type === 'email' ||
      /email|почт|mail/i.test(i.placeholder ?? '') ||
      /email|почт|mail/i.test(i.name ?? ''),
  );
  const passIn = inputs.find((i) => i.type === 'password');
  if (!emailIn || !passIn) return { ok: false, count: inputs.length, placeholders: inputs.map((i) => i.placeholder) };
  return { ok: true, emailId: emailIn.id, passId: passIn.id };
});
console.error('[probe] поля внутри #pane-email:', inputIds);

if (inputIds.ok) {
  // Реальный type через клавиатуру — Element Plus / Vue среагирует.
  await page.focus(`#${inputIds.emailId}`);
  await page.keyboard.type(EMAIL, { delay: 30 });
  await page.focus(`#${inputIds.passId}`);
  await page.keyboard.type(PASS, { delay: 30 });
  console.error('[probe] поля заполнены через keyboard.type');

  // Ищем primary-кнопку «Войти» внутри pane-email (Element Plus: el-button--primary)
  const clicked = await page.evaluate(() => {
    const pane = document.querySelector('#pane-email');
    if (!pane) return false;
    const btns = Array.from(pane.querySelectorAll('button, .el-button, [role=button]'));
    const primary =
      btns.find((b) => b.className.includes('el-button--primary')) ??
      btns.find((b) => /войти|вход\b|login|sign\s*in|登录/i.test((b.textContent ?? '').trim()));
    if (primary) {
      primary.click();
      return primary.textContent.trim();
    }
    return false;
  });
  console.error('[probe] кликнул кнопку:', clicked);

  // Ждём ответ от api.cnppump.ltd (любой первый XHR на этот хост)
  try {
    const resp = await page.waitForResponse((r) => r.url().includes('api.cnppump.ltd'), {
      timeout: 15_000,
    });
    console.error(`[probe] первый API-ответ: ${resp.status()} ${resp.url()}`);
  } catch (e) {
    console.error('[probe] ни одного запроса на api.cnppump.ltd за 15 сек');
  }
  // Дать обработать редирект
  await new Promise((r) => setTimeout(r, 3000));
}

// Кукиз/localStorage после логина
const cookies = await page.cookies();
const ls = await page.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    o[k] = localStorage.getItem(k).slice(0, 300);
  }
  return o;
});

console.log(JSON.stringify({
  xhr_requests: reqs.slice(-25),
  json_responses: resps.slice(-25),
  cookies: cookies.map((c) => ({ name: c.name, domain: c.domain, value: c.value.slice(0, 100) })),
  localStorage: ls,
  currentUrl: page.url(),
}, null, 2));

await browser.close();
