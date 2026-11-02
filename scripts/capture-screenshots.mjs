import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '../apps/web/node_modules/@playwright/test/index.mjs';

const out = resolve('docs/screenshots');
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'es-419' });
await page.goto('http://127.0.0.1:4200/login');
await page.getByLabel('Correo').fill('capturas@linkshelf.dev');
await page.getByLabel('Contraseña').fill('linkshelf-prueba');
await page.getByRole('button', { name: 'Entrar en local' }).click();
await page.waitForURL(/\/links/);

const samples = [
  ['https://github.com/vercel/next.js?utm_source=tldrnewsletter', 'Next.js, el framework de React'],
  ['https://arxiv.org/pdf/1706.03762v5.pdf', 'Attention Is All You Need'],
  [
    'https://www.smashingmagazine.com/2026/10/design-systems/?utm_medium=email',
    'Design systems que escalan',
  ],
  [
    'https://www.example.com/post/?utm_source=tldrnewsletter&utm_medium=email',
    'Una guía de prueba',
  ],
];

for (const [url, title] of samples) {
  await page.goto('http://127.0.0.1:4200/links/new');
  await page.getByLabel('URL').fill(url);
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByLabel('Título').fill(title);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText('Enlace guardado').waitFor();
}

await page.goto('http://127.0.0.1:4200/links');
await page.getByRole('link', { name: 'Una guía de prueba' }).waitFor();
await page.screenshot({ path: resolve(out, 'biblioteca.png') });

await page.goto('http://127.0.0.1:4200/links/new');
await page.getByLabel('URL').fill('https://example.com/post?utm_campaign=otra');
await page.getByRole('button', { name: 'Revisar' }).click();
await page.getByText('Ya guardaste este enlace').waitFor();
await page.screenshot({ path: resolve(out, 'guardar-duplicado.png'), fullPage: true });
await browser.close();

const extension = resolve('apps/extension/.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', {
  headless: false,
  viewport: { width: 420, height: 720 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html?preview=1`);
await popup.getByText('Posible duplicado').waitFor();
await popup.screenshot({ path: resolve(out, 'extension-popup.png') });
await context.close();

console.log('capturas listas');
