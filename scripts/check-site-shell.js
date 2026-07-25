const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const production = process.env.VERCEL_ENV === 'production';
const pages = [
  'lab/v4/index.html',
  'lab/v4/student.html',
  'lab/v4/artist.html',
  'lab/v4/reviewer.html',
  'index.html',
  'student.html',
  'artist.html',
  'reviewer.html',
  'records.html',
  'sample-comic.html',
  'sample-cv.html',
  'about.html',
  'contact/index.html',
  'privacy.html',
  'terms.html',
  'pilot-notice.html',
];

function count(html, pattern) {
  return (html.match(pattern) || []).length;
}

function hasNoindex(html) {
  return /<meta\s+name=["']robots["']\s+content=["'][^"']*\bnoindex\b[^"']*["'][^>]*>/i.test(html);
}

function parseJsonLdEntities(html, file, failures) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const entities = [];

  blocks.forEach((match, index) => {
    try {
      const value = JSON.parse(match[1]);
      if (Array.isArray(value?.['@graph'])) {
        entities.push(...value['@graph']);
      } else {
        entities.push(value);
      }
    } catch (error) {
      failures.push(`${file}: JSON-LD block ${index + 1} parses as valid JSON`);
    }
  });

  return entities.filter((entity) => entity && typeof entity === 'object');
}

const linkedinLink = '<a href="https://www.linkedin.com/company/useasmade" target="_blank" rel="noopener">LinkedIn</a>';
const redditLink = '<a href="https://www.reddit.com/user/useasmade" target="_blank" rel="noopener">Reddit</a>';
const expectedSameAs = [
  'https://www.linkedin.com/company/useasmade',
  'https://www.reddit.com/user/useasmade',
];

const failures = [];
for (const file of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const isLab = file.startsWith('lab/v4/');
  const noindex = hasNoindex(html);
  const checks = [
    [count(html, /class="asmade-header"/g) === 1, 'shared header'],
    [count(html, /class="asmade-footer"/g) === 1, 'shared footer'],
    [count(html, /class="asmade-nav-link"/g) === 5, 'five primary nav cells'],
    [count(html, /class="asmade-footer-group"/g) === 4, 'four footer groups'],
    [html.includes('<p class="asmade-footer-heading">Site</p>'), 'Site footer group'],
    [html.includes('<p class="asmade-footer-heading">Project</p>'), 'Project footer group'],
    [html.includes('<p class="asmade-footer-heading">Follow</p>'), 'Follow footer group'],
    [html.includes('<p class="asmade-footer-heading">Legal</p>'), 'Legal footer group'],
    [html.includes(linkedinLink), 'official LinkedIn footer link'],
    [html.includes(redditLink), 'official Reddit footer link'],
    [html.includes('/site-shell.css'), 'shared shell stylesheet'],
    [html.includes('/v4-content-safety.css'), 'content visibility guard'],
    [html.includes('v4-motion-enabled'), 'progressive motion init'],
    [html.includes('/v4-motion.js'), 'shared motion observer'],
    [!html.includes('class="site-header"'), 'no legacy site-header'],
    [!html.includes('class="v4-header"'), 'no legacy V4 header'],
    [!html.includes('class="site-footer"'), 'no legacy site-footer'],
    [!html.includes('{{'), 'no unresolved shell tokens'],
    [!isLab || noindex, 'Design Lab remains noindex'],
    [!production || isLab || !noindex, 'canonical production page has no accidental noindex'],
  ];
  for (const [ok, label] of checks) {
    if (!ok) failures.push(`${file}: ${label}`);
  }
}

const homeFile = 'index.html';
const homeHtml = fs.readFileSync(path.join(root, homeFile), 'utf8');
const homeJsonLd = parseJsonLdEntities(homeHtml, homeFile, failures);
const websiteEntities = homeJsonLd.filter((entity) => entity['@type'] === 'WebSite');
const organizationEntities = homeJsonLd.filter((entity) => entity['@type'] === 'Organization');
const website = websiteEntities[0];
const organization = organizationEntities[0];

const structuredDataChecks = [
  [websiteEntities.length === 1, 'exactly one WebSite JSON-LD entity'],
  [website?.name === 'AsMade', 'WebSite JSON-LD keeps AsMade name'],
  [website?.url === 'https://useasmade.com/', 'WebSite JSON-LD keeps canonical site URL'],
  [organizationEntities.length === 1, 'exactly one Organization JSON-LD entity'],
  [organization?.name === 'AsMade', 'Organization JSON-LD uses AsMade name'],
  [organization?.url === 'https://useasmade.com/', 'Organization JSON-LD uses canonical site URL'],
  [JSON.stringify(organization?.sameAs) === JSON.stringify(expectedSameAs), 'Organization JSON-LD uses exact official LinkedIn and Reddit sameAs URLs'],
];

for (const [ok, label] of structuredDataChecks) {
  if (!ok) failures.push(`${homeFile}: ${label}`);
}

if (failures.length) {
  console.error('Shared site shell QA failed:\n' + failures.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Shared site shell QA passed on ${pages.length} pages, including Home structured data.`);
