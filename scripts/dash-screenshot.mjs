import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400, deviceScaleFactor: 2 });

const errors = [];
const consoleLogs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

// Capture ALL network requests and responses
const requests = [];
page.on('requestfailed', req => {
  requests.push(`FAIL ${req.method()} ${req.url()} → ${req.failure()?.errorText}`);
});
page.on('response', res => {
  if (res.url().includes('/api/')) {
    requests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  }
});

await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'joe@smokyjoes.com.au', password: 'test1234' })
  });
});

await page.goto('http://localhost:3000/dashboard/vendor', { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 3000));

// Clear previous requests
requests.length = 0;

// Switch to menu panel
await page.evaluate(() => { if (typeof showPanel === 'function') showPanel('menu', null); });
await new Promise(r => setTimeout(r, 1500));

// Open the Add Item modal
await page.evaluate(() => { if (typeof openMenuModal === 'function') openMenuModal(); });
await new Promise(r => setTimeout(r, 1000));

// Fill in name field (required)
await page.type('#mi-name', 'Test Burger');
await new Promise(r => setTimeout(r, 500));

// Click Save item — capture the result
const saveResult = await page.evaluate(async () => {
  try {
    const btn = document.querySelector('.btn-modal-save');
    if (!btn) return 'BUTTON NOT FOUND';
    // Check if saveMenuItem exists
    if (typeof saveMenuItem !== 'function') return 'saveMenuItem function not defined';
    // Call it directly
    const result = await saveMenuItem();
    return 'saveMenuItem returned: ' + JSON.stringify(result);
  } catch(e) {
    return 'ERROR: ' + e.message + '\n' + e.stack;
  }
});
console.log('SAVE RESULT:', saveResult);
await new Promise(r => setTimeout(r, 2000));

// Report
if (errors.length) console.log('PAGE ERRORS:', JSON.stringify(errors, null, 2));
console.log('NETWORK:', JSON.stringify(requests, null, 2));
console.log('ALL CONSOLE:', JSON.stringify(consoleLogs.slice(-20), null, 2));

await page.screenshot({ path: 'screenshots/screenshot-save-test.png', fullPage: true });
console.log('Screenshot saved');

await browser.close();
