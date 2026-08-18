// Background service worker - handles search on tajrobe.github.io

let cachedData = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Helper function to check if URL is a company page
function isCompanyPage(url) {
  if (!url) return false;
  return /jobvision\.ir\/companies\//.test(url) ||
         /jobinja\.ir\/companies\//.test(url);
}
// background.js

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

// Listen for tab updates to clear badge when leaving company pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (!isCompanyPage(tab.url)) {
      // Not a company page - clear badge
      chrome.action.setBadgeText({ text: '', tabId: tabId });
      chrome.storage.local.remove('lastCompany');
    }
  }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !isCompanyPage(tab.url)) {
      // Not a company page - clear badge
      chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
      chrome.storage.local.remove('lastCompany');
    }
  } catch (error) {
    // Tab might not be accessible
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEARCH_COMPANY') {
    searchCompany(message.companyName)
      .then(result => sendResponse(result));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'SEARCH_LINKA') {
    searchLinkaAPI(message.companyName)
      .then(result => sendResponse(result));
    return true;
  }

  if (message.type === 'SEARCH_DANESH_BONYAN') {
    searchDaneshBonyanAPI(message.companyName)
      .then(result => sendResponse(result));
    return true;
  }

  if (message.type === 'COMPANY_FOUND') {
    // Store the company info for popup to retrieve
    chrome.storage.local.set({
      lastCompany: {
        name: message.companyName,
        source: message.source,
        url: message.pageUrl,
        timestamp: Date.now()
      }
    });

    // Update badge
    updateBadge(message.companyName);
  }

  if (message.type === 'CLEAR_BADGE') {
    // Clear badge when not on a company page
    chrome.action.setBadgeText({ text: '' });
    // Clear stored company info
    chrome.storage.local.remove('lastCompany');
  }
});

async function fetchSearchData() {
  // Check cache
  if (cachedData && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
    return cachedData;
  }

  try {
    const response = await fetch('https://tajrobe.github.io/assets/search.json');
    if (!response.ok) throw new Error('Failed to fetch data');

    cachedData = await response.json();
    cacheTimestamp = Date.now();
    return cachedData;
  } catch (error) {
    console.error('Error fetching tajrobe data:', error);
    if (cachedData) return cachedData;
    throw error;
  }
}

async function fetchCompanyPage(pageUrl) {
  try {
    const response = await fetch(pageUrl);
    if (!response.ok) throw new Error('Failed to fetch company page');

    const html = await response.text();
    return parseReviewsFromHTML(html);
  } catch (error) {
    console.error('Error fetching company page:', error);
    return [];
  }
}

function parseReviewsFromHTML(html) {
  const reviews = [];

  // New Tailwind CSS structure - reviews are in sections with rounded-2xl class
  // Each review section has: <section class="bg-[var(--card)] border border-[var(--line)] rounded-2xl...">
  const sectionRegex = /<section\s+class="[^"]*rounded-2xl[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionContent = sectionMatch[1];

    // Skip company intro section (contains "معرفی شرکت")
    if (sectionContent.includes('معرفی شرکت')) continue;

    // Skip review suggestion section
    if (sectionContent.includes('review-suggest-section')) continue;

    const review = extractReviewFromSection(sectionContent);
    if (review && review.text) {
      reviews.push(review);
    }
  }

  return reviews.slice(0, 10); // Limit to 10 reviews
}

