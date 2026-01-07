<p align="center">
  <img src="src/app/landing_zen.svg" width="80" alt="EnsoRead">
</p>

<h1 align="center">EnsōRead</h1>

<p align="center">
  A minimalist multi-language EPUB reader for immersive learning.
</p>

<p align="center">
  <a href="https://enso-read.vercel.app">enso-read.vercel.app</a>
</p>



## Philosophy

EnsoRead supports reading in multiple languages. The core idea is simple: reading is one of the best ways to improve language comprehension — yet it can be hard to stay focused when every sentence feels like a puzzle.

This minimalist tool enables **parallel reading, paragraph by paragraph** — see your target language text alongside instant translations when needed, without losing the narrative flow.

Follow these principles to get the most out of it:

***Translate to verify, not to cheat.*** Read a paragraph, form your understanding, then check the translation to confirm you got it right. This active process builds real comprehension.

***Leave notes for your future self.*** Mark tricky grammar, save useful vocabulary, or jot down questions for your next language lesson. Your annotations stay with the text, ready when you return.



## Features

- **Multi-Language Support** — Supports reading in Japanese, Russian, English, German, Spanish, French, and Chinese. Books are automatically detected or can be manually set. 
- **Clean Reading** — Distraction-free interface with customizable fonts, sizes, and themes
- **Paragraph Translation** — On-demand translation to verify your understanding. Choose your target language (default: English). Chrome users can use Google Translate for free (no API key required). Much better translation quality with OpenAI (gpt-5.2) is also available with an [API key](https://platform.openai.com/api-keys).  
- **Personal Notes** — Annotate any paragraph; notes persist locally
- **Progress Memory** — Automatically saves your position in each book
- **Offline Storage** — Everything stored in your browser



## Local Deploy

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000), drop in an EPUB, and start reading.

By default, you'll find a fragment of *The Tale of Genji* (源氏物語) to explore the features. The rest of the EPUB is on you to find — read what you like!



## Recommended

For instant word lookups in Japanese, pair with the [10ten Japanese Reader](https://github.com/birchill/10ten-ja-reader) browser extension.

For other languages, the [Google Dictionary (by Google)](https://chromewebstore.google.com/detail/google-dictionary-by-goog/mgijmajocgfcbeboacabfgobmjgjcoja) Chrome extension is a great way to get quick definitions while browsing.


## Tech

Next.js · React · Tailwind CSS · Dexie (IndexedDB) · epub.js · OpenAI



<p align="center">
  <sub>MIT License</sub>
</p>
