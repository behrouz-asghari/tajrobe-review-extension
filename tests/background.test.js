// Tests for background.js (parsing, company matching and per-tab caching)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorage() {
  const store = {};
  const delay = () => new Promise(resolve => setTimeout(resolve, 1));

  return {
    async get(key) {
      await delay();
      if (typeof key === 'string') return { [key]: store[key] };
      return { ...store };
    },
    async set(items) {
      await delay();
      Object.assign(store, items);
    },
    async remove(key) {
      await delay();
      (Array.isArray(key) ? key : [key]).forEach(item => delete store[item]);
    }
  };
}

function loadBackground() {
  const sidePanelCalls = [];

  global.chrome = {
    storage: { session: createStorage(), local: createStorage() },
    sidePanel: {
      async setPanelBehavior(options) {
        sidePanelCalls.push(options);
      }
    },
    runtime: {
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: {
        addListener(listener) {
          global.__onMessage = listener;
        }
      }
    },
    tabs: {
      onUpdated: { addListener() {} },
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} }
    },
    action: {
      setBadgeText() {},
      setBadgeBackgroundColor() {}
    },
    declarativeNetRequest: {
      updateDynamicRules() {}
    }
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  vm.runInThisContext(
    source +
      '\n;globalThis.__extension = {' +
      ' normalizeCompanyName, scoreCompanyMatch, findCompany, parseCompanyStats,' +
      ' parseLatestReviewDate, getCompanyInfo, storeCompanyInfo, getCachedResult,' +
      ' setCachedResult, clearTabCache, clearTabData, updateTabData' +
      ' };',
    { filename: 'background.js' }
  );

  globalThis.__sidePanelCalls = sidePanelCalls;

  return globalThis.__extension;
}

const api = loadBackground();

const PAGE_WITH_AGGREGATE = `<!DOCTYPE html><html><body>
  <script type="application/ld+json">
  { "@context": "http://schema.org", "@type": "MediaObject",
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.6", "bestRating": "5", "ratingCount": "12" } }
  </script>
  <section class="bg-[var(--card)] rounded-2xl">
    <span class="text-[0.72rem] text-[var(--muted)]">4</span>
    <time class="text-[0.75rem]" datetime="1700000000000">Nov 14, 2023</time>
  </section>
  <section class="bg-[var(--card)] rounded-2xl">
    <time datetime="1710000000000">Mar 09, 2024</time>
  </section>
</body></html>`;

const PAGE_WITHOUT_AGGREGATE = `<!DOCTYPE html><html><body>
  <section class="rounded-2xl">
    <h4 class="font-bold">مدیر محصول</h4>
    <span class="text-[0.72rem] text-[var(--muted)]">4</span>
    <time datetime="1700000000000">Nov 14, 2023</time>
  </section>
  <section class="rounded-2xl">
    <h4 class="font-bold">برنامه‌نویس</h4>
    <span class="text-[0.72rem] text-[var(--muted)]">2</span>
  </section>
  <section id="review-suggest-section" class="rounded-2xl">ثبت تجربه</section>
  <section class="rounded-2xl">معرفی شرکت</section>
</body></html>`;

test('normalizes Persian/Arabic letters and legal-form words', () => {
  assert.equal(api.normalizeCompanyName('شركت ديجي كالا (سهامی خاص)'), 'دیجی کالا');
  assert.equal(api.normalizeCompanyName('  گروه   آبانگان  '), 'گروه ابانگان');
  assert.equal(api.normalizeCompanyName(''), '');
});

test('parses review totals, average rating and latest date from structured data', () => {
  const stats = api.parseCompanyStats(PAGE_WITH_AGGREGATE);
  assert.equal(stats.reviewCount, 12);
  assert.equal(stats.averageRating, 4.6);
  assert.equal(stats.latestReviewDate, 1710000000000);
});

test('falls back to review sections when structured data is missing', () => {
  const stats = api.parseCompanyStats(PAGE_WITHOUT_AGGREGATE);
  assert.equal(stats.reviewCount, 2);
  assert.equal(stats.averageRating, 3);
  assert.equal(stats.latestReviewDate, 1700000000000);
});

test('returns empty totals for a page without reviews', () => {
  const stats = api.parseCompanyStats('<html><body>معرفی شرکت</body></html>');
  assert.deepEqual(stats, { reviewCount: 0, averageRating: 0, latestReviewDate: null });
});

test('finds exact matches and ignores legal-form differences', () => {
  const companies = [
    { title: 'آبانگان', title_en: 'abanegan', url: '/abanegan/' },
    { title: 'دیجی کالا', title_en: 'digikala', url: '/digikala/' }
  ];

  const match = api.findCompany('شرکت آبانگان', companies);
  assert.equal(match.company.title, 'آبانگان');
  assert.equal(match.score, 100);
});

test('matches English company names', () => {
  const companies = [{ title: 'اسنپ', title_en: 'snapp', url: '/snapp/' }];
  const match = api.findCompany('Snapp', companies);
  assert.equal(match.company.title, 'اسنپ');
  assert.equal(match.score, 95);
});

test('rejects unrelated and merely similar names', () => {
  const companies = [
    { title: 'موج', title_en: '', url: '/mowj/' },
    { title: 'اسنپ', title_en: 'snapp', url: '/snapp/' }
  ];
  assert.equal(api.findCompany('شرکت ناموجود', companies), null);
  assert.equal(api.findCompany('اسنپفود', companies), null);
});

