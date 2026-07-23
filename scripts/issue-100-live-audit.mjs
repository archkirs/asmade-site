import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = 'https://useasmade.com';
const OUT = 'audit-output';
const SCREENSHOTS = path.join(OUT, 'screenshots');

const pages = [
  { name: 'Home', route: '/', landing: 'general', active: '/' },
  { name: 'Students', route: '/student.html', landing: 'student', active: '/student.html' },
  { name: 'Creative Work', route: '/artist.html', landing: 'artist', active: '/artist.html' },
  { name: 'Reviewers', route: '/reviewer.html', landing: 'reviewer', active: '/reviewer.html' },
  { name: 'MADE Records', route: '/records.html', landing: 'general', active: '/records.html' },
  { name: 'Comic MADE Record', route: '/sample-comic.html', landing: 'artist', active: '/records.html' },
  { name: 'Professional CV MADE Record', route: '/sample-cv.html', landing: 'general', active: '/records.html' },
  { name: 'About', route: '/about.html', landing: 'general', active: null },
  { name: 'Contact', route: '/contact', landing: 'general', active: null },
  { name: 'Privacy', route: '/privacy.html', landing: 'general', active: null },
  { name: 'Terms', route: '/terms.html', landing: 'general', active: null },
  { name: 'Pilot Notice', route: '/pilot-notice.html', landing: 'general', active: null },
];

const failures = [];
const notes = [];
const httpResults = [];
const browserResults = [];

function record(ok, scope, detail) {
  const item = { ok, scope, detail };
  if (!ok) failures.push(item);
  return ok;
}

function note(scope, detail) {
  notes.push({ scope, detail });
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTitle(html) {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
}

function extractMeta(html, attr, key) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${escapeRe(key)}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  return html.match(re)?.[1]?.trim() || '';
}

function extractCanonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1]?.trim() || '';
}

function extractHrefs(html, baseUrl) {
  const hrefs = [];
  const re = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    try { hrefs.push(new URL(href, baseUrl).href); } catch {}
  }
  return [...new Set(hrefs)];
}

function expectedCanonical(route) {
  return `${BASE}${route}`;
}

