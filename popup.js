// Popup script - displays company info from tajrobe.github.io

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

  resultEl.style.display = 'block';
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
