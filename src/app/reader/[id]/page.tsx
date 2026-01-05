'use client';

import React, { useEffect, useRef, useState, use, useMemo, useCallback } from 'react';
import { db } from '@/lib/db';
import ePub, { Book } from 'epubjs';
import { FaChevronLeft } from 'react-icons/fa';
import { IoSettingsOutline } from 'react-icons/io5';
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
    const [readerFont, setReaderFont] = useState('noto-serif');
    const [readerWidth, setReaderWidth] = useState('medium');
    const [readerFontSize, setReaderFontSize] = useState('medium');

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
                            >
                                <p>{children}</p>
                            </TranslatableParagraph>
                        );
                    }
                }
            }
            return undefined;
        }
    }), [id]);

    useEffect(() => {
        let bookInstance: Book | null = null;
        const blobUrls: string[] = [];

        const load = async () => {
            try {
                const bookData = await db.books.get(id);
                if (!bookData?.data) return;

                // @ts-ignore
                bookInstance = ePub(bookData.data);
                await bookInstance.ready;

                const loadedSections: Array<{ id: string, html: string }> = [];

                // @ts-ignore
                for (let i = 0; i < bookInstance.spine.length; i++) {
                    // @ts-ignore
                    const section = bookInstance.spine.get(i);

                    try {
                        await section.load(bookInstance.load.bind(bookInstance));
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
                        console.error(`Section ${i} load error:`, err);
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

        const handleScroll = debounce(() => {
            if (containerRef.current) {
                const container = containerRef.current;
                const pct = (container.scrollTop / (container.scrollHeight - container.clientHeight)) * 100;
                const roundedPct = Math.round(Math.min(100, Math.max(0, pct)));
                setProgress(roundedPct);
                debouncedSave(roundedPct);
            }
        }, 200);

        const container = containerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [sections, id]);

    return (
        <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: 'var(--zen-reader-bg, #FDFBF7)' }}>
            <header className="h-14 flex items-center justify-between px-4 shrink-0 border-b relative z-10 transition-colors" style={{ borderColor: 'var(--zen-border, rgba(0,0,0,0.1))' }}>
                <Link href="/" className="p-2 transition-colors" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                    <FaChevronLeft size={16} />
                </Link>
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 transition-colors"
                    style={{ color: 'var(--zen-text-muted, #78716c)' }}
                    title="Settings"
                >
                    <IoSettingsOutline size={18} />
                </button>
            </header>

            <main
                ref={containerRef}
                className="flex-1 min-h-0 overflow-y-auto scroll-smooth"
            >
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

            <footer className="flex flex-col shrink-0 px-10 pt-[2px] pb-3 border-t" style={{ borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
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