async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function auditHttpPages() {
  const internalUrls = new Set();

  for (const page of pages) {
    const url = `${BASE}${page.route}`;
    let response;
    let html = '';
    try {
      response = await safeFetch(url, { redirect: 'manual', headers: { 'user-agent': 'AsMade-Issue-100-Audit/1.0' } });
      html = await response.text();
    } catch (error) {
      record(false, `HTTP ${page.name}`, `fetch failed: ${error.message}`);
      continue;
    }

    httpResults.push({ name: page.name, route: page.route, status: response.status, bytes: Buffer.byteLength(html) });
    record(response.status === 200, `HTTP ${page.name}`, `expected 200, got ${response.status}`);

    const title = extractTitle(html);
    const description = extractMeta(html, 'name', 'description');
    const canonical = extractCanonical(html);
    const robots = extractMeta(html, 'name', 'robots');

    record(Boolean(title), `SEO ${page.name}`, 'title present');
    record(Boolean(description), `SEO ${page.name}`, 'meta description present');
    record(canonical === expectedCanonical(page.route), `SEO ${page.name}`, `canonical ${canonical || '(missing)'}`);
    record(!/\bnoindex\b/i.test(robots), `SEO ${page.name}`, `canonical page robots=${robots || '(default index)'}`);

    const og = ['og:title', 'og:description', 'og:url', 'og:image'];
    for (const key of og) record(Boolean(extractMeta(html, 'property', key)), `SEO ${page.name}`, `${key} present`);
    const twitter = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];
    for (const key of twitter) record(Boolean(extractMeta(html, 'name', key)), `SEO ${page.name}`, `${key} present`);

    if (page.route === '/') {
      record(/<script[^>]+type=["']application\/ld\+json["']/i.test(html) && /"@type"\s*:\s*"WebSite"/i.test(html), 'SEO Home', 'intended WebSite JSON-LD present');
    }

    record(!/\/lab\/v4\//i.test(html), `Production leakage ${page.name}`, 'no /lab/v4/ links on canonical page');
    record(!/design-lab-panel|data-design-lab|lab-controls\.js/i.test(html), `Production leakage ${page.name}`, 'no Design Lab controls/artifacts');
    record((html.match(/class=["'][^"']*asmade-header\b[^"']*["']/gi) || []).length === 1, `Shell ${page.name}`, 'one shared header');
    record((html.match(/class=["'][^"']*asmade-footer\b[^"']*["']/gi) || []).length === 1, `Shell ${page.name}`, 'one shared footer');
    record((html.match(/class=["'][^"']*asmade-nav-link\b[^"']*["']/gi) || []).length === 5, `Shell ${page.name}`, 'five primary navigation cells');
    record(html.includes('>Site</p>') && html.includes('>Project</p>') && html.includes('>Legal</p>'), `Shell ${page.name}`, 'Site / Project / Legal footer groups');

    const tallyValues = [...html.matchAll(/https:\/\/tally\.so\/r\/NpQkRB\?landing=([a-z]+)/g)].map((m) => m[1]);
    record(tallyValues.length > 0, `Tally ${page.name}`, 'at least one pilot CTA found');
    record(tallyValues.every((value) => value === page.landing), `Tally ${page.name}`, `expected ${page.landing}; found ${[...new Set(tallyValues)].join(', ') || '(none)'}`);

    if (page.route === '/sample-comic.html' || page.route === '/sample-cv.html') {
      record((html.match(/role=["']tab["']/gi) || []).length === 4, `Record ${page.name}`, 'four Record tabs present');
      record(/Record[\s\S]*Process[\s\S]*Evidence[\s\S]*History/i.test(html), `Record ${page.name}`, 'Record → Process → Evidence → History labels present');
      record(/record-export-download\?export=/i.test(html), `Record ${page.name}`, 'Summary PDF action present');
    }

    for (const href of extractHrefs(html, url)) {
      const parsed = new URL(href);
      if (parsed.origin === BASE && !parsed.pathname.startsWith('/api/')) internalUrls.add(href);
    }
  }

  for (const href of [...internalUrls].sort()) {
    let response;
    try {
      response = await safeFetch(href, { redirect: 'manual', headers: { 'user-agent': 'AsMade-Issue-100-Audit/1.0' } });
      record(response.status >= 200 && response.status < 400, 'Internal link', `${href} -> ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      record(false, 'Internal link', `${href} fetch failed: ${error.message}`);
    }
  }
}

async function auditInfrastructure() {
  const robots = await safeFetch(`${BASE}/robots.txt`, { redirect: 'manual' });
  const robotsText = await robots.text();
  record(robots.status === 200, 'robots.txt', `status ${robots.status}`);
  record(/Disallow:\s*\/api\//i.test(robotsText), 'robots.txt', 'API disallow present');
  record(/Sitemap:\s*https:\/\/useasmade\.com\/sitemap\.xml/i.test(robotsText), 'robots.txt', 'sitemap reference present');

  const sitemap = await safeFetch(`${BASE}/sitemap.xml`, { redirect: 'manual' });
  const sitemapText = await sitemap.text();
  record(sitemap.status === 200, 'sitemap.xml', `status ${sitemap.status}`);
  for (const page of pages) {
    record(sitemapText.includes(`<loc>${expectedCanonical(page.route)}</loc>`), 'sitemap.xml', `${page.route} listed`);
  }
  record(!sitemapText.includes('/lab/v4/'), 'sitemap.xml', 'Design Lab excluded');

  const redirects = [
    ['/creator.html', '/artist.html'],
    ['/registry.html', '/reviewer.html'],
    ['/index.html', '/'],
    ['/contact/index.html', '/contact'],
  ];
  for (const [source, destination] of redirects) {
    const response = await safeFetch(`${BASE}${source}`, { redirect: 'manual' });
    const location = response.headers.get('location') || '';
    record(response.status === 308, 'Redirect', `${source} -> status ${response.status}`);
    record(new URL(location, BASE).pathname === destination, 'Redirect', `${source} -> ${location || '(missing Location)'}`);
    await response.body?.cancel();
  }

  const missing = await safeFetch(`${BASE}/__issue100-definitely-missing.html`, { redirect: 'manual' });
  record(missing.status === 404, '404', `unexpected route status ${missing.status}`);
  await missing.body?.cancel();

  for (const landing of ['general', 'student', 'artist', 'reviewer']) {
    const response = await safeFetch(`https://tally.so/r/NpQkRB?landing=${landing}`, { redirect: 'manual', headers: { 'user-agent': 'AsMade-Issue-100-Audit/1.0' } });
    record(response.status >= 200 && response.status < 400, 'Tally external', `${landing} -> ${response.status}`);
    await response.body?.cancel();
  }

  const exports = [
    ['comic-summary-v1', 'application/pdf', 'AsMade_MR-PILOT-EC-P050-001_v0.4_Summary.pdf'],
    ['cv-summary-v1', 'application/pdf', 'AsMade_MR-PILOT-CV-001_v0.3_Summary.pdf'],
  ];
  for (const [key, type, filename] of exports) {
    const response = await safeFetch(`${BASE}/api/record-export-download?export=${key}&disposition=attachment`, { redirect: 'manual' });
    record(response.status === 200, 'Summary PDF', `${key} status ${response.status}`);
    record((response.headers.get('content-type') || '').startsWith(type), 'Summary PDF', `${key} content-type ${response.headers.get('content-type')}`);
    record((response.headers.get('content-disposition') || '').includes(filename), 'Summary PDF', `${key} filename header`);
    await response.body?.cancel();
  }

  const evidence = [
    ['comic-m001', 'image/png'],
    ['cv-en', 'image/webp'],
    ['cv-sr', 'image/webp'],
  ];
  for (const [key, type] of evidence) {
    const response = await safeFetch(`${BASE}/api/evidence-download?asset=${key}&disposition=inline`, { redirect: 'manual' });
    record(response.status === 200, 'Evidence delivery', `${key} status ${response.status}`);
    record((response.headers.get('content-type') || '').startsWith(type), 'Evidence delivery', `${key} content-type ${response.headers.get('content-type')}`);
    record(/noindex/i.test(response.headers.get('x-robots-tag') || ''), 'Evidence delivery', `${key} X-Robots-Tag noindex`);
    await response.body?.cancel();
  }
  const invalidEvidence = await safeFetch(`${BASE}/api/evidence-download?asset=private-raw-test&disposition=inline`, { redirect: 'manual' });
  record(invalidEvidence.status === 404, 'Evidence delivery', `unknown/private asset key rejected with ${invalidEvidence.status}`);
  await invalidEvidence.body?.cancel();

  const contact = await safeFetch(`${BASE}/api/contact`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', origin: BASE, 'user-agent': 'AsMade-Issue-100-Audit/1.0' },
    body: JSON.stringify({ email: 'not-an-email', topic: '', message: '' }),
  });
  let contactBody = {};
  try { contactBody = await contact.json(); } catch {}
  record(contact.status === 422, 'Contact API', `invalid non-delivery validation request -> ${contact.status}`);
  record(Boolean(contactBody?.errors), 'Contact API', 'validation errors returned without sending a message');
}

async function auditBrowser() {
  const browser = await chromium.launch({ headless: true });
  try {
    const viewportSets = [
      { key: 'desktop', width: 1440, height: 900 },
      { key: 'mobile390', width: 390, height: 844 },
      { key: 'mobile320', width: 320, height: 760 },
    ];

    for (const viewport of viewportSets) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const p = await context.newPage();

      for (const pageSpec of pages) {
        const url = `${BASE}${pageSpec.route}`;
        try {
          const response = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await p.waitForTimeout(700);
          record(response?.status() === 200, `Browser ${viewport.key} ${pageSpec.name}`, `navigation status ${response?.status()}`);

          const checks = await p.evaluate(({ active, isMobile }) => {
            const header = document.querySelector('.asmade-header');
            const footer = document.querySelector('.asmade-footer');
            const nav = document.querySelector('.asmade-primary-nav');
            const navLinks = [...document.querySelectorAll('.asmade-primary-nav .asmade-nav-link')];
            const activeLinks = navLinks.filter((link) => link.getAttribute('aria-current') === 'page');
            const fades = [...document.querySelectorAll('.fade')];
            const invisibleFades = fades.filter((el) => {
              const style = getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') < 0.99;
            }).length;
            const navStyle = nav ? getComputedStyle(nav) : null;
            return {
              headerVisible: !!header && header.getBoundingClientRect().height > 0,
              footerVisible: !!footer && footer.getBoundingClientRect().height > 0,
              navCount: navLinks.length,
              activeCount: activeLinks.length,
              activeHref: activeLinks[0]?.getAttribute('href') || null,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              invisibleFades,
              mobileGrid: !isMobile || navStyle?.display === 'grid',
              mobileCellsVisible: !isMobile || navLinks.every((link) => link.getBoundingClientRect().width > 0 && link.getBoundingClientRect().height > 0),
              bodyText: document.body.innerText.slice(0, 5000),
            };
          }, { active: pageSpec.active, isMobile: viewport.key !== 'desktop' });

          record(checks.headerVisible, `Browser ${viewport.key} ${pageSpec.name}`, 'header visible');
          record(checks.footerVisible, `Browser ${viewport.key} ${pageSpec.name}`, 'footer visible');
          record(checks.navCount === 5, `Browser ${viewport.key} ${pageSpec.name}`, `nav cells ${checks.navCount}`);
          record(checks.overflow <= 1, `Browser ${viewport.key} ${pageSpec.name}`, `horizontal overflow ${checks.overflow}px`);
          record(checks.invisibleFades === 0, `Browser ${viewport.key} ${pageSpec.name}`, `visible .fade elements with opacity < 0.99: ${checks.invisibleFades}`);
          record(checks.mobileGrid, `Browser ${viewport.key} ${pageSpec.name}`, 'mobile nav grid');
          record(checks.mobileCellsVisible, `Browser ${viewport.key} ${pageSpec.name}`, 'all five mobile nav cells visible');

          if (pageSpec.active) {
            record(checks.activeCount === 1 && checks.activeHref === pageSpec.active, `Browser ${viewport.key} ${pageSpec.name}`, `active nav ${checks.activeHref || '(none)'}`);
          } else {
            record(checks.activeCount === 0, `Browser ${viewport.key} ${pageSpec.name}`, `no audience/Records active nav expected; found ${checks.activeHref || '(none)'}`);
          }

          if (['/privacy.html', '/terms.html', '/pilot-notice.html'].includes(pageSpec.route)) {
            const heroBackground = await p.locator('.legal-hero').evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => 'missing');
            record(heroBackground !== 'missing' && heroBackground !== 'rgba(0, 0, 0, 0)', `Browser ${viewport.key} ${pageSpec.name}`, `legal hero background ${heroBackground}`);
          }

          if (pageSpec.route === '/sample-comic.html' || pageSpec.route === '/sample-cv.html') {
            const tabs = p.locator('[role="tab"]');
            record(await tabs.count() === 4, `Record tabs ${viewport.key} ${pageSpec.name}`, 'four tabs in DOM');
            for (let i = 0; i < await tabs.count(); i += 1) {
              const tab = tabs.nth(i);
              await tab.click();
              const selected = await tab.getAttribute('aria-selected');
              const panelId = await tab.getAttribute('aria-controls');
              const panelVisible = panelId ? await p.locator(`#${panelId}`).isVisible() : false;
              record(selected === 'true' && panelVisible, `Record tabs ${viewport.key} ${pageSpec.name}`, `tab ${i + 1} activates its panel`);
            }
          }

          const safeName = pageSpec.route === '/' ? 'home' : pageSpec.route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/g, '');
          await p.screenshot({ path: path.join(SCREENSHOTS, `${viewport.key}-${safeName}.png`), fullPage: true });
          browserResults.push({ viewport: viewport.key, page: pageSpec.name, route: pageSpec.route, ...checks });
        } catch (error) {
          record(false, `Browser ${viewport.key} ${pageSpec.name}`, `browser check failed: ${error.message}`);
        }
      }
      await context.close();
    }

    const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await reduced.newPage();
    for (const pageSpec of pages) {
      try {
        await p.goto(`${BASE}${pageSpec.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(300);
        const motion = await p.evaluate(() => {
          const items = [...document.querySelectorAll('.fade')].filter((el) => getComputedStyle(el).display !== 'none');
          return items.map((el) => {
            const style = getComputedStyle(el);
            return { transform: style.transform, transitionDuration: style.transitionDuration, opacity: style.opacity };
          });
        });
        record(motion.every((item) => item.transform === 'none' && (item.transitionDuration === '0s' || item.transitionDuration === '') && Number.parseFloat(item.opacity || '1') >= 0.99), `Reduced motion ${pageSpec.name}`, `${motion.length} visible fade elements static/readable`);
      } catch (error) {
        record(false, `Reduced motion ${pageSpec.name}`, error.message);
      }
    }
    await reduced.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  await fs.mkdir(SCREENSHOTS, { recursive: true });
  await auditHttpPages();
  await auditInfrastructure();
  await auditBrowser();

  const result = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    failures,
    notes,
    httpResults,
    browserResults,
    summary: { failures: failures.length, pages: pages.length },
  };
  await fs.writeFile(path.join(OUT, 'audit-result.json'), JSON.stringify(result, null, 2));

  const lines = [
    '# Issue #100 live production audit',
    '',
    `Generated: ${result.generatedAt}`,
    `Production: ${BASE}`,
    `Failures: ${failures.length}`,
    '',
    '## Failures',
    failures.length ? failures.map((item) => `- **${item.scope}** — ${item.detail}`).join('\n') : '- None',
    '',
    '## HTTP page status',
    ...httpResults.map((item) => `- ${item.route}: ${item.status} (${item.bytes} bytes)`),
  ];
  await fs.writeFile(path.join(OUT, 'audit-summary.md'), lines.join('\n'));

  console.log(lines.join('\n'));
  if (failures.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  try { await fs.mkdir(OUT, { recursive: true }); await fs.writeFile(path.join(OUT, 'fatal.txt'), String(error?.stack || error)); } catch {}
  process.exit(1);
});
