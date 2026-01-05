<p align="center">
  <img src="public/landing_zen.svg" width="80" alt="ZenRead JP">
</p>

<h1 align="center">ZenRead JP</h1>

<p align="center">
  A minimalist Japanese EPUB reader for immersive learning.
</p>

<p align="center">
  <a href="https://zen-read-jp.vercel.app">zen-read-jp.vercel.app</a>
</p>

---

## Philosophy

Reading is one of the best ways to improve language comprehension — yet it can be hard to stay focused when every sentence feels like a puzzle. This minimalist tool streamlines Japanese book reading with quick comprehension assistance when needed, so you don't lose the narrative thread and stay engaged with the text.

Follow these principles to get the most out of it:

**Translate to verify, not to cheat.** Read a paragraph, form your understanding, then check the translation to confirm you got it right. This active process builds real comprehension.

**Leave notes for your future self.** Mark tricky grammar, save useful vocabulary, or jot down questions for your next langauge lesson. Your annotations stay with the text, ready when you return.

---

## Features

- **Clean Reading** — Distraction-free interface with customizable fonts, sizes, and themes
- **Paragraph Translation** — On-demand AI translation (OpenAI) to verify your understanding. To enable translations, add your [OpenAI API key](https://platform.openai.com/api-keys) in Settings.  
- **Personal Notes** — Annotate any paragraph; notes persist locally
- **Progress Memory** — Automatically saves your position in each book
- **Offline Storage** — Everything stored in your browser

---

## Local Deploy

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000), drop in an EPUB, and start reading.

---

## Recommended

For instant word lookups, pair with the [10ten Japanese Reader](https://github.com/birchill/10ten-ja-reader) browser extension.

---

## Tech

Next.js · React · Tailwind CSS · Dexie (IndexedDB) · epub.js · OpenAI

---

<p align="center">
  <sub>MIT License</sub>
</p>
