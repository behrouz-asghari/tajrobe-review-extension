// Background service worker - company search on tajrobe.github.io and per-tab caching

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const SEARCH_INDEX_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
const SEARCH_INDEX_STORAGE_KEY = 'tajrobeSearchIndex';
const SIDE_PANEL_PREF_KEY = 'openInSidePanel';

// Match confidence below this value means "not found", above CONFIDENT_MATCH means
// "no warning needed". Anything in between is shown as a closest-match warning.
const MATCH_THRESHOLD = 60;
const CONFIDENT_MATCH = 85;

// Per-tab data lives in the session storage, so it is dropped with the browser
// session and never leaks between browser starts
const tabStorage = chrome.storage.session || chrome.storage.local;

let searchIndexMemory = null;
let searchIndexTimestamp = 0;

// Helper function to check if URL is a company page
function isCompanyPage(url) {
  if (!url) return false;
  return /jobvision\.ir\/companies\//.test(url) ||
         /jobinja\.ir\/companies\//.test(url);
}

// ---------------------------------------------------------------------------
// Per-tab storage
//
// Every tab (window) keeps its own company info and its own cached results,
// so opening several company pages at once never mixes their data, and the
// data survives closing and reopening the popup.
// ---------------------------------------------------------------------------

const tabLocks = new Map();

function tabStorageKey(tabId) {
  return `tab:${tabId}`;
}

// Serialize read-modify-write cycles per tab, so parallel requests for the
// different data sources cannot overwrite each other
function withTabLock(tabId, task) {
  const previous = tabLocks.get(tabId) || Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => {});
  tabLocks.set(tabId, settled);
  settled.then(() => {
    if (tabLocks.get(tabId) === settled) tabLocks.delete(tabId);
  });
  return next;
}

async function readTabData(tabId) {
  if (typeof tabId !== 'number') return null;

  const key = tabStorageKey(tabId);
  const stored = (await tabStorage.get(key))[key];
  return stored || null;
}

async function updateTabData(tabId, updater) {
  if (typeof tabId !== 'number') return null;

  return withTabLock(tabId, async () => {
    const current = (await readTabData(tabId)) || {};
    const updated = updater(current) || current;
    await tabStorage.set({ [tabStorageKey(tabId)]: updated });
    return updated;
  });
}

async function getCompanyInfo(tabId, pageUrl) {
  const tabData = await readTabData(tabId);
  const company = tabData && tabData.company;
  if (!company || !company.name) return null;

  // The tab has navigated to another page since this data was stored
  if (pageUrl && company.url !== pageUrl) return null;

  return company;
}

async function storeCompanyInfo(tabId, company) {
  return updateTabData(tabId, (tabData) => {
    const cache = tabData.cache || {};
    const samePage = tabData.company && tabData.company.url === company.url;

    return {
      company: company,
      // Results cached for a previous page of this tab are no longer valid
      cache: samePage ? cache : {}
    };
  });
}

async function getCachedResult(tabId, source, pageUrl) {
  if (!pageUrl) return null;

  const tabData = await readTabData(tabId);
  const entry = tabData && tabData.cache ? tabData.cache[source] : null;
  if (!entry) return null;

  // Cache belongs to another page in this tab, or is too old
  if (entry.url !== pageUrl) return null;
  if (Date.now() - entry.timestamp > CACHE_DURATION) return null;

  return entry.data;
}

async function setCachedResult(tabId, source, pageUrl, data) {
  if (!pageUrl) return;

  await updateTabData(tabId, (tabData) => {
    const cache = tabData.cache || {};
    cache[source] = { url: pageUrl, timestamp: Date.now(), data: data };
    return { company: tabData.company || null, cache: cache };
  });
}

async function clearTabCache(tabId) {
  await updateTabData(tabId, (tabData) => ({
    company: tabData.company || null,
    cache: {}
  }));
}

async function clearTabData(tabId) {
  if (typeof tabId !== 'number') return;

  await withTabLock(tabId, () => tabStorage.remove(tabStorageKey(tabId)));
}

// Run a search but reuse this tab's cached result when available
async function cachedSearch(source, searchFn, message) {
  const { companyName, tabId, pageUrl } = message;

  const cached = await getCachedResult(tabId, source, pageUrl);
  if (cached) return cached;

  const result = await searchFn(companyName);
  await setCachedResult(tabId, source, pageUrl, result);

  return result;
}

