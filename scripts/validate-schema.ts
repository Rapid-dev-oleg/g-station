/**
 * Прогон всех расчётных дел-фикстур через JSON Schema.
 * Запуск: npm run validate:schema
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDossier } from '../src/lib/dossier/validate';

const FIXTURES = join(process.cwd(), 'src/lib/dossier/fixtures');

let ok = 0;
let fail = 0;

for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
  const { valid, errors } = validateDossier(data);
  if (valid) {
    ok++;
    console.log(`  ✓ ${file}`);
  } else {
    fail++;
    console.log(`  ✗ ${file}`);
    errors.slice(0, 5).forEach((e) => console.log(`      ${e}`));
  }
}

console.log(`\nИтог: валидно ${ok}, невалидно ${fail}`);
process.exit(fail > 0 ? 1 : 0);
