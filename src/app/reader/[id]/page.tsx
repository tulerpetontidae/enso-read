'use client';

import React, { useEffect, useRef, useState, use, useMemo, useCallback } from 'react';
import { db } from '@/lib/db';
import ePub, { Book } from 'epubjs';
import { FaChevronLeft } from 'react-icons/fa';
import { IoSettingsOutline } from 'react-icons/io5';
import { IoMoonOutline, IoMoon } from 'react-icons/io5';
import Link from 'next/link';
import parse, { domToReact, HTMLReactParserOptions, Element, DOMNode } from 'html-react-parser';
import TranslatableParagraph from '@/components/TranslatableParagraph';
import SettingsModal, { FONT_OPTIONS, WIDTH_OPTIONS, FONT_SIZE_OPTIONS } from '@/components/SettingsModal';

function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Robust path resolution helper
function resolvePath(basePath: string, relativePath: string): string {
    if (relativePath.startsWith('/') || relativePath.startsWith('http')) return relativePath;

    // Get directory parts of the base path
    const baseParts = basePath.split('/').slice(0, -1);
    const relParts = relativePath.split('/');

    for (const part of relParts) {
        if (part === '..') {
            if (baseParts.length > 0) baseParts.pop();
        } else if (part === '.') {
            // Do nothing
        } else if (part) {
            baseParts.push(part);
        }
    }

    return baseParts.join('/');
}

// Helper to extract text content from React nodes
function getTextContent(node: React.ReactNode): string {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (!node) return '';
    if (Array.isArray(node)) return node.map(getTextContent).join('');
    if (React.isValidElement(node)) {
        const props = node.props as { children?: React.ReactNode };
        if (props.children) {
            return getTextContent(props.children);
        }
    }
    return '';
}

