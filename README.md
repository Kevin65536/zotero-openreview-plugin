# Zotero OpenReview Plugin

[![zotero target version](https://img.shields.io/badge/Zotero-9-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/download/)

Import papers from OpenReview workshops and venues directly into Zotero.
Tested and confirmed compatible with Zotero 9.

## Features

- **Import from OpenReview**: Import all papers from a workshop or venue with a single click
- **Automatic PDF Download**: Optionally download PDFs for all imported papers
- **Reviews & Comments**: Import reviews, meta-reviews, and comments as Zotero notes
- **Paper Filtering**: Filter to import only accepted papers
- **Duplicate Detection**: Automatically skip papers already in your library
- **Collection Organization**: Create a dedicated collection for each workshop/venue

## Installation

1. Download the latest `.xpi` file from the [Releases](https://github.com/kevin65536/zotero-openreview-plugin/releases) page
2. In Zotero, go to `Tools` → `Add-ons`
3. Click the gear icon and select `Install Add-on From File...`
4. Select the downloaded `.xpi` file

## Usage

### Import from OpenReview

1. Go to `File` → `Import from OpenReview...`
2. Enter the OpenReview venue/workshop URL (e.g., `https://openreview.net/group?id=NeurIPS.cc/2024/Workshop/FITML`)
3. Enter a name for the collection
4. Select your import options:
   - **Download PDFs**: Download PDF attachments for each paper
   - **Import reviews**: Import reviews and comments as notes
   - **Only accepted papers**: Filter to only import accepted papers
   - **Skip duplicates**: Skip papers already in your library
5. Click **Import**

### Supported URL Formats

- Venue pages: `https://openreview.net/group?id=VENUE_ID`
- Workshop pages: `https://openreview.net/group?id=CONFERENCE/YEAR/Workshop/NAME`

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version)
- [Zotero 9](https://www.zotero.org/download/)

### Setup

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm start

# Build for production
npm run build
```

### Project Structure

```
zotero-openreview/
├── addon/                    # Static plugin files
│   ├── content/             # XHTML and CSS
│   ├── locale/              # Localization files (en-US, zh-CN)
│   └── manifest.json        # Plugin manifest
├── src/                     # TypeScript source
│   ├── modules/
│   │   ├── openreviewApi.ts      # OpenReview API service
│   │   ├── openreviewImporter.ts # Main import logic
│   │   ├── zoteroItemCreator.ts  # Create Zotero items
│   │   └── collectionManager.ts  # Collection management
│   ├── hooks.ts             # Plugin lifecycle hooks
│   └── index.ts             # Entry point
└── package.json
```

## API Reference

This plugin uses the [OpenReview API V2](https://api2.openreview.net) to fetch paper data.

## License

AGPL-3.0-or-later

## Acknowledgments

- Built with [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)
- Uses [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
