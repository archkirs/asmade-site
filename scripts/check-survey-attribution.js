const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const attributionScript = fs.readFileSync(path.join(root, 'survey-attribution.js'), 'utf8');
const tallySelector = 'a[href^="https://tally.so/r/NpQkRB"]';

const pages = [
  ['index.html', 'general', 'https://useasmade.com/'],
  ['student.html', 'student', 'https://useasmade.com/student.html'],
  ['artist.html', 'artist', 'https://useasmade.com/artist.html'],
  ['reviewer.html', 'reviewer', 'https://useasmade.com/reviewer.html'],
];

function pilotLinks(html) {
  return [...html.matchAll(/href="(https:\/\/tally\.so\/r\/NpQkRB[^"]*)"/g)].map((match) =>
    match[1].replaceAll('&amp;', '&'),
  );
}

function runAttribution(pageUrl, hrefs) {
  const links = hrefs.map((href) => ({ href }));
  const context = {
    URL,
    window: { location: { href: pageUrl } },
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, tallySelector);
        return links;
      },
    },
  };

  vm.runInNewContext(attributionScript, context, { filename: 'survey-attribution.js' });
  return links.map((link) => link.href);
}

for (const [filename, expectedLanding, pageUrl] of pages) {
  const html = fs.readFileSync(path.join(root, filename), 'utf8');
  assert.ok(
    html.includes('<script src="/survey-attribution.js"></script>'),
    `${filename}: survey-attribution.js is not connected`,
  );

  const originalLinks = pilotLinks(html);
  assert.ok(originalLinks.length > 0, `${filename}: no MVP Pilot Tally links found`);

  for (const href of originalLinks) {
    assert.equal(new URL(href).searchParams.get('landing'), expectedLanding, `${filename}: wrong landing`);
    assert.equal(new URL(href).searchParams.get('source'), null, `${filename}: source must not be hard-coded`);
    assert.equal(new URL(href).searchParams.get('message'), null, `${filename}: message must not be hard-coded`);
  }

  assert.deepEqual(
    runAttribution(pageUrl, originalLinks),
    originalLinks,
    `${filename}: ordinary visit changed the existing Tally links`,
  );

  const attributedLinks = runAttribution(`${pageUrl}?source=surveyswap&message=ss01`, originalLinks);
  for (const href of attributedLinks) {
    const url = new URL(href);
    assert.equal(url.searchParams.get('landing'), expectedLanding, `${filename}: landing was not preserved`);
    assert.equal(url.searchParams.get('source'), 'surveyswap', `${filename}: source was not propagated`);
    assert.equal(url.searchParams.get('message'), 'ss01', `${filename}: message was not propagated`);
  }

  assert.deepEqual(
    runAttribution(`${pageUrl}?source=bad%20value&message=ss01`, originalLinks),
    originalLinks,
    `${filename}: unsafe source value was propagated`,
  );

  assert.deepEqual(
    runAttribution(`${pageUrl}?source=surveyswap&message=bad%2Fvalue`, originalLinks),
    originalLinks,
    `${filename}: unsafe message value was propagated`,
  );
}

console.log('SurveySwap attribution QA passed for general, student, artist, and reviewer.');
