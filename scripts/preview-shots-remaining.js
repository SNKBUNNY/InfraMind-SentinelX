// Quick shots for remaining tabs
const { chromium } = require('playwright');
const SHOT_DIR = '/home/z/my-project/download/preview';
const BASE = 'http://localhost:3000';

const REMAINING = [
  { label: '17-backup-recovery', navLabel: 'Backup & Recovery',  wait: 2500 },
  { label: '18-policy-compiler', navLabel: 'Policy Compiler',    wait: 2000 },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const clickTab = async (label) => {
    try {
      await page.click(`button[title="${label}"]`, { timeout: 4000 });
    } catch {
      try {
        await page.locator(`button:has(span:text("${label}"))`).first().click({ timeout: 3000 });
      } catch {}
    }
  };

  for (const s of REMAINING) {
    try {
      await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);
      await clickTab(s.navLabel);
      await page.waitForTimeout(s.wait);
      const path = `${SHOT_DIR}/${s.label}.png`;
      await page.screenshot({ path, fullPage: false });
      console.log(`OK  ${s.label}  →  ${path}`);
    } catch (e) {
      console.log(`ERR ${s.label}  →  ${e.message.substring(0, 120)}`);
    }
  }
  await browser.close();
  console.log('Done.');
})();
