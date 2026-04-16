import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

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

// Switch to menu panel
await page.evaluate(() => showPanel('menu', null));
await new Promise(r => setTimeout(r, 1500));

// Screenshot menu list
await page.screenshot({ path: 'screenshots/screenshot-menu-list.png', fullPage: true });
console.log('Menu list screenshot saved');

// Click first card to verify edit still works
await page.evaluate(() => {
  const card = document.querySelector('.menu-item-card');
  if (card) card.click();
});
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: 'screenshots/screenshot-menu-edit.png', fullPage: true });
console.log('Menu edit screenshot saved');

await browser.close();
