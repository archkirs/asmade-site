import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'https://useasmade.com';
const RESULT_PATH = 'audit-output/audit-result.json';
const FINAL_PATH = 'audit-output/final-gate.json';
const failures = [];
const checks = [];

function check(ok, scope, detail) {
  checks.push({ ok, scope, detail });
  if (!ok) failures.push({ scope, detail });
}

async function fetchText(pathname) {
  const response = await fetch(`${BASE}${pathname}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'AsMade-Issue-100-Final-Gate/1.0' },
  });
  const text = await response.text();
  return { response, text };
}

async function main() {
  const raw = await fs.readFile(RESULT_PATH, 'utf8');
  const result = JSON.parse(raw);

  const legacyNonShellFailures = result.failures.filter(
    (item) => !(item.scope?.startsWith('Shell ') && ['one shared header', 'one shared footer'].includes(item.detail)),
  );
  check(legacyNonShellFailures.length === 0, 'Legacy audit', `non-shell failures: ${legacyNonShellFailures.length}`);

  const expectedLegacyShellFalsePositives = result.summary?.pages * 2;
  const legacyShellFailures = result.failures.filter(
    (item) => item.scope?.startsWith('Shell ') && ['one shared header', 'one shared footer'].includes(item.detail),
  );
  check(
    legacyShellFailures.length === expectedLegacyShellFalsePositives,
    'Legacy audit',
    `known shell-regex false positives: ${legacyShellFailures.length}/${expectedLegacyShellFalsePositives}`,
  );

  check(result.httpResults.length === 12, 'HTTP', `canonical routes audited: ${result.httpResults.length}`);
  check(result.httpResults.every((item) => item.status === 200), 'HTTP', 'all canonical routes return 200');
  check(result.browserResults.length === 36, 'Browser', `route/viewport renders audited: ${result.browserResults.length}`);
  check(result.browserResults.every((item) => item.headerVisible), 'Browser', 'shared header visible in all renders');
  check(result.browserResults.every((item) => item.footerVisible), 'Browser', 'shared footer visible in all renders');
  check(result.browserResults.every((item) => item.navCount === 5), 'Browser', 'five navigation cells in all renders');
  check(result.browserResults.every((item) => item.overflow <= 1), 'Browser', 'horizontal overflow is within tolerance in all renders');
  check(result.browserResults.every((item) => item.invisibleFades === 0), 'Browser', 'no meaningful fade content remains hidden');
  check(result.browserResults.every((item) => item.mobileGrid), 'Browser', 'mobile navigation grid passes');
  check(result.browserResults.every((item) => item.mobileCellsVisible), 'Browser', 'all five mobile navigation cells remain visible');

  const audiencePages = ['/', '/student.html', '/artist.html', '/reviewer.html'];
  const publicStyles = [
    ['/v4-audience-base.css', '/lab/v4/v4.css'],
    ['/v4-audience-pages.css', '/lab/v4/audience.css'],
    ['/v4-audience-polish.css', '/lab/v4/polish.css'],
  ];

  for (const route of audiencePages) {
    const { response, text } = await fetchText(route);
    check(response.status === 200, `Audience HTML ${route}`, `status ${response.status}`);
    check(!text.includes('/lab/v4/'), `Audience HTML ${route}`, 'no /lab/v4/ reference in canonical HTML');
    for (const [publicPath] of publicStyles) {
      check(text.includes(`href="${publicPath}"`), `Audience HTML ${route}`, `${publicPath} referenced`);
    }
  }

  for (const [publicPath, adoptedPath] of publicStyles) {
    const publicAsset = await fetchText(publicPath);
    const adoptedAsset = await fetchText(adoptedPath);
    const publicType = publicAsset.response.headers.get('content-type') || '';
    const adoptedType = adoptedAsset.response.headers.get('content-type') || '';

    check(publicAsset.response.status === 200, `CSS ${publicPath}`, `public status ${publicAsset.response.status}`);
    check(publicType.includes('text/css'), `CSS ${publicPath}`, `public content-type ${publicType}`);
    check(adoptedAsset.response.status === 200, `CSS ${adoptedPath}`, `adopted source status ${adoptedAsset.response.status}`);
    check(adoptedType.includes('text/css'), `CSS ${adoptedPath}`, `adopted source content-type ${adoptedType}`);
    check(publicAsset.text === adoptedAsset.text, `CSS ${publicPath}`, `byte-equivalent to adopted source ${adoptedPath}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { key: 'desktop', width: 1440, height: 900 },
      { key: 'mobile390', width: 390, height: 844 },
      { key: 'mobile320', width: 320, height: 760 },
    ]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      for (const route of audiencePages) {
        const response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
        const visual = await page.evaluate(() => {
          const hero = document.querySelector('.hero');
          const shellHeader = document.querySelector('.asmade-header');
          return {
            statusStyled: !!hero && getComputedStyle(hero).display === 'grid',
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            headerVisible: !!shellHeader && shellHeader.getBoundingClientRect().height > 0,
          };
        });
        check(response?.status() === 200, `Final browser ${viewport.key} ${route}`, `status ${response?.status()}`);
        check(visual.statusStyled, `Final browser ${viewport.key} ${route}`, 'V4 hero grid styling applied');
        check(visual.overflow <= 1, `Final browser ${viewport.key} ${route}`, `horizontal overflow ${visual.overflow}px`);
        check(visual.headerVisible, `Final browser ${viewport.key} ${route}`, 'shared header visible');
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const output = {
    generatedAt: new Date().toISOString(),
    production: BASE,
    checks,
    failures,
    summary: { checks: checks.length, failures: failures.length },
  };
  await fs.writeFile(FINAL_PATH, JSON.stringify(output, null, 2));

  console.log(`Issue #100 final gate: ${checks.length} checks, ${failures.length} failures.`);
  for (const failure of failures) console.error(`FAIL ${failure.scope}: ${failure.detail}`);
  if (failures.length) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  try {
    await fs.writeFile(FINAL_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), fatal: String(error?.stack || error) }, null, 2));
  } catch {}
  process.exit(1);
});
