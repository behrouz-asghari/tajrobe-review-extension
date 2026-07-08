# Company Review Finder - Chrome Extension

A Chrome extension that displays company reviews and registration information when browsing job listings on [JobVision](https://jobvision.ir) and [Jobinja](https://jobinja.ir).

## Features

- **Auto-detect company pages** on JobVision and Jobinja
- **Fetch work experience reviews** from [Tajrobe](https://tajrobe.github.io)
- **Display company registration info** from [Linka.ir](https://linka.ir) API
- **Exact name matching badge** - Shows ✅ when company names match exactly
- **Persian date conversion** - Displays dates in Shamsi (Jalali) calendar
- **RTL support** - Full Persian/Farsi interface
- **Badge indicators** - Shows checkmark (✓) or cross (✗) on extension icon

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `company-review-extension` folder
6. The extension icon will appear in your toolbar

## Usage

1. Navigate to a company page on JobVision or Jobinja:
   - **JobVision**: `https://jobvision.ir/companies/{id}/{company-name}`
   - **Jobinja**: `https://jobinja.ir/companies/{company-slug}`

2. Click the extension icon in your toolbar

3. View the information:
   - Company info from Tajrobe
   - Work experience reviews with ratings
   - Company registration details from Linka.ir

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

### API Endpoints

- **Tajrobe**: `https://tajrobe.github.io/assets/search.json`
- **Linka**: `https://api.linka.ir/Api/V1/Site/SuggestionSearch?search={name}&typeId=2`

## Badge Indicators

| Badge | Meaning |
|-------|---------|
| ✓ (Green) | Company found in Tajrobe database |
| ✗ (Red) | Company not found in Tajrobe database |
| (Empty) | Not on a company page |

## Permissions

- `activeTab` - Access current tab
- `tabs` - Monitor tab navigation
- `storage` - Cache company data
- Host permissions for Tajrobe, JobVision, Jobinja, and Linka.ir APIs

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
- [JobVision](https://jobvision.ir) - Job listing platform
- [Jobinja](https://jobinja.ir) - Job listing platform
