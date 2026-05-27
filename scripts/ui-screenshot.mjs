// Скриншоты ключевых страниц + клик «Рассчитать» через chrome (puppeteer-core).
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3007';
const EMAIL = 'admin@gidrostroy.local';
const PASSWORD = 'admin123';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1400, height: 1000 },
});
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text().slice(0, 200)}`);
});

// Login
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
  page.click('button[type="submit"]'),
]);

// Снимок страницы проекта (там должна быть исправлена Q)
async function snap(name, path) {
  errors.length = 0;
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `/tmp/g-station-${name}.png`, fullPage: true });
  return { name, path, status: 'OK', errors: errors.slice() };
}

const out = [];
out.push(await snap('project-e2e-fixed', '/projects/e2e-smoke-project'));

// Перейти на calc и нажать «Рассчитать»
await page.goto(`${BASE}/projects/e2e-smoke-project/systems/e2e-smoke-system/calc`, {
  waitUntil: 'networkidle0',
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/g-station-calc-before.png', fullPage: true });

// Клик «Рассчитать»
const btnClicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const calc = btns.find((b) => /Рассчитать/.test(b.textContent ?? ''));
  if (calc) {
    calc.click();
    return true;
  }
  return false;
});
out.push({ name: 'calc-button-clicked', clicked: btnClicked });

if (btnClicked) {
  // ждём появления результата (Сводка / Гейты)
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/g-station-calc-after.png', fullPage: true });
  await page.goto(`${BASE}/projects/e2e-smoke-project`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/tmp/g-station-project-after-calc.png', fullPage: true });
}

out.push(await snap('proposal-e2e', '/projects/e2e-smoke-project/proposal'));

writeFileSync('/tmp/g-station-report-v2.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
