import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'https://useasmade.com';
const out = 'audit-source-output';
const routes = [
  '/',
  '/student.html',
  '/artist.html',
  '/reviewer.html',
  '/records.html',
  '/sample-comic.html',
  '/sample-cv.html',
  '/about.html',
  '/contact',
  '/privacy.html',
  '/terms.html',
  '/pilot-notice.html',
];

function meta(html, attr, key) {
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<meta[^>]+${attr}=["']${safe}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'))?.[1]?.trim() || '';
}

await fs.mkdir(out, { recursive: true });
const summary = [];

for (const route of routes) {
  const response = await fetch(`${base}${route}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'AsMade-Issue-100-Audit/1.0' },
  });
  const html = await response.text();
  const safe = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/g, '');
  await fs.writeFile(path.join(out, `${safe}.html`), html);

  const labContexts = [];
  let pos = html.indexOf('/lab/v4/');
  while (pos >= 0 && labContexts.length < 10) {
    labContexts.push(html.slice(Math.max(0, pos - 100), Math.min(html.length, pos + 180)).replace(/\s+/g, ' '));
    pos = html.indexOf('/lab/v4/', pos + 1);
  }

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  const description = meta(html, 'name', 'description');
  const robots = meta(html, 'name', 'robots');
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1]?.trim() || '';
  const header = html.match(/<header\b[\s\S]*?<\/header>/i)?.[0]?.slice(0, 1200).replace(/\s+/g, ' ') || '(none)';
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/i)?.[0]?.slice(0, 1200).replace(/\s+/g, ' ') || '(none)';
  const info = {
    route,
    status: response.status,
    bytes: Buffer.byteLength(html),
    title,
    description,
    robots,
    canonical,
    ogTitle: meta(html, 'property', 'og:title'),
    ogDescription: meta(html, 'property', 'og:description'),
    ogUrl: meta(html, 'property', 'og:url'),
    ogImage: meta(html, 'property', 'og:image'),
    twitterCard: meta(html, 'name', 'twitter:card'),
    twitterTitle: meta(html, 'name', 'twitter:title'),
    twitterDescription: meta(html, 'name', 'twitter:description'),
    twitterImage: meta(html, 'name', 'twitter:image'),
    asmadeHeaderOccurrences: (html.match(/asmade-header/g) || []).length,
    asmadeFooterOccurrences: (html.match(/asmade-footer/g) || []).length,
    asmadeNavLinkOccurrences: (html.match(/asmade-nav-link/g) || []).length,
    labV4Occurrences: (html.match(/\/lab\/v4\//g) || []).length,
    designLabOccurrences: (html.match(/design-lab-panel|data-design-lab|lab-controls\.js/g) || []).length,
    header,
    footer,
    labContexts,
  };
  summary.push(info);
  await fs.writeFile(path.join(out, `${safe}.json`), JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
}

const duplicateTitles = summary.filter((item, index, all) => all.findIndex((other) => other.title === item.title) !== index).map((item) => item.route);
const duplicateDescriptions = summary.filter((item, index, all) => all.findIndex((other) => other.description === item.description) !== index).map((item) => item.route);
await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify({
  routes: summary.length,
  duplicateTitles,
  duplicateDescriptions,
  summary,
}, null, 2));

if (duplicateTitles.length || duplicateDescriptions.length) {
  console.error(JSON.stringify({ duplicateTitles, duplicateDescriptions }));
  process.exitCode = 1;
}