export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const containerRef = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [sections, setSections] = useState<Array<{ id: string, html: string }>>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [readerFont, setReaderFont] = useState('serif');
    const [readerWidth, setReaderWidth] = useState('medium');
    const [readerFontSize, setReaderFontSize] = useState('medium');
    const [bookTitle, setBookTitle] = useState<string>('');
    const [showAllTranslations, setShowAllTranslations] = useState(false);
    const [showAllComments, setShowAllComments] = useState(false);
    const [commentPositions, setCommentPositions] = useState<Array<{ top: number; height: number }>>([]);
    const [showCommentIndicators, setShowCommentIndicators] = useState(false); // Toggle: ON = show on scroll, OFF = never show
    const [indicatorsVisible, setIndicatorsVisible] = useState(false); // Actual visibility state (for auto-hide)
    const [zenMode, setZenMode] = useState(false);
    const [notesVersion, setNotesVersion] = useState(0);

    // Load reader settings
    const loadReaderSettings = useCallback(async () => {
        try {
            const [fontSetting, widthSetting, fontSizeSetting] = await Promise.all([
                db.settings.get('reader_font'),
                db.settings.get('reader_width'),
                db.settings.get('reader_font_size'),
            ]);
            if (fontSetting?.value) setReaderFont(fontSetting.value);
            if (widthSetting?.value) setReaderWidth(widthSetting.value);
            if (fontSizeSetting?.value) setReaderFontSize(fontSizeSetting.value);
        } catch (e) {
            console.error('Failed to load reader settings:', e);
        }
    }, []);

    useEffect(() => {
        loadReaderSettings();
    }, [loadReaderSettings]);

    // Get current font family, max width, and font size from settings
    const currentFont = FONT_OPTIONS.find(f => f.value === readerFont) || FONT_OPTIONS[0];
    const currentWidth = WIDTH_OPTIONS.find(w => w.value === readerWidth) || WIDTH_OPTIONS[1];
    const currentFontSize = FONT_SIZE_OPTIONS.find(s => s.value === readerFontSize) || FONT_SIZE_OPTIONS[1];

    // Parser options to wrap paragraphs with TranslatableParagraph
    const parserOptions: HTMLReactParserOptions = useMemo(() => ({
        replace: (domNode) => {
            if (domNode instanceof Element) {
                // Strip document-level elements, just render their children
                if (['html', 'head', 'body'].includes(domNode.name)) {
                    if (domNode.name === 'head') {
                        // Skip head entirely (meta, title, etc.)
                        return <></>;
                    }
                    // For html and body, just render children
                    return <>{domToReact(domNode.children as DOMNode[], parserOptions)}</>;
                }
                
                // Wrap paragraphs with TranslatableParagraph
                if (domNode.name === 'p') {
                    const children = domToReact(domNode.children as DOMNode[], parserOptions);
                    const textContent = getTextContent(children);
                    
                    // Only wrap if there's actual text content (not just images)
                    if (textContent.trim().length > 0) {
                        return (
                            <TranslatableParagraph 
                                bookId={id} 
                                paragraphText={textContent}
                                showAllTranslations={showAllTranslations}
                                showAllComments={showAllComments}
                                zenMode={zenMode}
                                onNoteChange={() => setNotesVersion(prev => prev + 1)}
                            >
                                <p>{children}</p>
                            </TranslatableParagraph>
                        );
                    }
                }
            }
            return undefined;
        }
    }), [id, showAllTranslations, showAllComments, zenMode]);

    useEffect(() => {
        let bookInstance: Book | null = null;
        const blobUrls: string[] = [];

        const load = async () => {
            try {
                const bookData = await db.books.get(id);
                if (!bookData?.data) return;
                
                // Set book title
                if (bookData.title) {
                    setBookTitle(bookData.title);
                }

                // @ts-ignore
                bookInstance = ePub(bookData.data);
                await bookInstance.ready;

                const loadedSections: Array<{ id: string, html: string }> = [];

                // @ts-ignore
                for (let i = 0; i < bookInstance.spine.length; i++) {
                    // @ts-ignore
                    const section = bookInstance.spine.get(i);

                            try {
                                // Suppress epub.js internal errors
                                const originalConsoleError = console.error;
                                console.error = (...args: any[]) => {
                                    if (args[0]?.message?.includes('replaceCss')) return;
                                    originalConsoleError(...args);
                                };

                                await section.load(bookInstance.load.bind(bookInstance));
                                console.error = originalConsoleError;

                                const content = section.document;

                                if (content) {
                            // 1. Remove stylesheets to prevent 404s and style clashes
                            content.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());
                            content.querySelectorAll('style').forEach(el => el.remove());

                            // 2. Fix paragraph indentation (Japanese full-width spaces)
                            content.querySelectorAll('p').forEach(p => {
                                // Replace full-width space (　) at the start of paragraphs
                                if (p.innerHTML) {
                                    p.innerHTML = p.innerHTML.replace(/^[　\s]+/, '');
                                }
                            });

                            // 3. Process images (both <img> and SVG <image>)
                            const imageTags = content.querySelectorAll('img, image');
                            for (const img of imageTags) {
                                let src = img.getAttribute('src');
                                let isSvgImage = false;

                                if (!src) {
                                    src = img.getAttribute('xlink:href');
                                    isSvgImage = !!src;
                                }

                                if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                                    try {
                                        const sectionHref = section.href || section.canonical || '';
                                        const resolvedPath = resolvePath(sectionHref, src);

                                        // Attempt to find the file in zip
                                        // @ts-ignore
                                        let zipFile = bookInstance.archive.zip.file(resolvedPath);

                                        // Fallback: search for filename only if not found (sometimes paths are weird)
                                        if (!zipFile) {
                                            const fileName = resolvedPath.split('/').pop();
                                            if (fileName) {
                                                // @ts-ignore
                                                const matches = Object.keys(bookInstance.archive.zip.files).filter(k => k.endsWith(fileName));
                                                if (matches.length > 0) {
                                                    // @ts-ignore
                                                    zipFile = bookInstance.archive.zip.file(matches[0]);
                                                }
                                            }
                                        }

                                        if (zipFile) {
                                            const blob = await zipFile.async('blob');
                                            const objectUrl = URL.createObjectURL(blob);
                                            blobUrls.push(objectUrl);

                                            if (isSvgImage) {
                                                img.setAttribute('xlink:href', objectUrl);
                                            } else {
                                                img.setAttribute('src', objectUrl);
                                            }
                                        }
                                    } catch (e) {
                                        console.error('Image processing failed:', src, e);
                                    }
                                }
                            }

                            const serializer = new XMLSerializer();
                            const htmlString = serializer.serializeToString(content);

                            loadedSections.push({
                                id: section.idref || `section-${i}`,
                                html: htmlString
                            });
                        }
                        section.unload();
                    } catch (err) {
                        // Suppress replaceCss and other internal epub.js errors
                        // These don't actually break functionality
                        if (!(err instanceof Error && err.message?.includes('replaceCss'))) {
                            console.error(`Section ${i} load error:`, err);
                        }
                    }
                }
                setSections(loadedSections);
                setIsLoading(false);

            } catch (err) {
                console.error('Reader fatal error:', err);
                setIsLoading(false);
            }
        };

        load();

        return () => {
            blobUrls.forEach(url => URL.revokeObjectURL(url));
            if (bookInstance) {
                try {
                    bookInstance.destroy();
                } catch (e) { }
            }
        };
    }, [id]);

    // Save scroll position to DB
    const saveScrollPosition = async (scrollPct: number) => {
        try {
            await db.progress.put({
                bookId: id,
                scrollPosition: scrollPct,
                updatedAt: Date.now()
            });
        } catch (e) {
            console.error('Failed to save scroll position:', e);
        }
    };

    // Restore scroll position when sections are loaded
    useEffect(() => {
        if (sections.length === 0 || isLoading) return;

        const restorePosition = async () => {
            try {
                const savedProgress = await db.progress.get(id);
                if (savedProgress && containerRef.current) {
                    const container = containerRef.current;
                    // Wait for content to render
                    requestAnimationFrame(() => {
                        const scrollHeight = container.scrollHeight - container.clientHeight;
                        const targetScroll = (savedProgress.scrollPosition / 100) * scrollHeight;
                        container.scrollTop = targetScroll;
                        setProgress(Math.round(savedProgress.scrollPosition));
                    });
                }
            } catch (e) {
                console.error('Failed to restore scroll position:', e);
            }
        };

        restorePosition();
    }, [sections, isLoading, id]);

    useEffect(() => {
        const debouncedSave = debounce((pct: number) => {
            saveScrollPosition(pct);
        }, 1000);

        let hideTimeout: NodeJS.Timeout | null = null;

        const handleScroll = () => {
            if (containerRef.current) {
                const container = containerRef.current;
                const pct = (container.scrollTop / (container.scrollHeight - container.clientHeight)) * 100;
                const roundedPct = Math.round(Math.min(100, Math.max(0, pct)));
                setProgress(roundedPct);
                debouncedSave(roundedPct);

                // Show indicators on scroll if toggle is ON
                if (showCommentIndicators) {
                    setIndicatorsVisible(true);

                    // Hide after 1 second of no scrolling
                    if (hideTimeout) clearTimeout(hideTimeout);
                    hideTimeout = setTimeout(() => {
                        setIndicatorsVisible(false);
                    }, 1000);
                }
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => {
                container.removeEventListener('scroll', handleScroll);
                if (hideTimeout) clearTimeout(hideTimeout);
            };
        }
    }, [id, showCommentIndicators]); // Removed sections to keep dependency array stable
    
    // Track comment positions for scrollbar indicators (static, relative to document)
    useEffect(() => {
        const updateCommentPositions = async () => {
            if (!containerRef.current || sections.length === 0) return;
            
            try {
                // Get all notes for this book
                const allNotes = await db.notes.where('bookId').equals(id).toArray();
                if (allNotes.length === 0) {
                    setCommentPositions([]);
                    return;
                }
                
                // Find paragraph elements with notes
                const container = containerRef.current;
                const positions: Array<{ top: number; height: number }> = [];
                
                // Query all TranslatableParagraph containers
                const paragraphContainers = container.querySelectorAll('[data-paragraph-hash]');
                paragraphContainers.forEach((el) => {
                    const hash = el.getAttribute('data-paragraph-hash');
                    if (hash && allNotes.some(note => note.paragraphHash === hash)) {
                        // Get absolute position within the scrollable container (relative to document top)
                        const rect = el.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        const scrollTop = container.scrollTop;
                        
                        // Calculate position relative to document top within container
                        const absoluteTop = rect.top - containerRect.top + scrollTop;
                        
                        positions.push({
                            top: absoluteTop,
                            height: rect.height,
                        });
                    }
                });
                
                setCommentPositions(positions);
            } catch (e) {
                console.error('Failed to update comment positions:', e);
            }
        };
        
        // Update positions when sections change or after content loads
        const timeout = setTimeout(updateCommentPositions, 1000);
        
        return () => clearTimeout(timeout);
    }, [sections, id, notesVersion]);

    return (
        <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: 'var(--zen-reader-bg, #FDFBF7)' }}>
            {/* Header - always visible */}
            <header className="h-14 flex items-center justify-between px-4 shrink-0 border-b relative z-10 transition-colors" style={{ borderColor: 'var(--zen-border, rgba(0,0,0,0.1))' }}>
                {/* Left side - back button and title (hidden in zen mode) */}
                <div className={`flex items-center flex-1 transition-opacity duration-300 ${zenMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <Link href="/" className="p-2 transition-colors" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                        <FaChevronLeft size={16} />
                    </Link>
                    {bookTitle && (
                        <h1 className="flex-1 text-center font-serif font-medium text-sm truncate px-4" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                            {bookTitle}
                        </h1>
                    )}
                </div>

                {/* Right side - all buttons */}
                <div className="flex items-center gap-2">
                    {/* Show all translations button (hidden in zen mode) */}
                    {!zenMode && (
                        <button
                            onClick={() => setShowAllTranslations(!showAllTranslations)}
                            className="p-1.5 transition-colors rounded"
                            style={{ 
                                color: showAllTranslations ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                backgroundColor: showAllTranslations ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                            }}
                            title="Show all translations"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 8l6 6" />
                                <path d="M4 14l6-6 2-3" />
                                <path d="M2 5h12" />
                                <path d="M7 2h1" />
                                <path d="M22 22l-5-10-5 10" />
                                <path d="M14 18h6" />
                            </svg>
                        </button>
                    )}
                    {/* Show all comments button (hidden in zen mode) */}
                    {!zenMode && (
                        <button
                            onClick={() => setShowAllComments(!showAllComments)}
                            className="p-1.5 transition-colors rounded"
                            style={{ 
                                color: showAllComments ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                backgroundColor: showAllComments ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                            }}
                            title="Show all comments"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                        </button>
                    )}
                    {/* Show comment indicators button (hidden in zen mode) */}
                    {!zenMode && (
                        <button
                            onClick={() => setShowCommentIndicators(!showCommentIndicators)}
                            className="p-1.5 transition-colors rounded"
                            style={{ 
                                color: showCommentIndicators ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                backgroundColor: showCommentIndicators ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                            }}
                            title="Show comment markers on scrollbar"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="9" y1="9" x2="15" y2="9" />
                                <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                        </button>
                    )}
                    {/* Zen mode button - always visible */}
                    <button
                        onClick={() => setZenMode(!zenMode)}
                        className="p-2 transition-colors rounded-full"
                        style={{ 
                            color: zenMode ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                            backgroundColor: zenMode ? 'var(--zen-accent-bg, rgba(255,255,255,0.8))' : 'transparent'
                        }}
                        title="Zen mode"
                    >
                        {zenMode ? <IoMoon size={18} /> : <IoMoonOutline size={18} />}
                    </button>
                    {/* Settings button - always visible */}
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-2 transition-colors rounded-full"
                        style={{ 
                            color: 'var(--zen-text-muted, #78716c)',
                            backgroundColor: 'transparent'
                        }}
                        title="Settings"
                    >
                        <IoSettingsOutline size={18} />
                    </button>
                </div>
            </header>

            <main
                ref={containerRef}
                className="flex-1 min-h-0 overflow-y-auto scroll-smooth relative"
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'var(--zen-progress-bg, #e7e5e4) transparent',
                }}
            >
                {/* Scrollbar indicators for comments - static markers on scrollbar track (hidden in zen mode, shown on scroll if toggle is ON) */}
                {!zenMode && showCommentIndicators && indicatorsVisible && commentPositions.length > 0 && containerRef.current && (() => {
                    const container = containerRef.current;
                    if (!container) return null;
                    
                    const containerRect = container.getBoundingClientRect();
                    const scrollHeight = container.scrollHeight;
                    const clientHeight = container.clientHeight;
                    
                    if (scrollHeight <= clientHeight) return null; // No scrollbar needed
                    
                    // Narrower scrollbar indicators
                    const scrollbarWidth = 6;
                    
                    return (
                        <div 
                            className="fixed pointer-events-none"
                            style={{
                                right: `${window.innerWidth - containerRect.right}px`,
                                top: `${containerRect.top}px`,
                                width: `${scrollbarWidth}px`,
                                height: `${clientHeight}px`,
                                zIndex: 15, // Below progress bar (z-20)
                            }}
                        >
                            {commentPositions.map((pos, idx) => {
                                // Position relative to total document height (not viewport)
                                // This creates static markers on the scrollbar track
                                const indicatorTopPercent = (pos.top / scrollHeight) * 100;
                                const indicatorHeightPercent = (pos.height / scrollHeight) * 100;
                                
                                return (
                                    <div
                                        key={idx}
                                        className="absolute rounded-sm"
                                        style={{
                                            top: `${indicatorTopPercent}%`,
                                            height: `${Math.max(0.5, indicatorHeightPercent)}%`,
                                            width: '100%',
                                            right: '0',
                                            backgroundColor: 'rgba(250, 204, 21, 0.6)', // Non-transparent yellow
                                            backdropFilter: 'blur(4px)',
                                            boxShadow: '0 0 2px rgba(250, 204, 21, 0.5)',
                                        }}
                                    />
                                );
                            })}
                        </div>
                    );
                })()}
                {isLoading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-6 h-6 border-t-2 rounded-full animate-spin" style={{ borderColor: 'var(--zen-text-muted, #78716c)' }} />
                    </div>
                )}
                <div 
                    className="mx-auto py-8 pl-16 transition-all duration-300"
                    style={{ maxWidth: currentWidth.maxWidth }}
                >
                    {sections.map((section) => (
                        <div
                            key={section.id}
                            className="epub-section"
                            style={{
                                fontFamily: currentFont.fontFamily,
                                fontSize: currentFontSize.size,
                                lineHeight: '1.9',
                                color: 'var(--zen-text, #1a1a1a)',
                                padding: '10px 40px',
                                textAlign: 'left',
                                wordBreak: 'break-word',
                                transition: 'font-size 0.2s ease'
                            }}
                        >
                            {parse(section.html, parserOptions)}
                        </div>
                    ))}
                </div>
            </main>

            {/* Footer - hidden in zen mode */}
            {!zenMode && (
                <footer className="flex flex-col shrink-0 px-10 pt-[2px] pb-3 border-t relative z-20" style={{ borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
                    <div className="w-full h-0.75 relative overflow-hidden rounded" style={{ backgroundColor: 'var(--zen-progress-bg, #e7e5e4)' }}>
                        <div
                            className="h-full absolute left-0 transition-all duration-700 ease-out"
                            style={{ width: `${progress}%`, backgroundColor: 'var(--zen-progress-fill, #78716c)' }}
                        />
                    </div>
                    <div className="mt-2 text-center font-serif text-[14px] tracking-[0.3em] uppercase opacity-70" style={{ color: 'var(--zen-text-muted, #a8a29e)' }}>
                        {progress}%
                    </div>
                </footer>
            )}

            <style jsx global>{`
                .epub-section p {
                    margin-bottom: 2em;
                    text-indent: 0 !important;
                    margin-left: 0 !important;
                    padding-left: 0 !important;
                }
                .epub-section * {
                    text-indent: 0 !important;
                    max-width: 100%;
                }
                .epub-section img, .epub-section image {
                    max-width: 100% !important;
                    height: auto !important;
                    display: block;
                    margin: 3em auto;
                    border-radius: 4px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                }
                .epub-section h1, .epub-section h2, .epub-section h3 {
                    margin-top: 2.5em;
                    margin-bottom: 1.5em;
                    line-height: 1.4;
                    color: var(--zen-heading, #1c1917);
                    text-align: center;
                }
                /* Hide SVG containers if they wrap images but have fixed sizes */
                .epub-section svg {
                    height: auto !important;
                    width: auto !important;
                    max-width: 100% !important;
                    overflow: visible !important;
                }
            `}</style>

            <SettingsModal 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)}
                onSettingsChange={loadReaderSettings}
            />
        </div>
    );
}
