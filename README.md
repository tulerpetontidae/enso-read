<p align="center">
  <img src="src/app/landing_zen.svg" width="80" alt="ZenRead JP">
</p>

<h1 align="center">ZenRead JP</h1>

<p align="center">
  A minimalist Japanese EPUB reader for immersive learning.
</p>

<p align="center">
  <a href="https://zen-read-jp.vercel.app">zen-read-jp.vercel.app</a>
</p>




## Philosophy

Reading is one of the best ways to improve language comprehension — yet it can be hard to stay focused when every sentence feels like a puzzle. This minimalist tool streamlines Japanese book reading with quick comprehension assistance when needed, so you don't lose the narrative thread and stay engaged with the text.

Follow these principles to get the most out of it:

***Translate to verify, not to cheat.***
Read a paragraph first and form your own interpretation. Only then consult the translation to confirm or correct your understanding. This order enforces active reading and prevents dependence.

***Leave notes for your future self.***
Mark difficult grammar, save useful vocabulary, and record questions for your next language lesson. Your annotations persist with the text and compound over time.




## Features

- **Clean Reading** — Distraction-free interface with customizable fonts, sizes, and themes
- **Paragraph Translation** — On-demand AI translation (OpenAI) to verify your understanding. To enable translations, add your [OpenAI API key](https://platform.openai.com/api-keys) in Settings.  
- **Personal Notes** — Annotate any paragraph; notes persist locally
- **Progress Memory** — Automatically saves your position in each book
- **Offline Storage** — Everything stored in your browser



## Recommended

For instant word lookups, pair with the [10ten Japanese Reader](https://github.com/birchill/10ten-ja-reader) browser extension.




## Local Deploy

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000), drop in an EPUB, and start reading.




## Tech

Next.js · React · Tailwind CSS · Dexie (IndexedDB) · epub.js · OpenAI



<p align="center">
  <sub>MIT License</sub>
</p>