chrome.runtime.onInstalled.addListener(() => {
  const RULE_ID = 1;
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: [
      {
        id: RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Origin', operation: 'set', value: 'https://pub.daneshbonyan.ir' },
            { header: 'Referer', operation: 'set', value: 'https://pub.daneshbonyan.ir/' }
          ]
        },
        condition: {
          urlFilter: 'https://api.daneshbonyan.ir/*',
          resourceTypes: ['xmlhttprequest']
        }
      }
    ]
  });
});

// Listen for tab updates to clear badge and per-tab data when leaving company pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (!isCompanyPage(tab.url)) {
      // Not a company page - clear badge and this tab's data
      chrome.action.setBadgeText({ text: '', tabId: tabId });
      clearTabData(tabId);
    }
  }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !isCompanyPage(tab.url)) {
      // Not a company page - clear badge and this tab's data
      chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
      clearTabData(activeInfo.tabId);
    }
  } catch (error) {
    // Tab might not be accessible
  }
});

// Drop cached data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabData(tabId);
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_COMPANY') {
    getCompanyInfo(message.tabId, message.pageUrl).then(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (message.type === 'SEARCH_COMPANY') {
    cachedSearch('tajrobe', searchCompany, message)
      .then(result => sendResponse(result));
    return true;
  }

  if (message.type === 'SEARCH_LINKA') {
    cachedSearch('linka', searchLinkaAPI, message)
      .then(result => sendResponse(result));
    return true;
  }

  if (message.type === 'SEARCH_DANESH_BONYAN') {
    cachedSearch('daneshBonyan', searchDaneshBonyanAPI, message)
      .then(result => sendResponse(result));
    return true;
  }

  if (message.type === 'REFRESH_TAB') {
    clearTabCache(message.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'SET_SIDE_PANEL_MODE') {
    const enabled = !!message.enabled;

    chrome.storage.local.set({ [SIDE_PANEL_PREF_KEY]: enabled });

    applySidePanelPreference(enabled)
      .then(() => sendResponse({ ok: true, enabled: enabled }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'COMPANY_FOUND') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;

    if (typeof tabId === 'number') {
      storeCompanyInfo(tabId, {
        name: message.companyName,
        source: message.source,
        url: message.pageUrl,
        timestamp: Date.now()
      }).then(() => updateBadge(message.companyName, tabId, message.pageUrl));
    } else {
      updateBadge(message.companyName, tabId, message.pageUrl);
    }

    // Let an open popup/side panel refresh itself on in-page navigation
    broadcast({ type: 'COMPANY_UPDATED', tabId: tabId, pageUrl: message.pageUrl });
  }

  if (message.type === 'CLEAR_BADGE') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;

    // Clear badge when not on a company page
    chrome.action.setBadgeText({ text: '', tabId: tabId });
    // Clear stored company info for this tab
    clearTabData(tabId);

    broadcast({ type: 'COMPANY_CLEARED', tabId: tabId });
  }
});

// The action click either opens the popup or the side panel, depending on the
// user's choice
async function applySidePanelPreference(enabled) {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !!enabled });
}

async function restoreSidePanelPreference() {
  try {
    const stored = await chrome.storage.local.get(SIDE_PANEL_PREF_KEY);
    await applySidePanelPreference(!!stored[SIDE_PANEL_PREF_KEY]);
  } catch (error) {
    // Side panel API is unavailable in this browser
  }
}

chrome.runtime.onStartup.addListener(restoreSidePanelPreference);
chrome.runtime.onInstalled.addListener(restoreSidePanelPreference);

// Send an event to open extension pages (popup / side panel)
function broadcast(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      // No extension page is listening; reading lastError keeps it quiet
      if (chrome.runtime.lastError) return;
    });
  } catch (error) {
    // No extension page is open
  }
}

// ---------------------------------------------------------------------------
// Search index
// ---------------------------------------------------------------------------

async function readStoredSearchIndex() {
  try {
    const stored = (await chrome.storage.local.get(SEARCH_INDEX_STORAGE_KEY))[SEARCH_INDEX_STORAGE_KEY];
    if (!stored || !stored.data) return null;
    if (Date.now() - stored.timestamp > SEARCH_INDEX_CACHE_DURATION) return null;
    return stored;
  } catch (error) {
    return null;
  }
}

