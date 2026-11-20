// Usage: node tools/screenshot.mjs <out.png> [query]   e.g. "res=0&fog=1"
// Starts Vite, opens the game headless at 640×360 (16:9) and saves a screenshot.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
// Playwright is used from the global install (not a project dependency).
const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] || 'screenshots/progress/latest.png';
const query = process.argv[3] || '';
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${url}?shot=1&${query}`);
await page.waitForFunction(() => window.__vulgshire?.ready, null, { timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: out });
await browser.close();
await server.close();
if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
console.log('saved', out);
