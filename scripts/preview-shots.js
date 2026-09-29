// Take screenshots of the InfraMind-SentinelX dashboard for preview
const { chromium } = require('playwright');

const SHOT_DIR = '/home/z/my-project/download/preview';
const BASE = 'http://localhost:3000';

const SHOTS = [
  { label: '01-overview',         navLabel: 'Overview',          wait: 2500 },
  { label: '02-live-monitor',    navLabel: 'Live Monitor',       wait: 2000 },
  { label: '03-infrastructure',   navLabel: 'Infrastructure',     wait: 2000 },
  { label: '04-anomalies',       navLabel: 'Anomalies',          wait: 2000 },
  { label: '05-security-events', navLabel: 'Security Events',     wait: 2000 },
  { label: '06-threats',         navLabel: 'Threat Detection',   wait: 2000 },
  { label: '07-incidents',       navLabel: 'Incidents',          wait: 2000 },
  { label: '08-attack-paths',    navLabel: 'Attack Paths',        wait: 2000 },
  { label: '09-threat-hunt',     navLabel: 'Threat Hunting',     wait: 2500 },
  { label: '10-assets-vulns',    navLabel: 'Assets & Vulns',    wait: 2000 },
  { label: '11-ai-chatops',      navLabel: 'AI ChatOps',         wait: 2000 },
  { label: '12-rag-knowledge',   navLabel: 'RAG Knowledge',     wait: 2000 },
  { label: '13-agentic-ai',      navLabel: 'Agentic AI',         wait: 2000 },
  { label: '14-adversarial-ai',  navLabel: 'Adversarial AI',    wait: 2000 },
  { label: '15-ai-gateway',      navLabel: 'AI Gateway',         wait: 2000 },
  { label: '16-integrations',    navLabel: 'Integrations',       wait: 2000 },
  { label: '17-backup-recovery', navLabel: 'Backup & Recovery',  wait: 2000 },
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

  // Helper: click a sidebar tab by its label
  // The sidebar buttons have title="<label>" and contain the label text
  const clickTab = async (label) => {
    try {
      // Try clicking the button whose title attribute matches
      await page.click(`button[title="${label}"]`, { timeout: 4000 });
    } catch {
      try {
        // Fallback: click by visible text in the sidebar
        await page.locator('button:has(span:text("' + label + '"))').first().click({ timeout: 3000 });
      } catch {}
    }
  };

  for (const s of SHOTS) {
    try {
      await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1200);
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
