// Popup script - displays company info and reviews from tajrobe.github.io

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

function convertToShamsi(dateStr) {
  if (!dateStr) return '';

  // Try to parse the date string
  // Format: "December 16, 2025" or similar
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return dateStr;

  const gy = dateObj.getFullYear();
  const gm = dateObj.getMonth() + 1;
  const gd = dateObj.getDate();

  const shamsi = gregorianToShamsi(gy, gm, gd);

  // Persian month names
  const monthNames = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];

  return `${shamsi.day} ${monthNames[shamsi.month - 1]} ${shamsi.year}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const notCompanyEl = document.getElementById('not-company');
  const resultEl = document.getElementById('result');
  const notFoundEl = document.getElementById('not-found');

  // Hide all sections initially
  [errorEl, notCompanyEl, resultEl, notFoundEl].forEach(el => {
    el.style.display = 'none';
  });

  try {
    // Get last company from storage
    const data = await chrome.storage.local.get('lastCompany');
    const lastCompany = data.lastCompany;

    if (!lastCompany || !lastCompany.name) {
      showNotCompany();
      return;
    }

    // Check if data is stale (older than 5 minutes)
    if (Date.now() - lastCompany.timestamp > 5 * 60 * 1000) {
      showNotCompany();
      return;
    }

    // Check if we're still on the same page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url !== lastCompany.url) {
      showNotCompany();
      return;
    }

    // Search for the company
    const result = await searchCompany(lastCompany.name);

    if (result.found) {
      showResult(result.company);

      // Also search Linka API for company registration info
      const linkaResult = await searchLinkaAPI(lastCompany.name);
      if (linkaResult.success && linkaResult.companies) {
        showLinkaResults(linkaResult.companies, lastCompany.name);
      }
    }

    // Search Danesh Bonyan API for knowledge-based company info (independent of tajrobe result)
    const daneshBonyanResult = await searchDaneshBonyanAPI(lastCompany.name);
    if (daneshBonyanResult.success && daneshBonyanResult.companies) {
      showDaneshBonyanResults(daneshBonyanResult.companies, lastCompany.name);
    }

    if (!result.found) {
      showNotFound(lastCompany.name);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    loadingEl.style.display = 'none';
  }
});

function showResult(company) {
  const resultEl = document.getElementById('result');
  const nameEl = document.getElementById('company-name');
  const nameEnEl = document.getElementById('company-name-en');
  const cityEl = document.getElementById('company-city');
  const linkEl = document.getElementById('company-link');
  const logoEl = document.getElementById('company-logo');
  const logoImg = document.getElementById('logo-img');
  const reviewsSection = document.getElementById('reviews-section');
  const reviewsList = document.getElementById('reviews-list');

  nameEl.textContent = company.title;
  nameEnEl.textContent = company.titleEn || '';
  cityEl.textContent = company.city || '';
  linkEl.href = company.url;

  if (company.logo) {
    logoImg.src = company.logo;
    logoEl.style.display = 'block';
  } else {
    logoEl.style.display = 'none';
  }

  // Display reviews
  if (company.reviews && company.reviews.length > 0) {
    reviewsList.innerHTML = '';

    company.reviews.forEach((review, index) => {
      const reviewCard = createReviewCard(review, index);
      reviewsList.appendChild(reviewCard);
    });

    reviewsSection.style.display = 'block';
  } else {
    reviewsSection.style.display = 'none';
  }

  resultEl.style.display = 'block';
}

function createReviewCard(review, index) {
  const card = document.createElement('div');
  card.className = 'review-card';

  // Header with job title and date
  const header = document.createElement('div');
  header.className = 'review-header';

  // Job title
  const jobTitleDiv = document.createElement('div');
  jobTitleDiv.className = 'review-job-title';
  jobTitleDiv.textContent = review.jobTitle || '';

  // Date - convert to Shamsi
  const dateSpan = document.createElement('span');
  dateSpan.className = 'review-date';
  dateSpan.textContent = convertToShamsi(review.date);

  header.appendChild(jobTitleDiv);
  header.appendChild(dateSpan);

  // Rating stars
  const ratingDiv = document.createElement('div');
  ratingDiv.className = 'review-rating';

  const ratingValue = typeof review.rating === 'number' ? review.rating : 0;
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = i <= ratingValue ? 'star' : 'star empty';
    star.textContent = '★';
    ratingDiv.appendChild(star);
  }

  // Review text
  const textDiv = document.createElement('div');
  textDiv.className = 'review-text';
  textDiv.textContent = review.text;

  // Read more button (if text is long)
  const readMoreBtn = document.createElement('button');
  readMoreBtn.className = 'read-more';
  readMoreBtn.textContent = 'بیشتر...';
  readMoreBtn.style.display = review.text.length > 150 ? 'block' : 'none';

  readMoreBtn.addEventListener('click', () => {
    textDiv.classList.toggle('expanded');
    readMoreBtn.textContent = textDiv.classList.contains('expanded') ? 'کمتر' : 'بیشتر...';
  });

  // Pros and cons
  const prosDiv = document.createElement('div');
  prosDiv.className = 'review-pros';
  prosDiv.textContent = review.pros;
  prosDiv.style.display = review.pros ? 'block' : 'none';

  const consDiv = document.createElement('div');
  consDiv.className = 'review-cons';
  consDiv.textContent = review.cons;
  consDiv.style.display = review.cons ? 'block' : 'none';

  // Assemble card
  card.appendChild(header);
  card.appendChild(ratingDiv);
  card.appendChild(textDiv);
  card.appendChild(readMoreBtn);
  card.appendChild(prosDiv);
  card.appendChild(consDiv);

  return card;
}

function showNotFound(searchTerm) {
  const notFoundEl = document.getElementById('not-found');
  const searchTermEl = document.getElementById('search-term');
  const searchLinkEl = document.getElementById('search-link');

  searchTermEl.textContent = searchTerm;
  searchLinkEl.href = `https://tajrobe.github.io/search/`;

  notFoundEl.style.display = 'block';
}

