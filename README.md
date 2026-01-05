# Zen Reader JP

A minimalist Japanese EPUB reader with integrated translation and note-taking.

## Features

- **EPUB Reader** — Clean, distraction-free reading with customizable fonts and text width
- **Reading Progress** — Automatically saves and restores your position in each book
- **Paragraph Translation** — Hover to reveal translation button, powered by OpenAI gpt-5.2
- **Personal Notes** — Add notes to any paragraph, saved locally
- **Offline Storage** — All data stored in browser (IndexedDB)

## Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Add a book** — Drag and drop an EPUB file onto the home page
2. **Configure API key** — Click the settings icon and add your [OpenAI API key](https://platform.openai.com/api-keys)
3. **Read** — Open a book from your library
4. **Translate** — Hover left of a paragraph → click the translate icon
5. **Take notes** — Hover right of a paragraph → click the pencil icon

## Settings

- **Font** — Noto Serif JP or Shippori Mincho
- **Text Width** — Narrow (600px), Medium (768px), or Wide (960px)
- **OpenAI API Key** — Required for translation (uses gpt-5.2)

## Tech Stack

Next.js 16 · React 19 · Tailwind CSS 4 · Dexie (IndexedDB) · epub.js

## License

MIT
