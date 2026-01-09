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
import MobileBottomPanel, { type BottomPanelTab } from '@/components/MobileBottomPanel';
import ChatAssistant from '@/components/ChatAssistant';
import { useIsMobile } from '@/hooks/useIsMobile';

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

// Note editor component for mobile bottom panel with local state management
function NoteEditorMobile({ 
    initialContent, 
    onUpdate 
}: { 
    initialContent: string; 
    onUpdate: (content: string) => void;
}) {
    const [localContent, setLocalContent] = useState(initialContent);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isUserTypingRef = useRef(false);
    const lastSavedContentRef = useRef(initialContent);
    const isInitialMountRef = useRef(true);

    // Initialize on mount
    useEffect(() => {
        isInitialMountRef.current = false;
        lastSavedContentRef.current = initialContent;
    }, []);

    // Only update local content when initialContent changes AND:
    // 1. User is not typing
    // 2. The content is different from what we last saved (external change)
    // 3. It's not the initial mount
    useEffect(() => {
        if (isInitialMountRef.current) {
            return;
        }
        
        // If user is typing, don't overwrite
        if (isUserTypingRef.current) {
            return;
        }
        
        // If the new content matches what we last saved, it's our own save - ignore
        if (initialContent === lastSavedContentRef.current) {
            return;
        }
        
        // This is an external change (e.g., from another device/tab) - update local state
        setLocalContent(initialContent);
        lastSavedContentRef.current = initialContent;
    }, [initialContent]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        isUserTypingRef.current = true;
        setLocalContent(newContent);
        
        // Debounce save to DB
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            isUserTypingRef.current = false;
            lastSavedContentRef.current = newContent;
            onUpdate(newContent);
        }, 500); // Save after 500ms of no typing
    };

    const handleBlur = () => {
        // Save immediately on blur
        isUserTypingRef.current = false;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        lastSavedContentRef.current = localContent;
        onUpdate(localContent);
    };

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return (
        <div className="h-full flex flex-col p-4">
            <textarea
                value={localContent}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Write your note..."
                className="w-full flex-1 p-3 text-sm resize-none focus:outline-none rounded-lg"
                style={{
                    fontFamily: 'system-ui, sans-serif',
                    backgroundColor: 'var(--zen-note-bg, white)',
                    color: 'var(--zen-text, #44403c)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--zen-note-border, #fcd34d)',
                }}
            />
        </div>
    );
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
    const [showAllChats, setShowAllChats] = useState(false);
    const [bookmarkPositions, setBookmarkPositions] = useState<Array<{ top: number; height: number; color: string }>>([]);
    const [showBookmarkIndicators, setShowBookmarkIndicators] = useState(false); // Toggle: ON = show on scroll, OFF = never show
    const [indicatorsVisible, setIndicatorsVisible] = useState(false); // Actual visibility state (for auto-hide)
    const [zenMode, setZenMode] = useState(false);
    const [notesVersion, setNotesVersion] = useState(0);
    const [bookmarksVersion, setBookmarksVersion] = useState(0);
    
    // Mobile state
    const isMobile = useIsMobile();
    const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
    const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('translation');
    const [activeParagraphHash, setActiveParagraphHash] = useState<string | null>(null);
    const [activeNoteContent, setActiveNoteContent] = useState<{ content: string; paragraphHash: string; onUpdate: (content: string) => void } | null>(null);
    const [activeChatParagraphHash, setActiveChatParagraphHash] = useState<string | null>(null);
    const [activeTranslationParagraphHash, setActiveTranslationParagraphHash] = useState<string | null>(null);
    
    // Batch-loaded data lookup maps (Phase 1: Batch Database Queries)
    const [translationMap, setTranslationMap] = useState<Map<string, { translatedText: string; originalText: string }>>(new Map());
    const [noteMap, setNoteMap] = useState<Map<string, { content: string; height?: number }>>(new Map());
    const [bookmarkMap, setBookmarkMap] = useState<Map<string, { colorGroupId: string }>>(new Map());
    const [chatMap, setChatMap] = useState<Map<string, boolean>>(new Map()); // Maps threadId to hasChat boolean
    const [bookmarkGroupMap, setBookmarkGroupMap] = useState<Map<string, { name: string; color: string }>>(new Map());

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

    // Refresh bookmark groups map (called when groups are updated)
    const refreshBookmarkGroupMap = useCallback(async () => {
        try {
            const allBookmarkGroups = await db.bookmarkGroups.toArray();
            const bgMap = new Map<string, { name: string; color: string }>();
            allBookmarkGroups.forEach(g => {
                bgMap.set(g.id, { name: g.name, color: g.color });
            });
            setBookmarkGroupMap(bgMap);
        } catch (e) {
            console.error('Failed to refresh bookmark groups:', e);
        }
    }, []);

    // Phase 1: Batch load all book-related data once on mount
    useEffect(() => {
        const batchLoadData = async () => {
            try {
                const [allTranslations, allNotes, allBookmarks, allChats, allBookmarkGroups] = await Promise.all([
                    db.translations.where('bookId').equals(id).toArray(),
                    db.notes.where('bookId').equals(id).toArray(),
                    db.bookmarks.where('bookId').equals(id).toArray(),
                    db.chats.where('bookId').equals(id).toArray(),
                    db.bookmarkGroups.toArray(),
                ]);

                // Create translation lookup map: paragraphHash -> { translatedText, originalText }
                const tMap = new Map<string, { translatedText: string; originalText: string }>();
                allTranslations.forEach(t => {
                    tMap.set(t.paragraphHash, { translatedText: t.translatedText, originalText: t.originalText });
                });

                // Create note lookup map: paragraphHash -> { content, height }
                const nMap = new Map<string, { content: string; height?: number }>();
                allNotes.forEach(n => {
                    nMap.set(n.paragraphHash, { content: n.content, height: n.height });
                });

                // Create bookmark lookup map: paragraphHash -> { colorGroupId }
                const bMap = new Map<string, { colorGroupId: string }>();
                allBookmarks.forEach(b => {
                    bMap.set(b.paragraphHash, { colorGroupId: b.colorGroupId });
                });

                // Create chat lookup map: threadId -> hasChat (boolean)
                const cMap = new Map<string, boolean>();
                allChats.forEach(chat => {
                    cMap.set(chat.threadId, true);
                });

                // Create bookmark group lookup map: groupId -> { name, color }
                const bgMap = new Map<string, { name: string; color: string }>();
                allBookmarkGroups.forEach(g => {
                    bgMap.set(g.id, { name: g.name, color: g.color });
                });

                setTranslationMap(tMap);
                setNoteMap(nMap);
                setBookmarkMap(bMap);
                setChatMap(cMap);
                setBookmarkGroupMap(bgMap);
            } catch (e) {
                console.error('Failed to batch load book data:', e);
            }
        };

        batchLoadData();
    }, [id]);

    // Refresh bookmark groups when settings modal closes (in case groups were updated)
    useEffect(() => {
        if (!isSettingsOpen) {
            // Settings modal just closed - refresh bookmark groups
            refreshBookmarkGroupMap();
        }
    }, [isSettingsOpen, refreshBookmarkGroupMap]);

    // Periodically refresh bookmark groups map (every 2 seconds) to catch external changes
    useEffect(() => {
        const interval = setInterval(() => {
            refreshBookmarkGroupMap();
        }, 2000);
        return () => clearInterval(interval);
    }, [refreshBookmarkGroupMap]);

    // Get current font family, max width, and font size from settings
    const currentFont = FONT_OPTIONS.find(f => f.value === readerFont) || FONT_OPTIONS[0];
    const currentWidth = WIDTH_OPTIONS.find(w => w.value === readerWidth) || WIDTH_OPTIONS[1];
    const currentFontSize = FONT_SIZE_OPTIONS.find(s => s.value === readerFontSize) || FONT_SIZE_OPTIONS[1];

    // Helper function to check if an element should be treated as a paragraph
    const isParagraphElement = (domNode: Element): boolean => {
        const tagName = domNode.name.toLowerCase();
        
        // Check in priority order: p, div.paragraph, blockquote, li
        if (tagName === 'p') return true;
        if (tagName === 'div' && domNode.attribs?.class?.includes('paragraph')) return true;
        if (tagName === 'blockquote') return true;
        if (tagName === 'li') return true;
        
        return false;
    };

    // Helper function to get the appropriate wrapper element
    const getParagraphWrapper = (domNode: Element, children: React.ReactNode) => {
        const tagName = domNode.name.toLowerCase();
        
        if (tagName === 'p') {
            return <p>{children}</p>;
        } else if (tagName === 'div' && domNode.attribs?.class?.includes('paragraph')) {
            return <div className={domNode.attribs.class}>{children}</div>;
        } else if (tagName === 'blockquote') {
            return <blockquote>{children}</blockquote>;
        } else if (tagName === 'li') {
            return <li>{children}</li>;
        }
        
        return <p>{children}</p>; // Fallback
    };

    // Helper function for paragraph hash (matching TranslatableParagraph implementation)
    const hashText = (text: string): string => {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    };

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
                
                // Wrap paragraph-like elements with TranslatableParagraph
                if (isParagraphElement(domNode)) {
                    const children = domToReact(domNode.children as DOMNode[], parserOptions);
                    const textContent = getTextContent(children);
                    
                    // Only wrap if there's actual text content (not just images)
                    if (textContent.trim().length > 0) {
                        const paragraphHash = hashText(textContent);
                        const translationId = `${id}-${paragraphHash}`;
                        const threadId = `${id}|${paragraphHash}`;
                        
                        // Get cached data from lookup maps
                        const cachedTranslation = translationMap.get(paragraphHash);
                        const cachedNote = noteMap.get(paragraphHash);
                        const cachedBookmark = bookmarkMap.get(paragraphHash);
                        const hasChat = chatMap.has(threadId);
                        
                        return (
                            <TranslatableParagraph 
                                bookId={id} 
                                paragraphText={textContent}
                                paragraphHash={paragraphHash}
                                showAllTranslations={showAllTranslations}
                                showAllComments={showAllComments}
                                showAllChats={showAllChats}
                                zenMode={zenMode}
                                // Pre-loaded data from lookup maps
                                cachedTranslation={cachedTranslation}
                                cachedNote={cachedNote}
                                cachedBookmark={cachedBookmark}
                                cachedHasChat={hasChat}
                                bookmarkGroupMap={bookmarkGroupMap}
                                // Callbacks for data updates
                                onTranslationUpdate={(hash, translation) => {
                                    // Update map when translation is added/updated
                                    const newMap = new Map(translationMap);
                                    if (translation) {
                                        newMap.set(hash, translation);
                                    } else {
                                        newMap.delete(hash);
                                    }
                                    setTranslationMap(newMap);
                                }}
                                onNoteUpdate={(hash, note) => {
                                    // Update map when note is added/updated/deleted
                                    const newMap = new Map(noteMap);
                                    if (note) {
                                        newMap.set(hash, note);
                                    } else {
                                        newMap.delete(hash);
                                    }
                                    setNoteMap(newMap);
                                    setNotesVersion(prev => prev + 1);
                                }}
                                onBookmarkUpdate={(hash, bookmark) => {
                                    // Update map when bookmark is added/updated/deleted
                                    const newMap = new Map(bookmarkMap);
                                    if (bookmark) {
                                        newMap.set(hash, bookmark);
                                    } else {
                                        newMap.delete(hash);
                                    }
                                    setBookmarkMap(newMap);
                                    setBookmarksVersion(prev => prev + 1);
                                }}
                                onChatUpdate={(threadId, hasChat) => {
                                    // Update map when chat is added/deleted
                                    const newMap = new Map(chatMap);
                                    if (hasChat) {
                                        newMap.set(threadId, true);
                                    } else {
                                        newMap.delete(threadId);
                                    }
                                    setChatMap(newMap);
                                }}
                                activeParagraphHash={activeParagraphHash}
                                onParagraphActivate={(hash) => {
                                    setActiveParagraphHash(hash);
                                }}
                                onOpenBottomPanel={(tab, hash) => {
                                    setBottomPanelTab(tab);
                                    setActiveParagraphHash(hash);
                                    setBottomPanelOpen(true);
                                    
                                    if (tab === 'translation') {
                                        setActiveTranslationParagraphHash(hash);
                                        // If translation doesn't exist, trigger it
                                        const cachedTranslation = translationMap.get(hash);
                                        if (!cachedTranslation) {
                                            // Translation will be triggered when user opens the tab
                                        }
                                    } else if (tab === 'chat') {
                                        setActiveChatParagraphHash(hash);
                                    } else if (tab === 'note') {
                                        const note = noteMap.get(hash);
                                        const noteId = `${id}-${hash}`;
                                        if (note) {
                                            setActiveNoteContent({
                                                content: note.content,
                                                paragraphHash: hash,
                                                onUpdate: async (content: string) => {
                                                    try {
                                                        if (content.trim()) {
                                                            await db.notes.put({
                                                                id: noteId,
                                                                bookId: id,
                                                                paragraphHash: hash,
                                                                content,
                                                                height: note.height || 80,
                                                                createdAt: note.height ? Date.now() : Date.now(),
                                                                updatedAt: Date.now(),
                                                            });
                                                            // Update note content
                                                            const newMap = new Map(noteMap);
                                                            newMap.set(hash, { ...note, content });
                                                            setNoteMap(newMap);
                                                            setNotesVersion(prev => prev + 1);
                                                        } else {
                                                            await db.notes.delete(noteId);
                                                            // Update note content
                                                            const newMap = new Map(noteMap);
                                                            newMap.delete(hash);
                                                            setNoteMap(newMap);
                                                            setNotesVersion(prev => prev + 1);
                                                        }
                                                        // Don't update activeNoteContent here - let NoteEditor handle its own state
                                                        // This prevents overwriting local state while user is typing
                                                    } catch (e) {
                                                        console.error('Failed to save note:', e);
                                                    }
                                                }
                                            });
                                        } else {
                                            setActiveNoteContent({
                                                content: '',
                                                paragraphHash: hash,
                                                onUpdate: async (content: string) => {
                                                    try {
                                                        if (content.trim()) {
                                                            await db.notes.put({
                                                                id: noteId,
                                                                bookId: id,
                                                                paragraphHash: hash,
                                                                content,
                                                                height: 80,
                                                                createdAt: Date.now(),
                                                                updatedAt: Date.now(),
                                                            });
                                                            // Update note content
                                                            const newMap = new Map(noteMap);
                                                            newMap.set(hash, { content, height: 80 });
                                                            setNoteMap(newMap);
                                                            setNotesVersion(prev => prev + 1);
                                                        } else {
                                                            await db.notes.delete(noteId);
                                                            // Update note content
                                                            const newMap = new Map(noteMap);
                                                            newMap.delete(hash);
                                                            setNoteMap(newMap);
                                                            setNotesVersion(prev => prev + 1);
                                                        }
                                                        // Don't update activeNoteContent here - let NoteEditor handle its own state
                                                        // This prevents overwriting local state while user is typing
                                                    } catch (e) {
                                                        console.error('Failed to save note:', e);
                                                    }
                                                }
                                            });
                                        }
                                    }
                                }}
                            >
                                {getParagraphWrapper(domNode, children)}
                            </TranslatableParagraph>
                        );
                    }
                }
            }
            return undefined;
            }
        }), [id, showAllTranslations, showAllComments, showAllChats, zenMode, bookmarksVersion, translationMap, noteMap, bookmarkMap, chatMap, bookmarkGroupMap]);

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

    // Save scroll position to DB with enhanced position data
    const saveScrollPosition = async (scrollPct: number) => {
        try {
            if (!containerRef.current) return;
            
            const container = containerRef.current;
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight - container.clientHeight;
            
            // Find the paragraph element closest to the scroll position
            const paragraphs = container.querySelectorAll<HTMLElement>('[data-paragraph-hash]');
            let closestParagraph: HTMLElement | null = null;
            let closestDistance = Infinity;
            const viewportTop = scrollTop;
            
            for (let j = 0; j < paragraphs.length; j++) {
                const para = paragraphs[j];
                const rect = para.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const paraTop = rect.top - containerRect.top + scrollTop;
                const distance = Math.abs(paraTop - viewportTop);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestParagraph = para;
                }
            }
            
            // Extract paragraph hash and calculate section index
            let paragraphHash: string | undefined;
            let sectionIndex: number | undefined;
            
            if (closestParagraph) {
                paragraphHash = closestParagraph.getAttribute('data-paragraph-hash') || undefined;
                
                // Find which section contains this paragraph
                if (paragraphHash) {
                    const sectionElements = container.querySelectorAll<HTMLElement>('.epub-section');
                    for (let i = 0; i < sectionElements.length; i++) {
                        if (sectionElements[i].contains(closestParagraph)) {
                            sectionIndex = i;
                            break;
                        }
                    }
                }
            }
            
            await db.progress.put({
                bookId: id,
                scrollPosition: scrollPct,
                scrollOffset: scrollTop,
                paragraphHash,
                sectionIndex,
                updatedAt: Date.now()
            });
        } catch (e) {
            console.error('Failed to save scroll position:', e);
        }
    };

    // Smart position restoration: single jump, as early as possible, accurately
    const positionRestoredRef = useRef(false);
    const savedPositionRef = useRef<{ scrollPosition: number; sectionIndex?: number; scrollOffset?: number; paragraphHash?: string } | null>(null);
    
    // Load saved position FIRST (before book loading)
    useEffect(() => {
        const loadSavedPosition = async () => {
            try {
                const savedProgress = await db.progress.get(id);
                if (savedProgress) {
                    savedPositionRef.current = {
                        scrollPosition: savedProgress.scrollPosition,
                        sectionIndex: savedProgress.sectionIndex,
                        scrollOffset: savedProgress.scrollOffset,
                        paragraphHash: savedProgress.paragraphHash,
                    };
                }
            } catch (e) {
                console.error('Failed to load saved position:', e);
            }
        };
        loadSavedPosition();
    }, [id]);

    // Single jump position restoration (no jitter)
    useEffect(() => {
        if (positionRestoredRef.current || !savedPositionRef.current || sections.length === 0 || isLoading) return;
        if (!containerRef.current) return;

        const restorePosition = () => {
            const container = containerRef.current!;
            const saved = savedPositionRef.current!;
            
            // Wait for DOM to render with double requestAnimationFrame for accurate layout
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    let targetScroll = 0;
                    
                    // Method 1 (Best): Find by paragraph hash (most accurate)
                    if (saved.paragraphHash) {
                        const element = container.querySelector(`[data-paragraph-hash="${saved.paragraphHash}"]`);
                        if (element) {
                            const rect = element.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();
                            targetScroll = container.scrollTop + rect.top - containerRect.top - 100; // 100px offset from top
                        }
                    }
                    
                    // Method 2: Use stored scroll offset (if sections above loaded)
                    if (targetScroll === 0 && saved.scrollOffset !== undefined) {
                        targetScroll = saved.scrollOffset;
                    }
                    
                    // Method 3: Use percentage of current loaded height (fallback)
                    if (targetScroll === 0) {
                        const scrollHeight = container.scrollHeight - container.clientHeight;
                        targetScroll = (saved.scrollPosition / 100) * scrollHeight;
                    }
                    
                    // Single jump - no smooth scrolling to avoid jitter
                    container.scrollTop = targetScroll;
                    setProgress(Math.round(saved.scrollPosition));
                    
                    // Mark as restored to prevent future jumps
                    positionRestoredRef.current = true;
                });
            });
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
                if (showBookmarkIndicators) {
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
    }, [id, showBookmarkIndicators]); // Removed sections to keep dependency array stable
    
    // Track bookmark positions for scrollbar indicators (static, relative to document)
    useEffect(() => {
        const updateBookmarkPositions = async () => {
            if (!containerRef.current || sections.length === 0) return;

            try {
                // Get all bookmarks for this book
                const allBookmarks = await db.bookmarks.where('bookId').equals(id).toArray();
                if (allBookmarks.length === 0) {
                    setBookmarkPositions([]);
                    return;
                }
                
                // Get all bookmark groups to map colorGroupId to color
                const allGroups = await db.bookmarkGroups.toArray();
                const groupColorMap = new Map(allGroups.map(g => [g.id, g.color]));
                
                // Find paragraph elements with bookmarks
                const container = containerRef.current;
                const positions: Array<{ top: number; height: number; color: string }> = [];
                
                // Query all TranslatableParagraph containers
                const paragraphContainers = container.querySelectorAll('[data-paragraph-hash]');
                paragraphContainers.forEach((el) => {
                    const hash = el.getAttribute('data-paragraph-hash');
                    const bookmark = allBookmarks.find(b => b.paragraphHash === hash);
                    if (bookmark) {
                        // Get absolute position within the scrollable container (relative to document top)
                        const rect = el.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        const scrollTop = container.scrollTop;
                        
                        // Calculate position relative to document top within container
                        const absoluteTop = rect.top - containerRect.top + scrollTop;
                        
                        // Get color from group
                        const color = groupColorMap.get(bookmark.colorGroupId) || '#f59e0b'; // Default to amber if group not found
                        
                        positions.push({
                            top: absoluteTop,
                            height: rect.height,
                            color,
                        });
                    }
                });
                
                setBookmarkPositions(positions);
            } catch (e) {
                console.error('Failed to update bookmark positions:', e);
            }
        };
        
        // Update positions when sections change or after content loads
        const timeout = setTimeout(updateBookmarkPositions, 1000);
        
        return () => clearTimeout(timeout);
    }, [sections, id, bookmarksVersion]);

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
                    {/* Show all buttons - hidden on mobile */}
                    <div className="hidden md:flex items-center gap-2">
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
                        {/* Show all chats button (hidden in zen mode) */}
                        {!zenMode && (
                            <button
                                onClick={() => setShowAllChats(!showAllChats)}
                                className="p-1.5 transition-colors rounded"
                                style={{ 
                                    color: showAllChats ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                    backgroundColor: showAllChats ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                                }}
                                title="Show all AI chats"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {/* Show bookmark indicators button (hidden in zen mode) */}
                    {!zenMode && (
                        <button
                            onClick={() => setShowBookmarkIndicators(!showBookmarkIndicators)}
                            className="p-1.5 transition-colors rounded"
                            style={{ 
                                color: showBookmarkIndicators ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                                backgroundColor: showBookmarkIndicators ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent'
                            }}
                            title="Show bookmarks on scrollbar"
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
                {/* Scrollbar indicators for bookmarks - static markers on scrollbar track (hidden in zen mode, shown on scroll if toggle is ON) */}
                {!zenMode && showBookmarkIndicators && indicatorsVisible && bookmarkPositions.length > 0 && containerRef.current && (() => {
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
                            {bookmarkPositions.map((pos, idx) => {
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
                                            backgroundColor: `${pos.color}99`, // 60% opacity
                                            width: '100%',
                                            right: '0',
                                            backdropFilter: 'blur(2px)',
                                            boxShadow: `0 0 2px ${pos.color}80`,
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
                    className="mx-auto py-8 transition-all duration-300"
                    style={{ 
                        maxWidth: isMobile ? '100%' : currentWidth.maxWidth,
                        paddingLeft: isMobile ? '0' : '64px',
                        paddingRight: isMobile ? '0' : '0'
                    }}
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
                                padding: isMobile ? '10px 4px' : '10px 40px',
                                textAlign: isMobile ? 'center' : 'left',
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
                .epub-section div.paragraph {
                    margin-top: 2.5em;
                    margin-bottom: 2.5em;
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

            {/* Mobile Bottom Panel */}
            {isMobile && !zenMode && (
                <MobileBottomPanel
                    isOpen={bottomPanelOpen}
                    activeTab={bottomPanelTab}
                    onTabChange={setBottomPanelTab}
                    onClose={() => {
                        setBottomPanelOpen(false);
                        setActiveParagraphHash(null);
                        setActiveNoteContent(null);
                        setActiveChatParagraphHash(null);
                        setActiveTranslationParagraphHash(null);
                    }}
                >
                    {bottomPanelTab === 'translation' && activeTranslationParagraphHash && (() => {
                        const paragraphHash = activeTranslationParagraphHash;
                        const cachedTranslation = translationMap.get(paragraphHash);
                        const translation = cachedTranslation?.translatedText || null;
                        
                        return (
                            <div className="h-full flex flex-col p-4">
                                {translation ? (
                                    <div 
                                        className="flex-1 overflow-y-auto p-4 rounded-lg"
                                        style={{
                                            backgroundColor: 'var(--zen-translation-bg, rgba(255, 241, 242, 0.5))',
                                            borderWidth: '1px',
                                            borderStyle: 'solid',
                                            borderColor: 'var(--zen-translation-border, #fecdd3)',
                                            color: 'var(--zen-translation-text, #57534e)',
                                            fontFamily: 'system-ui, sans-serif',
                                            fontSize: '14px',
                                            lineHeight: '1.6',
                                        }}
                                    >
                                        {translation}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-center text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                        <div>
                                            <p className="mb-4">Translation not available yet</p>
                                            <p className="text-xs opacity-75">Tap the translate button to generate translation</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                    {bottomPanelTab === 'note' && activeNoteContent && (
                        <NoteEditorMobile
                            key={activeNoteContent.paragraphHash}
                            initialContent={activeNoteContent.content}
                            onUpdate={activeNoteContent.onUpdate}
                        />
                    )}
                    {bottomPanelTab === 'chat' && activeChatParagraphHash && (() => {
                        const paragraphHash = activeChatParagraphHash;
                        const threadId = `${id}|${paragraphHash}`;
                        const paragraphElement = containerRef.current?.querySelector(`[data-paragraph-hash="${paragraphHash}"]`);
                        const paragraphText = paragraphElement?.textContent || '';
                        const cachedTranslation = translationMap.get(paragraphHash);
                        const translation = cachedTranslation?.translatedText || null;
                        
                        return (
                            <ChatAssistant
                                bookId={id}
                                paragraphHash={paragraphHash}
                                paragraphText={paragraphText}
                                translation={translation}
                                isOpen={bottomPanelOpen && bottomPanelTab === 'chat'}
                                onClose={() => {
                                    if (bottomPanelTab === 'chat') {
                                        setBottomPanelOpen(false);
                                    }
                                }}
                                showAllChats={false}
                                isMobile={true}
                                onChatDeleted={() => {
                                    const newMap = new Map(chatMap);
                                    newMap.delete(threadId);
                                    setChatMap(newMap);
                                }}
                                onChatCreated={() => {
                                    const newMap = new Map(chatMap);
                                    newMap.set(threadId, true);
                                    setChatMap(newMap);
                                }}
                            />
                        );
                    })()}
                </MobileBottomPanel>
            )}

            <SettingsModal 
                isOpen={isSettingsOpen} 
                onClose={() => {
                    setIsSettingsOpen(false);
                    // Refresh bookmark groups when settings modal closes
                    refreshBookmarkGroupMap();
                }}
                onSettingsChange={() => {
                    loadReaderSettings();
                    // Also refresh bookmark groups when settings change
                    refreshBookmarkGroupMap();
                }}
            />
        </div>
    );
}