function extractReviewFromSection(sectionContent) {
  // Extract job title from: <h4 class="font-bold text-[0.98rem] mb-1">...</h4>
  const titleMatch = sectionContent.match(/<h4\s+class="font-bold[^"]*"[^>]*>([\s\S]*?)<\/h4>/i);
  const jobTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

  // Extract date from: <time class="..." datetime="...">...</time>
  const dateMatch = sectionContent.match(/<time\s+class="[^"]*"[^>]*datetime="([^"]*)"[^>]*>([\s\S]*?)<\/time>/i);
  const dateText = dateMatch ? dateMatch[2].trim() : '';

  // Extract rating from: <span class="absolute..." style="width: XX%">★★★★★</span>
  // XX% of 5 stars = rating
  let rating = 0;
  const ratingMatch = sectionContent.match(/<span\s+class="absolute[^"]*"[^>]*style="width:\s*([\d.]+)%"[^>]*>/i);
  if (ratingMatch) {
    const percentage = parseFloat(ratingMatch[1]);
    rating = Math.round((percentage / 100) * 5);
  }

  // Also try to get numeric rating from: <span class="text-[0.72rem]...">X</span>
  const numericRatingMatch = sectionContent.match(/<span\s+class="text-\[0\.72rem\][^"]*">([\d.]+)<\/span>/i);
  if (numericRatingMatch) {
    const numRating = parseFloat(numericRatingMatch[1]);
    if (!isNaN(numRating) && numRating > 0) {
      rating = numRating;
    }
  }

  // Extract review text from: <p class="leading-[1.9]...">...</p>
  const textMatch = sectionContent.match(/<p\s+class="leading-\[1\.9\][^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  let text = '';
  let pros = '';
  let cons = '';

  if (textMatch) {
    text = textMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  // Extract pros (accent-tint chips) and cons (chip chips)
  // Pros: <span class="...bg-[var(--accent-tint)]...">...</span>
  // Cons: <span class="...bg-[var(--chip)]...">...</span>
  const prosRegex = /<span\s+class="[^"]*bg-\[var\(--accent-tint\)\][^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let prosMatch;
  const prosList = [];
  while ((prosMatch = prosRegex.exec(sectionContent)) !== null) {
    const item = prosMatch[1].trim();
    if (item) prosList.push(item);
  }
  if (prosList.length > 0) {
    pros = prosList.join('، ');
  }

  const consRegex = /<span\s+class="[^"]*bg-\[var\(--chip\)\][^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let consMatch;
  const consList = [];
  while ((consMatch = consRegex.exec(sectionContent)) !== null) {
    const item = consMatch[1].trim();
    if (item) consList.push(item);
  }
  if (consList.length > 0) {
    cons = consList.join('، ');
  }

  // Clean up text
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();

  // Limit text length
  if (text.length > 500) {
    text = text.substring(0, 500) + '...';
  }

  return {
    text: text,
    rating: rating,
    date: dateText,
    jobTitle: jobTitle,
    pros: pros,
    cons: cons
  };
}

async function searchCompany(searchTerm) {
  try {
    const companies = await fetchSearchData();
    const result = findCompany(searchTerm, companies);

    if (result) {
      const companyUrl = `https://tajrobe.github.io${result.url}`;

      // Fetch reviews from company page
      const reviews = await fetchCompanyPage(companyUrl);

      return {
        found: true,
        company: {
          title: result.title,
          titleEn: result.title_en,
          city: result.city?.trim(),
          url: companyUrl,
          logo: result.logo,
          cover: result.cover,
          reviews: reviews
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

function findCompany(searchTerm, companies) {
  const normalizedSearch = searchTerm.toLowerCase().trim();

  // 1. Exact match on title
  let match = companies.find(c =>
    c.title.toLowerCase() === normalizedSearch
  );
  if (match) return match;

  // 2. Title starts with search term
  match = companies.find(c =>
    c.title.toLowerCase().startsWith(normalizedSearch)
  );
  if (match) return match;

  // 3. Search term contains title (for partial matches)
  match = companies.find(c =>
    normalizedSearch.includes(c.title.toLowerCase()) &&
    c.title.length > 2
  );
  if (match) return match;

  // 4. Partial match on title
  match = companies.find(c =>
    c.title.toLowerCase().includes(normalizedSearch) ||
    normalizedSearch.includes(c.title.toLowerCase())
  );
  if (match) return match;

  // 5. Match on English name (title_en)
  match = companies.find(c =>
    c.title_en && c.title_en.toLowerCase().includes(normalizedSearch)
  );
  if (match) return match;

  // 6. Search term words match title words
  const searchWords = normalizedSearch.split(/\s+/);
  match = companies.find(c => {
    const titleLower = c.title.toLowerCase();
    return searchWords.every(word => titleLower.includes(word));
  });

  return match || null;
}

async function updateBadge(companyName) {
  try {
    const result = await searchCompany(companyName);
    if (result.found) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    } else {
      chrome.action.setBadgeText({ text: '✗' });
      chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
    }
  } catch (error) {
    chrome.action.setBadgeText({ text: '' });
  }
}

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
