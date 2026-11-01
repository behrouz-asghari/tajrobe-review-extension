// Popup script - displays company info and review summary from tajrobe.github.io

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function toPersianDigits(value) {
  return String(value)
    .replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[digit])
    .replace(/,/g, '٬');
}

// Gregorian to Shamsi (Jalali) date converter
function gregorianToShamsi(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2, days;

  if (gm > 2) {
    gy2 = gy + 1;
  } else {
    gy2 = gy;
  }

  days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];

  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let jm, jd;

  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }

  return { year: jy, month: jm, day: jd };
}

function formatReviewDate(timestamp) {
  if (!timestamp) return '';

  const date = new Date(Number(timestamp));
  if (isNaN(date.getTime())) return '';

  const shamsi = gregorianToShamsi(date.getFullYear(), date.getMonth() + 1, date.getDate());

  const monthNames = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];

  return `${shamsi.day} ${monthNames[shamsi.month - 1]} ${shamsi.year}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentTab = null;
let currentSearchName = '';
let loadToken = 0;
let sidePanelMode = false;
let reloadTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', refreshResults);
  document.getElementById('side-panel-toggle').addEventListener('click', toggleSidePanel);

  registerAutoRefresh();
  initSidePanelToggle();
  loadCompanyData();
});

function show(el, display) {
  el.style.display = display || 'block';
}

function hide(el) {
  el.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadCompanyData() {
  const token = ++loadToken;

  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const notCompanyEl = document.getElementById('not-company');
  const resultEl = document.getElementById('result');

  show(loadingEl, 'block');
  hide(errorEl);
  hide(notCompanyEl);
  hide(resultEl);

  try {
    // Only the current tab's own company info is used, so several open
    // company pages never mix their data
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (token !== loadToken) return;

    if (!tab || typeof tab.id !== 'number') {
      showNotCompany();
      return;
    }

    currentTab = tab;

    const companyInfo = await getCompanyInfo(tab.id, tab.url);
    if (token !== loadToken) return;

    if (!companyInfo || !companyInfo.name) {
      showNotCompany();
      return;
    }

    // Show the company name and skeletons right away, then load the three
    // sources in parallel
    const searchName = companyInfo.name;
    currentSearchName = searchName;
    startLoading(searchName);

    const linkaPromise = searchLinkaAPI(searchName, tab.id, tab.url)
      .then(result => { if (token === loadToken) renderLinka(result); })
      .catch(() => { if (token === loadToken) renderLinkaError(); });

    const daneshPromise = searchDaneshBonyanAPI(searchName, tab.id, tab.url)
      .then(result => { if (token === loadToken) renderDaneshBonyan(result); })
      .catch(() => { if (token === loadToken) renderDaneshBonyanError(); });

    const tajrobePromise = searchCompany(searchName, tab.id, tab.url);

    try {
      const result = await tajrobePromise;
      if (token !== loadToken) return;

      if (result && result.found && result.company) {
        renderFound(result);
      } else if (result && result.error) {
        showError(result.error);
      } else {
        renderNotFound(searchName);
      }
    } catch (error) {
      if (token === loadToken) showError(error.message);
    }

    await Promise.allSettled([linkaPromise, daneshPromise]);

    if (token === loadToken) finishLoading();
  } catch (error) {
    if (token === loadToken) showError(error.message);
  }
}

async function refreshResults() {
  const refreshBtn = document.getElementById('refresh-btn');
  if (!currentTab || refreshBtn.disabled) return;

  refreshBtn.disabled = true;

  try {
    await sendMessage({ type: 'REFRESH_TAB', tabId: currentTab.id });
    await loadCompanyData();
  } catch (error) {
    showError(error.message);
  } finally {
    refreshBtn.disabled = false;
  }
}

function startLoading(companyName) {
  const loadingEl = document.getElementById('loading');
  const resultEl = document.getElementById('result');
  const cardEl = document.getElementById('company-card');
  const nameEl = document.getElementById('company-name');
  const nameEnEl = document.getElementById('company-name-en');
  const cityEl = document.getElementById('company-city');
  const logoEl = document.getElementById('company-logo');
  const reviewsSection = document.getElementById('reviews-section');
  const summaryEl = document.getElementById('rating-summary');
  const skeletonEl = document.getElementById('rating-skeleton');
  const emptyEl = document.getElementById('reviews-empty');
  const actionsEl = document.querySelector('.reviews-actions');
  const linkaSection = document.getElementById('linka-section');
  const linkaList = document.getElementById('linka-list');
  const linkaSkeleton = document.getElementById('linka-skeleton');
  const linkaError = document.getElementById('linka-error');
  const daneshSection = document.getElementById('danesh-bonyan-section');
  const daneshList = document.getElementById('danesh-bonyan-list');
  const daneshSkeleton = document.getElementById('danesh-skeleton');
  const daneshError = document.getElementById('danesh-error');
  const notFoundEl = document.getElementById('not-found');

  hide(loadingEl);
  show(resultEl, 'block');

  setStatus('loading', '…', `در حال جستجوی تجربه‌های کاری «${companyName}»…`);

  show(cardEl, 'block');
  nameEl.textContent = companyName;
  nameEnEl.textContent = '';
  cityEl.textContent = '';
  hide(logoEl);

  show(reviewsSection, 'block');
  hide(summaryEl);
  show(skeletonEl, 'grid');
  hide(emptyEl);
  hide(actionsEl);

  show(linkaSection, 'block');
  linkaList.innerHTML = '';
  show(linkaSkeleton, 'block');
  hide(linkaError);

  show(daneshSection, 'block');
  daneshList.innerHTML = '';
  show(daneshSkeleton, 'block');
  hide(daneshError);

  hide(notFoundEl);
}

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

async function initSidePanelToggle() {
  const toggle = document.getElementById('side-panel-toggle');

  if (!chrome.sidePanel) {
    // Older browsers without the side panel API
    toggle.style.display = 'none';
    return;
  }

  try {
    const stored = await chrome.storage.local.get('openInSidePanel');
    updateSidePanelToggle(!!stored.openInSidePanel);
  } catch (error) {
    updateSidePanelToggle(false);
  }
}

function updateSidePanelToggle(enabled) {
  sidePanelMode = !!enabled;

  const toggle = document.getElementById('side-panel-toggle');
  toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  toggle.title = enabled
    ? 'کلیک روی آیکون افزونه نوار کناری را باز می‌کند؛ برای بازگشت به پاپ‌آپ کلیک کنید'
    : 'باز شدن افزونه در نوار کناری مرورگر';
}

async function toggleSidePanel() {
  const toggle = document.getElementById('side-panel-toggle');
  if (toggle.disabled) return;

  const enabling = !sidePanelMode;

  if (enabling) {
    // The panel must be opened while the click's user gesture is still active
    const windowId = currentTab ? currentTab.windowId : undefined;
    let openPromise = Promise.resolve();

    if (chrome.sidePanel && chrome.sidePanel.open && typeof windowId === 'number') {
      try {
        openPromise = chrome.sidePanel.open({ windowId: windowId });
      } catch (error) {
        openPromise = Promise.resolve();
      }
    }

    await setSidePanelMode(true);

    try {
      await openPromise;
    } catch (error) {
      // Panel could not be opened now, but the toolbar setting is saved
    }
  } else {
    await setSidePanelMode(false);
  }
}

async function setSidePanelMode(enabled) {
  updateSidePanelToggle(enabled);

  try {
    await sendMessage({ type: 'SET_SIDE_PANEL_MODE', enabled: enabled });
  } catch (error) {
    // Revert the toggle when the background could not save the preference
    updateSidePanelToggle(!enabled);
  }
}

// ---------------------------------------------------------------------------
// Auto refresh (needed while the extension is open in the side panel)
// ---------------------------------------------------------------------------

function registerAutoRefresh() {
  if (!chrome.tabs || !chrome.tabs.onActivated) return;

  chrome.tabs.onActivated.addListener(() => scheduleReload(300));

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!currentTab || tabId !== currentTab.id) return;
    if (changeInfo.url || changeInfo.status === 'complete') scheduleReload(400);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!currentTab || !message) return;
    if (message.tabId !== currentTab.id) return;

    if (message.type === 'COMPANY_UPDATED' || message.type === 'COMPANY_CLEARED') {
      scheduleReload(500);
    }
  });
}

function scheduleReload(delay) {
  if (reloadTimer) clearTimeout(reloadTimer);

  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    if (document.visibilityState === 'visible') loadCompanyData();
  }, delay);
}

function finishLoading() {
  hide(document.getElementById('loading'));

  // Safety net: no skeleton should stay visible
  const skeletons = ['rating-skeleton', 'linka-skeleton', 'danesh-skeleton'];
  skeletons.forEach(id => {
    const el = document.getElementById(id);
    if (el) hide(el);
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function setStatus(state, icon, text) {
  const statusEl = document.getElementById('match-status');
  statusEl.className = `match-status ${state}`;
  document.getElementById('match-status-icon').textContent = icon;
  document.getElementById('match-status-text').textContent = text;
}

function renderFound(result) {
  const company = result.company;

  // Header card
  const cardEl = document.getElementById('company-card');
  const nameEl = document.getElementById('company-name');
  const nameEnEl = document.getElementById('company-name-en');
  const cityEl = document.getElementById('company-city');
  const logoEl = document.getElementById('company-logo');
  const logoImg = document.getElementById('logo-img');

  show(cardEl, 'block');
  nameEl.textContent = company.title || '';
  nameEnEl.textContent = company.titleEn || '';
  cityEl.textContent = company.city || '';

  if (company.logo) {
    logoImg.src = company.logo;
    show(logoEl, 'block');
  } else {
    hide(logoEl);
  }

  // Status banner at the top
  const confidence = Number(result.matchConfidence) || 0;

  if (result.weakMatch) {
    setStatus('weak', '!', `نزدیکترین شرکت: «${company.title}» — تطابق ${toPersianDigits(confidence)}٪؛ ممکن است شرکت متفاوتی باشد`);
  } else {
    setStatus('found', '✓', `«${company.title}» در تجربه یافت شد`);
  }

  // Review summary
  showRatingSummary(company.reviewCount, company.averageRating, company.latestReviewDate);

  // Link to all reviews
  const actionsEl = document.querySelector('.reviews-actions');
  const linkEl = document.getElementById('company-link');
  if (company.url) {
    linkEl.href = company.url;
    show(actionsEl, 'flex');
  }

  hide(document.getElementById('not-found'));
}

function renderNotFound(searchName) {
  const reviewsSection = document.getElementById('reviews-section');
  const cardEl = document.getElementById('company-card');
  const dateEl = document.getElementById('latest-review-date');
  const searchTermEl = document.getElementById('search-term');
  const searchLinkEl = document.getElementById('search-link');
  const notFoundEl = document.getElementById('not-found');

  setStatus('none', '✗', `«${searchName}» در تجربه یافت نشد`);

  hide(cardEl);
  hide(reviewsSection);
  hide(dateEl);

  searchTermEl.textContent = searchName;
  searchLinkEl.href = 'https://tajrobe.github.io/search/';
  show(notFoundEl, 'block');
}

function showRatingSummary(reviewCount, averageRating, latestReviewDate) {
  const summaryEl = document.getElementById('rating-summary');
  const skeletonEl = document.getElementById('rating-skeleton');
  const emptyEl = document.getElementById('reviews-empty');
  const countEl = document.getElementById('review-count');
  const averageEl = document.getElementById('average-rating');
  const starsEl = document.getElementById('rating-stars');
  const starsFillEl = document.getElementById('rating-stars-fill');
  const dateEl = document.getElementById('latest-review-date');

  const count = Number(reviewCount) || 0;
  const average = Number(averageRating) || 0;

  hide(skeletonEl);

  if (count <= 0) {
    hide(summaryEl);
    show(emptyEl, 'block');
    return;
  }

  hide(emptyEl);
  show(summaryEl, 'grid');

  countEl.textContent = toPersianDigits(count.toLocaleString('en-US'));
  averageEl.textContent = toPersianDigits(average.toFixed(1));

  // Fill the stars up to the average rating (supports decimals)
  const percentage = (Math.min(Math.max(average, 0), 5) / 5) * 100;
  starsFillEl.style.width = `${percentage}%`;
  starsEl.setAttribute('aria-label', `میانگین امتیاز ${toPersianDigits(average.toFixed(1))} از ۵`);

  // Date of the latest review, under the review count
  const dateText = formatReviewDate(latestReviewDate);
  dateEl.textContent = dateText ? `آخرین تجربه: ${toPersianDigits(dateText)}` : '';
  dateEl.style.display = dateText ? 'block' : 'none';
}

function renderLinka(result) {
  const sectionEl = document.getElementById('linka-section');
  const skeletonEl = document.getElementById('linka-skeleton');
  const errorEl = document.getElementById('linka-error');

  hide(skeletonEl);
  hide(errorEl);

  if (result && result.success && Array.isArray(result.companies) && result.companies.length > 0) {
    showLinkaResults(result.companies, currentSearchName);
    show(sectionEl, 'block');
  } else if (result && !result.success) {
    show(errorEl, 'block');
    show(sectionEl, 'block');
  } else {
    hide(sectionEl);
  }
}

function renderLinkaError() {
  hide(document.getElementById('linka-skeleton'));
  show(document.getElementById('linka-error'), 'block');
  show(document.getElementById('linka-section'), 'block');
}

function renderDaneshBonyan(result) {
  const sectionEl = document.getElementById('danesh-bonyan-section');
  const skeletonEl = document.getElementById('danesh-skeleton');
  const errorEl = document.getElementById('danesh-error');

  hide(skeletonEl);
  hide(errorEl);

  if (result && result.success && Array.isArray(result.companies) && result.companies.length > 0) {
    showDaneshBonyanResults(result.companies, currentSearchName);
    show(sectionEl, 'block');
  } else if (result && !result.success) {
    show(errorEl, 'block');
    show(sectionEl, 'block');
  } else {
    hide(sectionEl);
  }
}

function renderDaneshBonyanError() {
  hide(document.getElementById('danesh-skeleton'));
  show(document.getElementById('danesh-error'), 'block');
  show(document.getElementById('danesh-bonyan-section'), 'block');
}

function showError(message) {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const errorMessageEl = document.getElementById('error-message');
  const resultEl = document.getElementById('result');

  hide(loadingEl);
  hide(resultEl);
  errorMessageEl.textContent = message || 'خطایی رخ داد';
  show(errorEl, 'block');
}

function showNotCompany() {
  const loadingEl = document.getElementById('loading');
  const notCompanyEl = document.getElementById('not-company');

  hide(loadingEl);
  show(notCompanyEl, 'block');
}

// ---------------------------------------------------------------------------
// Messaging (results are cached per tab by the background worker)
// ---------------------------------------------------------------------------

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function getCompanyInfo(tabId, pageUrl) {
  return sendMessage({ type: 'GET_COMPANY', tabId: tabId, pageUrl: pageUrl });
}

async function searchCompany(companyName, tabId, pageUrl) {
  return sendMessage({
    type: 'SEARCH_COMPANY',
    companyName: companyName,
    tabId: tabId,
    pageUrl: pageUrl
  });
}

async function searchLinkaAPI(companyName, tabId, pageUrl) {
  return sendMessage({
    type: 'SEARCH_LINKA',
    companyName: companyName,
    tabId: tabId,
    pageUrl: pageUrl
  });
}

async function searchDaneshBonyanAPI(companyName, tabId, pageUrl) {
  return sendMessage({
    type: 'SEARCH_DANESH_BONYAN',
    companyName: companyName,
    tabId: tabId,
    pageUrl: pageUrl
  });
}

// ---------------------------------------------------------------------------
// Sections: Linka.ir and Danesh Bonyan results
// ---------------------------------------------------------------------------

function showLinkaResults(companies, searchTerm) {
  const linkaSection = document.getElementById('linka-section');
  const linkaList = document.getElementById('linka-list');

  if (!companies || companies.length === 0) {
    hide(linkaSection);
    return;
  }

  linkaList.innerHTML = '';

  companies.forEach(company => {
    const card = document.createElement('div');
    card.className = 'linka-card';

    const logo = document.createElement('img');
    logo.className = 'linka-logo';
    logo.src = company.logoUrl || 'https://placehold.co/40?text=logo';
    logo.alt = company.standardName;
    logo.onerror = function() {
      this.src = 'https://placehold.co/40?text=logo';
    };

    const info = document.createElement('div');
    info.className = 'linka-info';

    const name = document.createElement('div');
    name.className = 'linka-name';
    name.textContent = company.standardName;

    const nationalId = document.createElement('div');
    nationalId.className = 'linka-national-id';
    nationalId.textContent = `شناسه ملی: ${toPersianDigits(company.nationalId)}`;

    info.appendChild(name);
    info.appendChild(nationalId);

    // Check for exact match with search term
    const isExactMatch = searchTerm &&
      company.standardName.trim().toLowerCase() === searchTerm.trim().toLowerCase();

    if (isExactMatch) {
      const badge = document.createElement('div');
      badge.className = 'linka-badge';
      badge.textContent = 'مشابه اسمی ٪۱۰۰ ✅';
      info.appendChild(badge);
    }

    const link = document.createElement('a');
    link.className = 'linka-link';
    link.href = company.pageUrl;
    link.target = '_blank';
    link.textContent = 'اطلاعات بیشتر';

    card.appendChild(logo);
    card.appendChild(info);
    card.appendChild(link);

    linkaList.appendChild(card);
  });

  show(linkaSection, 'block');
}

function showDaneshBonyanResults(companies, searchTerm) {
  const daneshBonyanSection = document.getElementById('danesh-bonyan-section');
  const daneshBonyanList = document.getElementById('danesh-bonyan-list');

  if (!companies || companies.length === 0) {
    hide(daneshBonyanSection);
    return;
  }

  daneshBonyanList.innerHTML = '';

  companies.forEach(company => {
    const card = document.createElement('div');
    card.className = 'danesh-bonyan-card';

    // Calculate name similarity
    const similarity = calculateNameSimilarity(searchTerm, company.coName);
    const isExactMatch = searchTerm &&
      company.coName.trim().toLowerCase() === searchTerm.trim().toLowerCase();

    // Company name header
    const header = document.createElement('div');
    header.className = 'danesh-bonyan-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'danesh-bonyan-name';
    nameEl.textContent = company.coName;

    const matchBadge = document.createElement('div');
    matchBadge.className = 'danesh-bonyan-match-badge';
    if (isExactMatch) {
      matchBadge.classList.add('exact-match');
      matchBadge.textContent = 'مطابقت ٪۱۰۰ ✅';
    } else {
      matchBadge.classList.add('partial-match');
      matchBadge.textContent = `مطابقت ٪${toPersianDigits(similarity)}`;
    }

    header.appendChild(nameEl);
    header.appendChild(matchBadge);

    // Info grid
    const infoGrid = document.createElement('div');
    infoGrid.className = 'danesh-bonyan-info-grid';

    // Knowledge-based status
    const statusItem = createInfoItem('وضعیت', company.coStateTitle);
    infoGrid.appendChild(statusItem);

    // National ID
    const nationalIdItem = createInfoItem('شناسه ملی', company.nationalId);
    infoGrid.appendChild(nationalIdItem);

    // Province
    const provinceItem = createInfoItem('استان', company.provinceTitle);
    infoGrid.appendChild(provinceItem);

    // Technology Zone
    const techItem = createInfoItem('حوزه فناوری', company.technologyZoneTypeTitle);
    infoGrid.appendChild(techItem);

    // Confirmation Date
    const dateItem = createInfoItem('تاریخ تایید', company.confirmDate);
    infoGrid.appendChild(dateItem);

    // Phone number - only show for exact match
    if (isExactMatch && company.officePhoneNumber) {
      const phoneItem = createInfoItem('شماره تماس', company.officePhoneNumber);
      infoGrid.appendChild(phoneItem);
    }

    card.appendChild(header);
    card.appendChild(infoGrid);
    daneshBonyanList.appendChild(card);
  });

  show(daneshBonyanSection, 'block');
}

function createInfoItem(label, value) {
  const item = document.createElement('div');
  item.className = 'danesh-bonyan-info-item';

  const labelEl = document.createElement('span');
  labelEl.className = 'danesh-bonyan-label';
  labelEl.textContent = label + ':';

  const valueEl = document.createElement('span');
  valueEl.className = 'danesh-bonyan-value';
  valueEl.textContent = value ? toPersianDigits(value) : '-';

  item.appendChild(labelEl);
  item.appendChild(valueEl);

  return item;
}

function calculateNameSimilarity(searchTerm, companyName) {
  if (!searchTerm || !companyName) return 0;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const normalizedCompany = companyName.trim().toLowerCase();

  // Exact match
  if (normalizedSearch === normalizedCompany) return 100;

  // Check if one contains the other
  if (normalizedCompany.includes(normalizedSearch)) {
    return Math.round((normalizedSearch.length / normalizedCompany.length) * 100);
  }
  if (normalizedSearch.includes(normalizedCompany)) {
    return Math.round((normalizedCompany.length / normalizedSearch.length) * 100);
  }

  // Calculate word overlap
  const searchWords = normalizedSearch.split(/\s+/);
  const companyWords = normalizedCompany.split(/\s+/);

  let matchedWords = 0;
  searchWords.forEach(word => {
    if (companyWords.some(cw => cw.includes(word) || word.includes(cw))) {
      matchedWords++;
    }
  });

  if (searchWords.length > 0) {
    return Math.round((matchedWords / searchWords.length) * 100);
  }

  return 0;
}