function showError(message) {
  const errorEl = document.getElementById('error');
  const errorMessageEl = document.getElementById('error-message');

  errorMessageEl.textContent = message || 'خطایی رخ داد';
  errorEl.style.display = 'block';
}

function showNotCompany() {
  const notCompanyEl = document.getElementById('not-company');
  notCompanyEl.style.display = 'block';
}

async function searchCompany(companyName) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SEARCH_COMPANY', companyName: companyName },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });
}

async function searchLinkaAPI(companyName) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SEARCH_LINKA', companyName: companyName },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });
}

async function searchDaneshBonyanAPI(companyName) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SEARCH_DANESH_BONYAN', companyName: companyName },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });
}

function showLinkaResults(companies, searchTerm) {
  const linkaSection = document.getElementById('linka-section');
  const linkaList = document.getElementById('linka-list');

  if (!companies || companies.length === 0) {
    linkaSection.style.display = 'none';
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
    nationalId.textContent = `شناسه ملی: ${company.nationalId}`;

    info.appendChild(name);
    info.appendChild(nationalId);

    // Check for exact match with search term
    const isExactMatch = searchTerm &&
      company.standardName.trim().toLowerCase() === searchTerm.trim().toLowerCase();

    if (isExactMatch) {
      const badge = document.createElement('div');
      badge.className = 'linka-badge';
      badge.textContent = 'مشابه اسمی %100 ✅';
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

  linkaSection.style.display = 'block';
}

function showDaneshBonyanResults(companies, searchTerm) {
  const daneshBonyanSection = document.getElementById('danesh-bonyan-section');
  const daneshBonyanList = document.getElementById('danesh-bonyan-list');

  if (!companies || companies.length === 0) {
    daneshBonyanSection.style.display = 'none';
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
      matchBadge.textContent = `مطابقت %100 ✅`;
    } else {
      matchBadge.classList.add('partial-match');
      matchBadge.textContent = `مطابقت ${similarity}%`;
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

  daneshBonyanSection.style.display = 'block';
}

function createInfoItem(label, value) {
  const item = document.createElement('div');
  item.className = 'danesh-bonyan-info-item';

  const labelEl = document.createElement('span');
  labelEl.className = 'danesh-bonyan-label';
  labelEl.textContent = label + ':';

  const valueEl = document.createElement('span');
  valueEl.className = 'danesh-bonyan-value';
  valueEl.textContent = value || '-';

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
