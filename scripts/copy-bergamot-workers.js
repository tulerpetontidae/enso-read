#!/usr/bin/env node

/**
 * Copy Bergamot translator worker files to public directory
 * This ensures the worker files are available at runtime
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../node_modules/@browsermt/bergamot-translator/worker');
const targetDir = path.join(__dirname, '../public/bergamot-worker');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy all worker files
const files = [
  'bergamot-translator-worker.js',
  'bergamot-translator-worker.wasm',
  'translator-worker.js',
];

files.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied ${file} to public/bergamot-worker/`);
  } else {
    console.warn(`Warning: ${file} not found in ${sourceDir}`);
  }
});

console.log('Bergamot worker files copied successfully!');