async function fetchSearchData() {
  // 1. Memory (fastest, survives until the service worker sleeps)
  if (searchIndexMemory && (Date.now() - searchIndexTimestamp < SEARCH_INDEX_CACHE_DURATION)) {
    return searchIndexMemory;
  }

  // 2. Stored copy, so a restarted service worker does not re-download it
  const stored = await readStoredSearchIndex();
  if (stored) {
    searchIndexMemory = stored.data;
    searchIndexTimestamp = stored.timestamp;
    return searchIndexMemory;
  }

  // 3. Network
  try {
    const response = await fetch('https://tajrobe.github.io/assets/search.json');
    if (!response.ok) throw new Error('Failed to fetch data');

    const data = await response.json();
    searchIndexMemory = data;
    searchIndexTimestamp = Date.now();

    try {
      await chrome.storage.local.set({
        [SEARCH_INDEX_STORAGE_KEY]: { timestamp: searchIndexTimestamp, data: data }
      });
    } catch (error) {
      // Storage quota problems must not break the search
    }

    return searchIndexMemory;
  } catch (error) {
    console.error('Error fetching tajrobe data:', error);
    if (searchIndexMemory) return searchIndexMemory;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Company matching
// ---------------------------------------------------------------------------

// Normalize names before comparing: unify Arabic/Persian letters, drop ZWNJ and
// punctuation and remove legal-form words such as "شرکت" or "سهامی خاص"
function normalizeCompanyName(name) {
  if (!name) return '';

  return String(name)
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/[.,،؛:;()\[\]{}«»"'“”\-–—_/\\]/g, ' ')
    .replace(/(^|\s)(شرکت|سهامی|خاص|عام|مسئولیت|محدود)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True when needle appears in haystack as a whole word (or the whole string)
function containsAsWords(haystack, needle) {
  if (!haystack || !needle) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(needle)}(\\s|$)`);
  return pattern.test(haystack);
}

// Confidence (0-100) that a search term refers to a given company
function scoreCompanyMatch(searchTerm, company) {
  const search = normalizeCompanyName(searchTerm);
  const title = normalizeCompanyName(company.title);
  const titleEn = normalizeCompanyName(company.title_en);

  if (!search) return { score: 0, type: 'none' };

  if (title && title === search) return { score: 100, type: 'exact' };
  if (titleEn && titleEn === search) return { score: 95, type: 'english' };

  // Ignore spaces entirely, so "دیجی کالا" and "دیجیکالا" are the same company
  const searchCompact = search.replace(/\s+/g, '');
  const titleCompact = title.replace(/\s+/g, '');
  if (searchCompact.length >= 3 && searchCompact === titleCompact) return { score: 96, type: 'exact' };

  let best = 0;
  let type = 'none';

  const consider = (score, matchType) => {
    if (score > best) {
      best = score;
      type = matchType;
    }
  };

  if (title) {
    // A prefix is a guess, not a confirmation, so it stays below CONFIDENT_MATCH
    if (search.length >= 3 && title.startsWith(search)) consider(80, 'prefix');

    // Containment only counts on word boundaries, so "ناموجود" does not match "موج"
    if (containsAsWords(search, title) || containsAsWords(title, search)) {
      const ratio = Math.min(search.length, title.length) / Math.max(search.length, title.length);
      consider(Math.round(60 + ratio * 25), 'contains');
    }

    const searchWords = search.split(' ').filter(word => word.length > 1);
    if (searchWords.length > 0) {
      const titleWords = title.split(' ');
      const matched = searchWords.filter(word => titleWords.some(titleWord => titleWord === word)).length;
      if (matched > 0) consider(Math.round((matched / searchWords.length) * 75), 'words');
    }
  }

  if (titleEn && titleEn.length >= 3 && (containsAsWords(titleEn, search) || containsAsWords(search, titleEn))) {
    const ratio = Math.min(search.length, titleEn.length) / Math.max(search.length, titleEn.length);
    consider(Math.round(55 + ratio * 25), 'english');
  }

  return { score: best, type: type };
}

// Best match above the confidence threshold, or null when nothing is close enough
function findCompany(searchTerm, companies) {
  let bestCompany = null;
  let bestScore = 0;
  let bestType = 'none';

  for (const company of companies) {
    const { score, type } = scoreCompanyMatch(searchTerm, company);
    if (score > bestScore) {
      bestCompany = company;
      bestScore = score;
      bestType = type;
    }
    if (bestScore === 100) break;
  }

  if (!bestCompany || bestScore < MATCH_THRESHOLD) return null;

  return { company: bestCompany, score: bestScore, type: bestType };
}

async function searchCompany(searchTerm) {
  try {
    const companies = await fetchSearchData();
    const match = findCompany(searchTerm, companies);

    if (match) {
      const companyUrl = `https://tajrobe.github.io${match.company.url}`;

      // Fetch review totals from company page
      const stats = await fetchCompanyPage(companyUrl);

      return {
        found: true,
        matchConfidence: match.score,
        matchType: match.type,
        weakMatch: match.score < CONFIDENT_MATCH,
        company: {
          title: match.company.title,
          titleEn: match.company.title_en,
          city: match.company.city?.trim(),
          url: companyUrl,
          logo: match.company.logo,
          cover: match.company.cover,
          reviewCount: stats.reviewCount,
          averageRating: stats.averageRating,
          latestReviewDate: stats.latestReviewDate || null
        }
      };
    }

    return {
      found: false,
      searchTerm: searchTerm,
      searchUrl: `https://tajrobe.github.io/search/`
    };
  } catch (error) {
    return {
      found: false,
      error: error.message,
      searchTerm: searchTerm
    };
  }
}

// ---------------------------------------------------------------------------
// Company page parsing
// ---------------------------------------------------------------------------

async function fetchCompanyPage(pageUrl) {
  try {
    const response = await fetch(pageUrl);
    if (!response.ok) throw new Error('Failed to fetch company page');

    const html = await response.text();
    return parseCompanyStats(html);
  } catch (error) {
    console.error('Error fetching company page:', error);
    return { reviewCount: 0, averageRating: 0, latestReviewDate: null };
  }
}

// Latest review timestamp (epoch ms) found on the company page
function parseLatestReviewDate(html) {
  const timeRegex = /<time\b[^>]*\bdatetime="([^"]+)"/gi;
  let latest = null;
  let timeMatch;

  while ((timeMatch = timeRegex.exec(html)) !== null) {
    const raw = timeMatch[1].trim();
    const timestamp = /^\d+$/.test(raw) ? parseInt(raw, 10) : new Date(raw).getTime();

    if (!isNaN(timestamp) && (latest === null || timestamp > latest)) {
      latest = timestamp;
    }
  }

  return latest;
}

