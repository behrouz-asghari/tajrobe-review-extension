// Background service worker - handles search on tajrobe.github.io

let cachedData = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEARCH_COMPANY') {
    searchCompany(message.companyName)
      .then(result => sendResponse(result));
    return true; // Keep message channel open for async response
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
    // Return cached data if available, even if stale
    if (cachedData) return cachedData;
    throw error;
  }
}

async function searchCompany(searchTerm) {
  try {
    const companies = await fetchSearchData();
    const result = findCompany(searchTerm, companies);
    
    if (result) {
      return {
        found: true,
        company: {
          title: result.title,
          titleEn: result.title_en,
          city: result.city?.trim(),
          url: `https://tajrobe.github.io${result.url}`,
          logo: result.logo,
          cover: result.cover
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
    c.title.length > 2 // Avoid very short matches
  );
  if (match) return match;
  
  // 4. Partial match on title (title includes search or vice versa)
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
