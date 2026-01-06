'use client';

import React, { useCallback, useState } from 'react';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { FaBookOpen, FaCloudUploadAlt } from 'react-icons/fa';
import ePub from 'epubjs';
import { detectLanguage } from '@/lib/languages';

// Extract cover image from EPUB (best effort, fails gracefully)
async function extractCoverImage(arrayBuffer: ArrayBuffer): Promise<string | undefined> {
    try {
        // @ts-ignore
        const book = ePub(arrayBuffer);
        await book.ready;
        
        // Try to get cover from metadata
        // @ts-ignore
        let coverUrl = await book.coverUrl();
        
        // If no cover in metadata, try to find first image in content
        if (!coverUrl) {
            console.log('No cover in metadata, searching for first image in book...');
            
            // First, try to find any image files directly in the archive
            try {
                // @ts-ignore
                const files = Object.keys(book.archive.zip.files);
                console.log('Archive files:', files.length);
                
                // Look for common image paths
                const imageFile = files.find(f => 
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(f) && 
                    !f.includes('thumbnail') &&
                    (f.includes('cover') || f.includes('image') || f.includes('img'))
                );
                
                if (imageFile) {
                    console.log('Found image file in archive:', imageFile);
                    // @ts-ignore
                    const zipFile = book.archive.zip.file(imageFile);
                    if (zipFile) {
                        const arrayBuffer = await zipFile.async('arraybuffer');
                        if (arrayBuffer) {
                            const mimeType = imageFile.endsWith('.jpg') || imageFile.endsWith('.jpeg') ? 'image/jpeg' : 
                                            imageFile.endsWith('.png') ? 'image/png' : 
                                            imageFile.endsWith('.gif') ? 'image/gif' : 
                                            imageFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
                            const blob = new Blob([arrayBuffer], { type: mimeType });
                            coverUrl = URL.createObjectURL(blob);
                            console.log('Successfully loaded image from archive');
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to search archive for images:', e);
            }
            
            // If still no cover, try parsing content
            if (!coverUrl) {
                // @ts-ignore
                for (let i = 0; i < Math.min(5, book.spine.length); i++) {
                    // @ts-ignore
                    const section = book.spine.get(i);
                    if (!section) continue;

                    try {
                        // Suppress epub.js internal errors completely
                        const originalConsoleError = console.error;
                        console.error = () => {}; // Suppress all errors during this operation

                        await section.load(book.load.bind(book));
                        console.error = originalConsoleError;

                        const content = section.document;
                        if (content) {
                            const img = content.querySelector('img');
                            if (img) {
                                const imgSrc = img.getAttribute('src') || img.getAttribute('xlink:href');
                                if (imgSrc) {
                                    console.log('Found img src in content:', imgSrc);
                                    const sectionPath = section.href || '';
                                    const sectionDir = sectionPath.substring(0, sectionPath.lastIndexOf('/') + 1);
                                    let imagePath = imgSrc;
                                    
                                    if (!imagePath.startsWith('/')) {
                                        imagePath = sectionDir + imagePath;
                                    }
                                    imagePath = imagePath.replace(/^\//, '');
                                    
                                    console.log('Resolved image path:', imagePath);
                                    
                                    try {
                                        // @ts-ignore
                                        let zipFile = book.archive.zip.file(imagePath);
                                        
                                        // Try alternative paths if not found
                                        if (!zipFile) {
                                            const filename = imagePath.split('/').pop();
                                            if (filename) {
                                                // @ts-ignore
                                                const files = Object.keys(book.archive.zip.files);
                                                const match = files.find((f: string) => f.endsWith(filename));
                                                if (match) {
                                                    console.log('Found alternative path:', match);
                                                    // @ts-ignore
                                                    zipFile = book.archive.zip.file(match);
                                                }
                                            }
                                        }
                                        
                                        if (zipFile) {
                                            const arrayBuffer = await zipFile.async('arraybuffer');
                                            if (arrayBuffer) {
                                                const mimeType = imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg') ? 'image/jpeg' : 
                                                                imagePath.endsWith('.png') ? 'image/png' : 
                                                                imagePath.endsWith('.gif') ? 'image/gif' : 
                                                                imagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
                                                const blob = new Blob([arrayBuffer], { type: mimeType });
                                                coverUrl = URL.createObjectURL(blob);
                                                console.log('Successfully loaded image from archive');
                                                break;
                                            }
                                        } else {
                                            console.warn('Image file not found in archive:', imagePath);
                                        }
                                    } catch (archiveError) {
                                        console.warn('Failed to load image from archive:', archiveError);
                                    }
                                }
                            }
                        }
                        section.unload();
                    } catch (e: any) {
                        // Silently ignore all errors
                    }
                }
            }
        }
        
        if (coverUrl) {
            try {
                let blob: Blob;
                
                // Check if it's a blob URL (from archive) or needs to be fetched
                if (coverUrl.startsWith('blob:')) {
                    const response = await fetch(coverUrl);
                    blob = await response.blob();
                    URL.revokeObjectURL(coverUrl); // Clean up blob URL
                } else {
                    const response = await fetch(coverUrl);
                    blob = await response.blob();
                }
                
                const result = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                book.destroy();
                return result;
            } catch (e) {
                console.warn('Cover conversion failed:', e);
                // Cover fetch failed, continue without cover
            }
        }
        
        book.destroy();
    } catch (e) {
        console.warn('Cover extraction skipped:', e);
    }
    return undefined;
}

// Detect language by script analysis (more reliable for Asian languages)
function detectLanguageByScript(text: string): string | undefined {
    if (!text || text.length < 20) return undefined;
    
    // Count characters by script
    let japanese = 0; // Hiragana + Katakana
    let chinese = 0;  // CJK ideographs (shared by Japanese/Chinese)
    let cyrillic = 0;
    let latin = 0;
    
    for (const char of text) {
        const code = char.charCodeAt(0);
        // Hiragana
        if (code >= 0x3040 && code <= 0x309F) japanese++;
        // Katakana
        else if (code >= 0x30A0 && code <= 0x30FF) japanese++;
        // CJK Unified Ideographs
        else if (code >= 0x4E00 && code <= 0x9FAF) chinese++;
        // Cyrillic
        else if (code >= 0x0400 && code <= 0x04FF) cyrillic++;
        // Latin
        else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) latin++;
    }
    
    const total = japanese + chinese + cyrillic + latin;
    if (total < 20) return undefined;
    
    // Japanese: has hiragana/katakana (unique to Japanese)
    if (japanese > 5) return 'ja';
    
    // Chinese: has CJK but no hiragana/katakana
    if (chinese > total * 0.3 && japanese === 0) return 'zh';
    
    // Russian: predominantly Cyrillic
    if (cyrillic > total * 0.5) return 'ru';
    
    // For Latin-based languages, use franc
    return undefined;
}

// Detect language from EPUB content
async function detectBookLanguage(arrayBuffer: ArrayBuffer): Promise<string | undefined> {
    try {
        // @ts-ignore
        const book = ePub(arrayBuffer);
        await book.ready;
        
        let sampleText = '';
        
        // @ts-ignore
        const maxSections = Math.min(5, book.spine.length);
        
        for (let i = 0; i < maxSections && sampleText.length < 2000; i++) {
            try {
                // @ts-ignore
                const section = book.spine.get(i);
                if (!section) continue;
                
                await section.load(book.load.bind(book));
                const content = section.document;
                
                if (content) {
                    // Extract text from paragraphs
                    const paragraphs = content.querySelectorAll('p');
                    for (const p of paragraphs) {
                        const text = p.textContent?.trim() || '';
                        if (text.length > 10) {
                            sampleText += text + ' ';
                            if (sampleText.length >= 2000) break;
                        }
                    }
                    
                    // Also try body directly if no paragraphs found
                    if (sampleText.length < 100) {
                        const body = content.querySelector('body');
                        if (body) {
                            const bodyText = body.textContent?.trim() || '';
                            if (bodyText.length > 10) {
                                sampleText += bodyText.substring(0, 2000);
                            }
                        }
                    }
                }
                section.unload();
            } catch (e) {
                // Suppress replaceCss errors - they don't break text extraction
                continue;
            }
        }
        
        book.destroy();
        
        console.log('Language detection sample size:', sampleText.length);
        
        if (sampleText.length >= 30) {
            // First try script-based detection (reliable for CJK and Cyrillic)
            const scriptDetected = detectLanguageByScript(sampleText);
            if (scriptDetected) {
                console.log('Detected language by script:', scriptDetected);
                return scriptDetected;
            }
            
            // Fall back to franc for Latin-based languages
            const francDetected = detectLanguage(sampleText);
            if (francDetected && francDetected !== 'unknown') {
                console.log('Detected language by franc:', francDetected);
                return francDetected;
            }
        }
    } catch (e) {
        console.warn('Language detection skipped:', e);
    }
    return undefined;
}

export default function FileUpload() {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.epub')) {
            alert('Please upload a valid .epub file');
            return;
        }

        setIsProcessing(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const id = uuidv4();
            
            // Try to extract cover image (non-blocking, fails gracefully)
            let coverImage: string | undefined;
            try {
                // Create a copy for cover extraction so original buffer stays intact
                const bufferCopy = arrayBuffer.slice(0);
                coverImage = await extractCoverImage(bufferCopy);
            } catch {
                // Cover extraction failed, continue without it
            }

            // Detect language (non-blocking, fails gracefully)
            let sourceLanguage: string | undefined;
            try {
                // Create a copy for language detection so original buffer stays intact
                const bufferCopy = arrayBuffer.slice(0);
                const detected = await detectBookLanguage(bufferCopy);
                if (detected && detected !== 'unknown') {
                    sourceLanguage = detected;
                    console.log('Detected language:', detected);
                } else {
                    console.log('Language detection returned unknown or failed');
                }
            } catch (error) {
                // Language detection failed, continue without it
                console.warn('Language detection error:', error);
            }

            await db.books.add({
                id,
                title: file.name.replace('.epub', ''),
                data: arrayBuffer,
                addedAt: Date.now(),
                coverImage,
                sourceLanguage,
            });

            // Stay on landing page - don't auto-navigate to reader
            setIsProcessing(false);
        } catch (error) {
            console.error('Error saving book:', error);
            alert('Failed to save book to library.');
            setIsProcessing(false);
        }
    };

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await processFile(e.target.files[0]);
        }
    };

    return (
        <div
            className={clsx(
                "w-full max-w-xl px-12 py-10 rounded-2xl transition-all duration-500 flex flex-col items-center justify-center gap-5 cursor-pointer relative overflow-hidden group shadow-xl hover:shadow-2xl",
                isDragging && "scale-[1.02]",
                isProcessing && "opacity-80 pointer-events-none"
            )}
            style={{
                backgroundColor: isDragging ? 'var(--zen-upload-drag-bg, #f5f5f4)' : 'var(--zen-upload-bg, white)',
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
        >
            <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700" 
                style={{ background: 'var(--zen-upload-hover-gradient, linear-gradient(to bottom right, rgba(255,228,230,0.5), transparent))' }}
            />

            <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".epub"
                onChange={handleFileSelect}
            />

            <div 
                className={clsx(
                    "relative p-5 rounded-full transition-all duration-500 group-hover:text-rose-500",
                    isDragging && "scale-110"
                )}
                style={{
                    backgroundColor: isDragging ? 'var(--zen-upload-icon-drag-bg, #e7e5e4)' : 'var(--zen-upload-icon-bg, #fafaf9)',
                    color: 'var(--zen-text-muted, #a8a29e)'
                }}
            >
                {isProcessing ? (
                    <FaBookOpen className="text-3xl animate-bounce" />
                ) : (
                    <FaCloudUploadAlt className="text-3xl" />
                )}
            </div>

            <div className="text-center space-y-2 relative z-10">
                <h3 className="text-xl font-serif font-light tracking-wide" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                    {isProcessing ? 'Opening Book...' : 'Book Import'}
                </h3>
                <p className="text-sm font-light tracking-wide" style={{ color: 'var(--zen-text-muted, #a8a29e)' }}>
                    Drop your EPUB file here to begin
                </p>
            </div>

            <div 
                className={clsx(
                    "h-0.5 w-16 rounded-full transition-all duration-700 group-hover:bg-rose-200",
                    isDragging && "bg-stone-400 w-24"
                )}
                style={{ backgroundColor: isDragging ? undefined : 'var(--zen-upload-line-bg, #e7e5e4)' }}
            />
        </div>
    );
}