// Extract number of reviews and average rating from the company page
function parseCompanyStats(html) {
  const latestReviewDate = parseLatestReviewDate(html);

  // 1. Structured data contains the totals for all reviews
  const aggregateMatch = html.match(/"aggregateRating"\s*:\s*\{([\s\S]*?)\}/i);
  if (aggregateMatch) {
    const valueMatch = aggregateMatch[1].match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i);
    const countMatch = aggregateMatch[1].match(/"ratingCount"\s*:\s*"?(\d+)"?/i);

    if (valueMatch && countMatch) {
      const averageRating = parseFloat(valueMatch[1]);
      const reviewCount = parseInt(countMatch[1], 10);

      if (!isNaN(averageRating) && !isNaN(reviewCount)) {
        return {
          reviewCount: reviewCount,
          averageRating: Math.round(averageRating * 10) / 10,
          latestReviewDate: latestReviewDate
        };
      }
    }
  }

  // 2. Fallback: derive the totals from the review sections themselves
  const ratings = [];

  const sectionRegex = /<section\s+class="[^"]*rounded-2xl[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionContent = sectionMatch[1];

    // Skip company intro section (contains "معرفی شرکت")
    if (sectionContent.includes('معرفی شرکت')) continue;

    // Skip review suggestion section
    if (sectionContent.includes('review-suggest-section')) continue;

    const rating = extractRatingFromSection(sectionContent);
    if (rating > 0) ratings.push(rating);
  }

  if (ratings.length === 0) {
    return { reviewCount: 0, averageRating: 0, latestReviewDate: latestReviewDate };
  }

  const sum = ratings.reduce((total, rating) => total + rating, 0);

  return {
    reviewCount: ratings.length,
    averageRating: Math.round((sum / ratings.length) * 10) / 10,
    latestReviewDate: latestReviewDate
  };
}