test('matches names that only differ in spacing', () => {
  const companies = [{ title: 'دیجی کالا', title_en: 'digikala', url: '/digikala/' }];
  const match = api.findCompany('دیجیکالا', companies);
  assert.equal(match.company.title, 'دیجی کالا');
  assert.ok(match.score >= 95);
});

test('flags prefix matches as weak', () => {
  const companies = [{ title: 'دیجی کالا', title_en: 'digikala', url: '/digikala/' }];
  const match = api.findCompany('دیجی', companies);
  assert.equal(match.company.title, 'دیجی کالا');
  assert.ok(match.score < 85);
});

test('keeps cached results isolated per tab and per source', async () => {
  const pageUrl = 'https://jobvision.ir/companies/1/abanegan';
  const otherUrl = 'https://jobvision.ir/companies/2/snapp';
  const tabId = 101;

  await Promise.all([
    api.setCachedResult(tabId, 'tajrobe', pageUrl, { found: true, id: 'tajrobe' }),
    api.setCachedResult(tabId, 'linka', pageUrl, { success: true, id: 'linka' }),
    api.setCachedResult(tabId, 'daneshBonyan', pageUrl, { success: true, id: 'danesh' })
  ]);

  assert.deepEqual(await api.getCachedResult(tabId, 'tajrobe', pageUrl), { found: true, id: 'tajrobe' });
  assert.deepEqual(await api.getCachedResult(tabId, 'linka', pageUrl), { success: true, id: 'linka' });
  assert.deepEqual(await api.getCachedResult(tabId, 'daneshBonyan', pageUrl), { success: true, id: 'danesh' });

  // Another page or another tab must not see this cache
  assert.equal(await api.getCachedResult(tabId, 'tajrobe', otherUrl), null);
  assert.equal(await api.getCachedResult(202, 'tajrobe', pageUrl), null);
});

test('keeps company info isolated per tab and drops it on url change', async () => {
  const urlA = 'https://jobvision.ir/companies/1/abanegan';
  const urlB = 'https://jobinja.ir/companies/snapp';

  await api.storeCompanyInfo(1, { name: 'آبانگان', url: urlA, timestamp: Date.now() });
  await api.storeCompanyInfo(2, { name: 'اسنپ', url: urlB, timestamp: Date.now() });

  assert.equal((await api.getCompanyInfo(1, urlA)).name, 'آبانگان');
  assert.equal((await api.getCompanyInfo(2, urlB)).name, 'اسنپ');
  assert.equal(await api.getCompanyInfo(1, urlB), null);

  await api.clearTabData(1);
  assert.equal(await api.getCompanyInfo(1, urlA), null);
  assert.equal((await api.getCompanyInfo(2, urlB)).name, 'اسنپ');
});

test('drops cached results when the tab navigates to a new company page', async () => {
  const urlA = 'https://jobvision.ir/companies/1/abanegan';
  const urlB = 'https://jobvision.ir/companies/2/snapp';
  const tabId = 303;

  await api.storeCompanyInfo(tabId, { name: 'آبانگان', url: urlA, timestamp: Date.now() });
  await api.setCachedResult(tabId, 'tajrobe', urlA, { found: true });
  assert.deepEqual(await api.getCachedResult(tabId, 'tajrobe', urlA), { found: true });

  await api.storeCompanyInfo(tabId, { name: 'اسنپ', url: urlB, timestamp: Date.now() });
  assert.equal(await api.getCachedResult(tabId, 'tajrobe', urlA), null);
});

test('ignores expired cache entries', async () => {
  const pageUrl = 'https://jobvision.ir/companies/1/abanegan';
  const tabId = 404;

  await api.setCachedResult(tabId, 'tajrobe', pageUrl, { found: true });
  await api.updateTabData(tabId, (tabData) => {
    tabData.cache.tajrobe.timestamp = Date.now() - 31 * 60 * 1000;
    return tabData;
  });

  assert.equal(await api.getCachedResult(tabId, 'tajrobe', pageUrl), null);
});

test('saves the side panel preference and applies it to the toolbar', async () => {
  const call = (message) => new Promise(resolve => {
    const keepOpen = global.__onMessage(message, {}, resolve);
    assert.equal(keepOpen, true);
  });

  const enabled = await call({ type: 'SET_SIDE_PANEL_MODE', enabled: true });
  assert.deepEqual(enabled, { ok: true, enabled: true });

  const stored = await chrome.storage.local.get('openInSidePanel');
  assert.equal(stored.openInSidePanel, true);
  assert.deepEqual(global.__sidePanelCalls[global.__sidePanelCalls.length - 1], { openPanelOnActionClick: true });

  const disabled = await call({ type: 'SET_SIDE_PANEL_MODE', enabled: false });
  assert.deepEqual(disabled, { ok: true, enabled: false });
  assert.deepEqual(global.__sidePanelCalls[global.__sidePanelCalls.length - 1], { openPanelOnActionClick: false });
});

test('clears only the cache of one tab', async () => {
  const pageUrl = 'https://jobvision.ir/companies/1/abanegan';

  await api.setCachedResult(501, 'tajrobe', pageUrl, { found: true });
  await api.setCachedResult(502, 'tajrobe', pageUrl, { found: true });

  await api.clearTabCache(501);

  assert.equal(await api.getCachedResult(501, 'tajrobe', pageUrl), null);
  assert.deepEqual(await api.getCachedResult(502, 'tajrobe', pageUrl), { found: true });
});
