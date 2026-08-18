
<div align="center">

# Company Review Finder - Chrome Extension

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/develop/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/behrouz-asghari/tajrobe-review-extension/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/behrouz-asghari/tajrobe-review-extension/actions/workflows/ci.yml)
[![CodeQL](https://github.com/behrouz-asghari/tajrobe-review-extension/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/behrouz-asghari/tajrobe-review-extension/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/behrouz-asghari/tajrobe-review-extension/badge)](https://securityscorecards.dev/viewer/?uri=github.com/behrouz-asghari/tajrobe-review-extension)


A Chrome extension that displays company reviews and registration information when browsing job listings on [JobVision](https://jobvision.ir) and [Jobinja](https://jobinja.ir).

<img width="1323" height="992" alt="Screenshot 2026-07-09 012914" src="https://github.com/user-attachments/assets/6b36ea65-7cdc-4760-9994-9ec2a3d437f3" />
<img width="1318" height="938" alt="Screenshot 2026-07-17 105335" src="https://github.com/user-attachments/assets/044ae9a6-796c-4f63-8f8d-5b0c75f7c888" />
<img width="1276" height="944" alt="Screenshot 2026-08-18 144233" src="https://github.com/user-attachments/assets/c3c8a098-6de3-4923-9c3b-57e0c9ca435f" />

</div>

## Features

- **Auto-detect company pages** on JobVision and Jobinja
- **Fetch work experience reviews** from [Tajrobe](https://tajrobe.github.io)
- **Display company registration info** from [Linka.ir](https://linka.ir) API
- **Knowledge-based company detection** - Check if company is registered in [Danesh Bonyan](https://daneshbonyan.ir) system
- **Name similarity matching** - Shows percentage match between searched name and results
- **Exact name matching badge** - Shows ✅ when company names match exactly
- **Persian date conversion** - Displays dates in Shamsi (Jalali) calendar
- **RTL support** - Full Persian/Farsi interface
- **Badge indicators** - Shows checkmark (✓) or cross (✗) on extension icon

## Community Recognition
This extension is officially featured on the [Tajrobe project page](https://tajrobe.github.io/browser-extension/) as a recommended utility. It is recognized as a community-driven tool that integrates authentic employee reviews directly into job search platforms to assist developers and professionals in making informed career decisions.

<img width="1920" height="1108" alt="screencapture-tajrobe-github-io-browser-extension-2026-07-14-21_23_20" src="https://github.com/user-attachments/assets/e654a039-49ff-437f-8e9d-f96b56ab0740" />

## Installation

### Option 1: From GitHub Releases (Recommended)

1. Go to the [Releases](../../releases) page
2. Download the latest `vX.X.X.zip`
3. Extract the zip file to a folder on your computer
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable **Developer mode** (toggle in top-right corner)
6. Click **Load unpacked**
7. Select the extracted folder
8. The extension icon will appear in your toolbar

### Option 2: From Source (Developer)

1. Clone this repository:
   ```
   git clone https://github.com/behrouz-asghari/tajrobe-review-extension.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the cloned repository folder

## Usage

1. Navigate to a company page on JobVision or Jobinja:
   - **JobVision**: `https://jobvision.ir/companies/{id}/{company-name}`
   - **Jobinja**: `https://jobinja.ir/companies/{company-slug}`

2. Click the extension icon in your toolbar

3. View the information:
   - Company info from Tajrobe
   - Work experience reviews with ratings
   - Company registration details from Linka.ir
   - Knowledge-based company status from Danesh Bonyan

## How It Works

### Company Name Extraction

| Platform | Method |
|----------|--------|
| **JobVision** | HTML element `<label class="heading-04 jvt-text-black">` or URL (removes "استخدام-" prefix) |
| **Jobinja** | HTML element `<h2 class="c-companyHeader__name">` (Persian name before "|") or URL slug |

### Data Sources

| Source | Data Type |
|--------|-----------|
| [Tajrobe](https://tajrobe.github.io) | Work experience reviews, company ratings |
| [Linka.ir](https://linka.ir) | Company registration info, national ID, logo |
| [Danesh Bonyan](https://daneshbonyan.ir) | Knowledge-based company status, technology zone, approval date |

### API Endpoints

- **Tajrobe**: `https://tajrobe.github.io/assets/search.json`
- **Linka**: `https://api.linka.ir/Api/V1/Site/SuggestionSearch?search={name}&typeId=2`
- **Danesh Bonyan**: `https://api.daneshbonyan.ir/kb-co-pub-info/list` (POST with `{term: companyName}`)

## Badge Indicators

| Badge | Meaning |
|-------|---------|
| ✓ (Green) | Company found in Tajrobe database |
| ✗ (Red) | Company not found in Tajrobe database |
| (Empty) | Not on a company page or left company page |

> **Note:** The badge automatically clears when you navigate away from a company page or switch to a different tab.

## Danesh Bonyan Integration

This extension integrates with the [Danesh Bonyan](https://daneshbonyan.ir) API to check if a company is registered as a knowledge-based company in Iran.

### Displayed Information

| Field | Description |
|-------|-------------|
| **Company Name** | Official name of the company |
| **Match Percentage** | How similar the searched name is to the result (e.g., 85%) |
| **Status** | Knowledge-based status: فناور (Technology), نوآور (Innovative), نوپا (Startup) |
| **National ID** | Company's national identification number |
| **Province** | Company's location province |
| **Technology Zone** | Assigned technology zone category |
| **Approval Date** | Date of approval in Shamsi calendar |
| **Phone Number** | Office phone (only shown for exact name matches) |

### How It Works

1. When you open the extension on a company page, it automatically searches the Danesh Bonyan database
2. Results are displayed below the Linka.ir section
3. Each result shows a match percentage badge:
   - 🟢 **Exact Match (100%)** - Green badge with ✅
   - 🟡 **Partial Match (<100%)** - Yellow badge with percentage
4. Phone numbers are only displayed for companies with exact name matches

> **Note:** The Danesh Bonyan search runs independently of the Tajrobe search, so you can see knowledge-based status even if the company isn't found in Tajrobe's database.

## Permissions

The extension uses the minimum permissions required for company detection, API access, and UI updates.

- `activeTab` - Access the currently open company page
- `tabs` - Detect tab changes and clear/update badge state
- `storage` - Cache company data and temporary results
- `host_permissions` - Access external data sources:
  - `https://tajrobe.github.io/*`
  - `https://jobvision.ir/*`
  - `https://jobinja.ir/*`
  - `https://api.linka.ir/*`
  - `https://api.daneshbonyan.ir/*`

### Why background requests are used for Danesh Bonyan

The Danesh Bonyan public API is protected by CORS and only allows browser requests from its own allowed origin(s), such as:

- `https://pub.daneshbonyan.ir`

Because of this, direct `fetch()` calls from extension UI contexts such as the popup, side panel, or content scripts may be blocked by the browser with a CORS error.

To avoid this, Danesh Bonyan API requests are executed from the extension's background service worker, which is the recommended Chrome Extension MV3 pattern for cross-origin requests.


## Security & Trust

This extension is open source and available for public review. It requests only the minimum Chrome permissions needed to work and uses automated checks such as GitHub Actions and CodeQL to improve transparency and trust.

## Privacy

This extension does not intentionally collect passwords, keystrokes, or unnecessary personal data. Stored data is limited to local settings and cache.

## Development

### Project Structure

```
company-review-extension/
├── manifest.json      # Extension configuration
├── background.js      # Service worker for API calls
├── content.js         # Content script for name extraction
├── popup.html         # Popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── icons/             # Extension icons
└── README.md          # This file
```

### Building

No build step required. This is a vanilla JavaScript Chrome extension.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tajrobe](https://tajrobe.github.io) - Work experience sharing platform
- [Linka.ir](https://linka.ir) - Iranian company registration database
- [Danesh Bonyan](https://daneshbonyan.ir) - Knowledge-based companies database
- [JobVision](https://jobvision.ir) - Job listing platform
- [Jobinja](https://jobinja.ir) - Job listing platform
