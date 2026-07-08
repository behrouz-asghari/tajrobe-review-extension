// Content script - runs on jobvision.ir and jobinja.ir company pages

(function() {
  'use strict';

  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  let companyName = null;
  let source = null;

  // JobVision extraction
  if (hostname.includes('jobvision.ir')) {
    // Method 1: Try HTML extraction
    const labelElement = document.querySelector('label.heading-04.jvt-text-black');
    if (labelElement) {
      companyName = labelElement.textContent.trim();
      source = 'jobvision-html';
    }
    
    // Method 2: URL extraction
    if (!companyName) {
      const urlParts = pathname.split('/').filter(Boolean);
      if (urlParts.length >= 3 && urlParts[0] === 'companies') {
        const lastPart = decodeURIComponent(urlParts[urlParts.length - 1]);
        // Remove "استخدام-" prefix
        companyName = lastPart.replace(/^استخدام-/, '');
        source = 'jobvision-url';
      }
    }
  }
  
  // Jobinja extraction
  else if (hostname.includes('jobinja.ir')) {
    // Method 1: Try HTML extraction
    const nameElement = document.querySelector('h2.c-companyHeader__name');
    if (nameElement) {
      const fullText = nameElement.textContent.trim();
      // Extract Persian name (before "|")
      const parts = fullText.split('|');
      if (parts.length > 0) {
        companyName = parts[0].trim();
        source = 'jobinja-html';
      }
    }
    
    // Method 2: URL extraction
    if (!companyName) {
      const urlParts = pathname.split('/').filter(Boolean);
      if (urlParts.length >= 2 && urlParts[0] === 'companies') {
        companyName = decodeURIComponent(urlParts[1]);
        source = 'jobinja-url';
      }
    }
  }

  // Send company name to background script
  if (companyName) {
    chrome.runtime.sendMessage({
      type: 'COMPANY_FOUND',
      companyName: companyName,
      source: source,
      pageUrl: window.location.href
    });
  } else {
    // Clear badge when not on a company page
    chrome.runtime.sendMessage({
      type: 'CLEAR_BADGE'
    });
  }
})();
