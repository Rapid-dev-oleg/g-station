// Тест IntakeFlow: загрузка реального ТЗ-документа + парсинг ИИ.
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:3007';
const EMAIL = 'admin@gidrostroy.local';
const PASSWORD = 'admin123';
const TZ_FILE =
  '/home/oblacko/Projects/gidrostroy/Данные/AI (Анохин)/Вход 5 (Анохин)/25-02-НВ.ОЛ3 Рев. 01.docx';

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

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
  page.click('button[type="submit"]'),
]);

await page.goto(`${BASE}/intake`, { waitUntil: 'networkidle0' });
const fileInput = await page.$('input[type="file"]');
if (!fileInput) {
  console.log('NO FILE INPUT');
  process.exit(1);
}
await fileInput.uploadFile(TZ_FILE);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/g-station-intake-uploaded.png', fullPage: true });

// Кликаем «Распарсить документ»
const parseClicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const parse = btns.find((b) => /Распарсить/.test(b.textContent ?? ''));
  if (parse && !parse.disabled) {
    parse.click();
    return true;
  }
  return parse ? 'disabled' : false;
});
console.log('parseClicked:', parseClicked);

// Ждём ответа от LLM (может быть долго — до 60 сек)
await new Promise((r) => setTimeout(r, 25000));
await page.screenshot({ path: '/tmp/g-station-intake-parsed.png', fullPage: true });

console.log('errors:', errors);
console.log('current URL:', page.url());
await browser.close();