function extractRatingFromSection(sectionContent) {
  let rating = 0;

  // Numeric rating from: <span class="text-[0.72rem]...">X</span>
  const numericRatingMatch = sectionContent.match(/<span\s+class="text-\[0\.72rem\][^"]*">([\d.]+)<\/span>/i);
  if (numericRatingMatch) {
    const numRating = parseFloat(numericRatingMatch[1]);
    if (!isNaN(numRating) && numRating > 0) {
      return numRating;
    }
  }

  // Fallback: star bar width, e.g. style="width: 92.0%"
  const ratingMatch = sectionContent.match(/<span\s+class="absolute[^"]*"[^>]*style="width:\s*([\d.]+)%"[^>]*>/i);
  if (ratingMatch) {
    const percentage = parseFloat(ratingMatch[1]);
    rating = Math.round((percentage / 100) * 5);
  }

  return rating;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

async function updateBadge(companyName, tabId, pageUrl) {
  try {
    // Reuses the tab cache, so opening the popup does not repeat this request
    const result = await cachedSearch('tajrobe', searchCompany, {
      companyName: companyName,
      tabId: tabId,
      pageUrl: pageUrl
    });

    if (result && result.found && !result.weakMatch) {
      chrome.action.setBadgeText({ text: '✓', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: tabId });
    } else if (result && result.found) {
      // Closest match only - the user should double check
      chrome.action.setBadgeText({ text: '?', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800', tabId: tabId });
    } else {
      chrome.action.setBadgeText({ text: '✗', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#f44336', tabId: tabId });
    }
  } catch (error) {
    chrome.action.setBadgeText({ text: '', tabId: tabId });
  }
}

// ---------------------------------------------------------------------------
// External APIs
// ---------------------------------------------------------------------------

// Search Linka.ir API for company registration info
async function searchLinkaAPI(companyName) {
  try {
    const rnd = Math.floor(100 + Math.random() * 900); // 3-digit random number
    const url = `https://api.linka.ir/Api/V1/Site/SuggestionSearch?search=${encodeURIComponent(companyName)}&typeId=2&rnd=${rnd}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch Linka data');

    const data = await response.json();

    if (data.success && data.data && data.data.length > 0) {
      // Filter only typeId: 2 (companies), exclude typeId: 1 (individuals)
      const companiesOnly = data.data.filter(item => item.typeId === 2);

      return {
        success: true,
        companies: companiesOnly.map(item => ({
          code: item.code,
          standardName: item.standardName,
          nationalId: item.subTitle,
          logoUrl: item.isLogoView ? `https://api.linka.ir/Api/V1/common/companyLogo?code=${item.code}` : null,
          pageUrl: `https://linka.ir/company/${item.code}/${encodeURIComponent(item.standardName)}`
        }))
      };
    }

    return { success: true, companies: [] };
  } catch (error) {
    console.error('Error searching Linka API:', error);
    return { success: false, error: error.message, companies: [] };
  }
}

// Search Danesh Bonyan API for knowledge-based company info
async function searchDaneshBonyanAPI(companyName) {
  try {
    const url = 'https://api.daneshbonyan.ir/kb-co-pub-info/list?page=0&pageSize=10';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ term: companyName })
    });

    if (!response.ok) throw new Error('Failed to fetch Danesh Bonyan data');

    const data = await response.json();

    if (data.succeeded && data.returnValue && data.returnValue.length > 0) {
      return {
        success: true,
        companies: data.returnValue.map(item => ({
          coName: item.coName,
          nationalId: item.nationalId,
          coStateTitle: item.coStateTitle,
          provinceTitle: item.provinceTitle,
          technologyZoneTypeTitle: item.technologyZoneTypeTitle,
          confirmDate: item.confirmDate,
          officePhoneNumber: item.officePhoneNumber
        })),
        totalRecords: data.totalRecords
      };
    }

    return { success: true, companies: [], totalRecords: 0 };
  } catch (error) {
    console.error('Error searching Danesh Bonyan API:', error);
    return { success: false, error: error.message, companies: [], totalRecords: 0 };
  }
}
