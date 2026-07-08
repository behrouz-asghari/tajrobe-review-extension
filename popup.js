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
        showLinkaResults(linkaResult.companies);
      }
    } else {
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

function showLinkaResults(companies) {
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
