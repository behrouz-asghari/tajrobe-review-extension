// Content script - runs on jobvision.ir and jobinja.ir company pages
// Also watches for in-page (SPA) navigation, which does not reload the page.

(function() {
  'use strict';

  const CHECK_INTERVAL = 1500;

  let lastSentName = null;
  let lastSentUrl = null;

  function extractFromDom(hostname) {
    if (hostname.includes('jobvision.ir')) {
      const labelElement = document.querySelector('label.heading-04.jvt-text-black');
      if (labelElement) {
        return { name: labelElement.textContent.trim(), source: 'jobvision-html' };
      }
      return null;
    }

    if (hostname.includes('jobinja.ir')) {
      const nameElement = document.querySelector('h2.c-companyHeader__name');
      if (nameElement) {
        const fullText = nameElement.textContent.trim();
        // Extract Persian name (before "|")
        const parts = fullText.split('|');
        if (parts.length > 0 && parts[0].trim()) {
          return { name: parts[0].trim(), source: 'jobinja-html' };
        }
      }
      return null;
    }

    return null;
  }

  function extractFromUrl(hostname, pathname) {
    const urlParts = pathname.split('/').filter(Boolean);

    if (hostname.includes('jobvision.ir')) {
      if (urlParts.length >= 3 && urlParts[0] === 'companies') {
        const lastPart = decodeURIComponent(urlParts[urlParts.length - 1]);
        // Remove "استخدام-" prefix
        return { name: lastPart.replace(/^استخدام-/, ''), source: 'jobvision-url' };
      }
      return null;
    }

    if (hostname.includes('jobinja.ir')) {
      if (urlParts.length >= 2 && urlParts[0] === 'companies') {
        return { name: decodeURIComponent(urlParts[1]), source: 'jobinja-url' };
      }
      return null;
    }

    return null;
  }

  // preferUrl is used right after an in-page navigation, when the DOM may still
  // show the previous company name
  function detectCompany(preferUrl) {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    if (preferUrl) {
      const fromUrl = extractFromUrl(hostname, pathname);
      if (fromUrl) return fromUrl;
    }

    return extractFromDom(hostname) || extractFromUrl(hostname, pathname);
  }

  function sendCompanyIfChanged() {
    const pageUrl = window.location.href;
    const urlChanged = pageUrl !== lastSentUrl;
    const company = detectCompany(urlChanged);

    if (!company || !company.name) {
      if (lastSentName !== null || lastSentUrl !== null) {
        lastSentName = null;
        lastSentUrl = null;
        chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' });
      }
      return;
    }

    if (company.name === lastSentName && pageUrl === lastSentUrl) return;

    lastSentName = company.name;
    lastSentUrl = pageUrl;

    chrome.runtime.sendMessage({
      type: 'COMPANY_FOUND',
      companyName: company.name,
      source: company.source,
      pageUrl: pageUrl
    });
  }

  // Wait for client-rendered content before the first detection
  function start() {
    sendCompanyIfChanged();
    setInterval(sendCompanyIfChanged, CHECK_INTERVAL);
    window.addEventListener('popstate', sendCompanyIfChanged);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
