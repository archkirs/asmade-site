import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.TRANSLATION_QA_BASE || 'http://127.0.0.1:4173';
const REPORT = process.env.TRANSLATION_QA_REPORT || 'translation-layout-qa.log';

const routes = [
  ['Home', '/'],
  ['Students', '/student.html'],
  ['Creative Work', '/artist.html'],
  ['Reviewers', '/reviewer.html'],
  ['MADE Records', '/records.html'],
  ['Comic Record', '/sample-comic.html'],
  ['CV Record', '/sample-cv.html'],
  ['About', '/about.html'],
  ['Contact', '/contact/'],
  ['Privacy', '/privacy.html'],
  ['Terms', '/terms.html'],
  ['Pilot Notice', '/pilot-notice.html']
];

const viewports = [
  ['mobile390', 390, 844],
  ['mobile320', 320, 760]
];

const failures = [];
const observations = [];
let checks = 0;

function check(ok, scope, message) {
  checks += 1;
  if (!ok) failures.push(`${scope}: ${message}`);
}

async function layoutState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewport = root.clientWidth;
    const selectors = ['.asmade-header', '.asmade-header-cta', '.hero', '.trace-card', '.audience-hero-card'];
    const boxes = {};

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      boxes[selector] = { left: rect.left, right: rect.right, width: rect.width };
    }

    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        if (rect.left >= -1 && rect.right <= viewport + 1) return false;

        let parent = el.parentElement;
        while (parent && parent !== body) {
          const style = getComputedStyle(parent);
          if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.left >= -1 && parentRect.right <= viewport + 1) return false;
          }
          parent = parent.parentElement;
        }
        return true;
      })
      .slice(0, 12)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${String(el.className || '').replace(/\s+/g, '.')}[${Math.round(rect.left)},${Math.round(rect.right)}]`;
      });

    return {
      viewport,
      htmlScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      boxes,
      offenders
    };
  });
}

async function applyRepresentativeRussianTranslation(page) {
  await page.evaluate(() => {
    const replaceText = (el, text) => {
      if (el) el.textContent = text;
    };

    document.documentElement.lang = 'ru';

    const navLabels = [
      ['Дом', 'Дом'],
      ['Студенты', 'Студенты'],
      ['Творческая работа', 'Творческий проект'],
      ['Рецензенты', 'Рецензенты'],
      ['Записи MADE', 'Записи MADE']
    ];

    document.querySelectorAll('.asmade-nav-link').forEach((link, index) => {
      const pair = navLabels[index];
      if (!pair) return;
      replaceText(link.querySelector('.asmade-nav-label-full'), pair[0]);
      replaceText(link.querySelector('.asmade-nav-label-short'), pair[1]);
    });
    replaceText(document.querySelector('.asmade-header-cta'), 'Подайте заявку на участие в пилотном проекте MVP.');

    const path = location.pathname;
    const heroTitle = document.querySelector('.hero h1');
    const heroLedes = [...document.querySelectorAll('.hero-lede')];
    const heroButtons = [...document.querySelectorAll('.hero-actions .pill')];

    if (heroTitle) {
      const titles = {
        '/': 'Использовался ли искусственный интеллект? Это только первый вопрос.',
        '/student.html': 'Использовали искусственный интеллект в задании? Покажите, что сделали вы.',
        '/artist.html': 'Работали с искусственным интеллектом над творческой работой? Покажите решения автора.',
        '/reviewer.html': 'Нужно оценить работу с искусственным интеллектом? Сначала посмотрите, как она была сделана.'
      };
      replaceText(heroTitle, titles[path] || 'Посмотрите, как была создана эта работа с помощью искусственного интеллекта.');
    }

    if (heroLedes[0]) replaceText(heroLedes[0], 'Завершенная работа показывает результат, но может не показывать исследования, решения, черновики, проверку, исправления и то, где именно искусственный интеллект участвовал в процессе.');
    if (heroLedes[1]) replaceText(heroLedes[1], 'Запись MADE структурирует этот контекст вокруг одной конкретной работы, показывает доступные подтверждения и сохраняет заметными пробелы и неопределенность.');
    if (heroButtons[0]) replaceText(heroButtons[0], 'Посмотрите, как работает система учета и чем отличаются роли');
    if (heroButtons[1]) replaceText(heroButtons[1], 'Подайте заявку на участие в пилотном проекте MVP.');

    const traceLabels = ['Направление', 'Создание вариантов', 'Отклонение', 'Выбор', 'Сборка страницы'];
    document.querySelectorAll('.trace-step').forEach((el, index) => replaceText(el, traceLabels[index] || 'Этап процесса'));
    replaceText(document.querySelector('.trace-work-copy h2'), 'Последняя страница — это один момент. Запись прослеживает решения и действия, которые ему предшествовали.');
    replaceText(document.querySelector('.trace-detail h3'), 'Задайте драматическое направление и сохраните человеческие решения видимыми.');

    replaceText(document.querySelector('.audience-card-head span'), 'Иллюстративный пример · не является общедоступной записью');
    replaceText(document.querySelector('.audience-card-body h2'), 'Полезный вопрос заключается не только в том, использовался ли искусственный интеллект.');
    replaceText(document.querySelector('.audience-card-body p'), 'Важный контекст — это то, что сделал человек, что поддержал искусственный интеллект, какие решения оставались человеческими и какая информация фактически доступна.');
    const audienceLabels = ['Человек', 'Искусственный интеллект', 'Подтверждение информации', 'Правила и ограничения'];
    document.querySelectorAll('.audience-flow button').forEach((el, index) => replaceText(el, audienceLabels[index] || 'Контекст'));
    replaceText(document.querySelector('.audience-detail strong'), 'Работа и решения человека остаются видимыми и отделяются от помощи искусственного интеллекта.');

    if (!heroTitle) {
      const pageHeading = document.querySelector('main h1');
      if (pageHeading) replaceText(pageHeading, `${pageHeading.textContent.trim()} — подробный контекст переведенной страницы`);
    }

    // Chromium/Google Translate commonly introduces nested inline <font> wrappers.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, textarea')) continue;
      textNodes.push(node);
    }

    for (const node of textNodes) {
      const outer = document.createElement('font');
      outer.style.verticalAlign = 'inherit';
      const inner = document.createElement('font');
      inner.style.verticalAlign = 'inherit';
      inner.textContent = node.nodeValue;
      outer.append(inner);
      node.replaceWith(outer);
    }
  });

  await page.waitForTimeout(80);
}

const browser = await chromium.launch({ headless: true });

try {
  for (const [viewportName, width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.route('**/*', async (route) => {
      if (route.request().resourceType() === 'image') return route.abort();
      return route.continue();
    });
    const page = await context.newPage();

    for (const [name, route] of routes) {
      const scope = `${viewportName} ${name}`;
      const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      check(response?.status() === 200, scope, `page status ${response?.status()}`);

      const english = await layoutState(page);
      observations.push(`${scope} English: viewport=${english.viewport}, html=${english.htmlScrollWidth}, body=${english.bodyScrollWidth}, offenders=${english.offenders.join(', ') || 'none'}`);
      check(
        english.htmlScrollWidth <= english.viewport + 1 && english.bodyScrollWidth <= english.viewport + 1,
        `${scope} English`,
        `document overflow: html=${english.htmlScrollWidth}, body=${english.bodyScrollWidth}, viewport=${english.viewport}; offenders=${english.offenders.join(', ')}`
      );

      await applyRepresentativeRussianTranslation(page);
      const translated = await layoutState(page);
      observations.push(`${scope} RU: viewport=${translated.viewport}, html=${translated.htmlScrollWidth}, body=${translated.bodyScrollWidth}, offenders=${translated.offenders.join(', ') || 'none'}`);
      check(
        translated.htmlScrollWidth <= translated.viewport + 1 && translated.bodyScrollWidth <= translated.viewport + 1,
        `${scope} RU`,
        `document overflow: html=${translated.htmlScrollWidth}, body=${translated.bodyScrollWidth}, viewport=${translated.viewport}; offenders=${translated.offenders.join(', ')}`
      );

      for (const selector of ['.asmade-header-cta', '.hero', '.trace-card', '.audience-hero-card']) {
        const box = translated.boxes[selector];
        if (!box) continue;
        check(
          box.left >= -1 && box.right <= translated.viewport + 1,
          `${scope} RU ${selector}`,
          `box escaped viewport: left=${box.left.toFixed(1)}, right=${box.right.toFixed(1)}, viewport=${translated.viewport}`
        );
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const summary = failures.length
  ? `Browser translation layout QA failed: ${failures.length} failure(s) across ${checks} checks.`
  : `Browser translation layout QA passed: ${checks} checks across 12 canonical routes × 2 mobile viewports.`;

const report = [summary, '', 'Observations:', ...observations, '', 'Failures:', ...(failures.length ? failures.map((failure) => `- ${failure}`) : ['none']), ''].join('\n');
fs.writeFileSync(REPORT, report, 'utf8');
console.log(summary);
if (failures.length) process.exitCode = 1;
