'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { translate, type TranslationEngine } from '@/lib/translation';
import { checkGoogleTranslateAvailable } from '@/lib/browser';
import { IoTrashOutline, IoChatbubbleOutline, IoBookmark, IoBookmarkOutline } from 'react-icons/io5';
import ChatAssistant from './ChatAssistant';
import BookmarkSelector from './BookmarkSelector';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { BottomPanelTab } from './MobileBottomPanel';
import { 
    useReaderDataStore,
    useTranslation,
    useNote,
    useBookmark,
    useHasChat,
    useActiveParagraphHash,
    useBookmarkGroups,
} from '@/contexts/ReaderDataContext';
import { dispatchPanelContentUpdate, dispatchPanelOpen } from '@/utils/panelEventBridge';

interface TranslatableParagraphProps {
    children: React.ReactNode;
    bookId: string;
    paragraphText: string;
    paragraphHash: string; // Pre-calculated hash passed from parent
    showAllTranslations?: boolean;
    showAllComments?: boolean;
    showAllChats?: boolean;
    zenMode?: boolean;
}

const TranslatableParagraph = React.memo(function TranslatableParagraph({ 
    children, 
    bookId, 
    paragraphText,
    paragraphHash,
    showAllTranslations = false,
    showAllComments = false,
    showAllChats = false,
    zenMode = false,
}: TranslatableParagraphProps) {
    const isMobile = useIsMobile();
    
    // Get data from context using selectors (only re-renders when THIS paragraph's data changes)
    const dataStore = useReaderDataStore();
    const cachedTranslation = useTranslation(paragraphHash);
    const cachedNote = useNote(paragraphHash);
    const cachedBookmark = useBookmark(paragraphHash);
    const chatThreadId = `${bookId}|${paragraphHash}`;
    const cachedHasChat = useHasChat(chatThreadId);
    const activeParagraphHash = useActiveParagraphHash();
    const bookmarkGroupMap = useBookmarkGroups();
    
    // Mobile: tap state (buttons appear on tap instead of hover)
    const [isTapped, setIsTapped] = useState(false);
    const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // Hover state (desktop)
    const [isHovered, setIsHovered] = useState(false);
    const [isButtonHovered, setIsButtonHovered] = useState(false);
    const [isNoteButtonHovered, setIsNoteButtonHovered] = useState(false);
    const [isChatButtonHovered, setIsChatButtonHovered] = useState(false);
    const [isBookmarkButtonHovered, setIsBookmarkButtonHovered] = useState(false);
    
    // Translation state
    const [translation, setTranslation] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showTranslation, setShowTranslation] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Note state
    const [noteContent, setNoteContent] = useState('');
    const [savedNoteContent, setSavedNoteContent] = useState('');
    const [isNoteOpen, setIsNoteOpen] = useState(false);
    const [isNoteSaving, setIsNoteSaving] = useState(false);
    const [noteHeight, setNoteHeight] = useState(80); // Default height in pixels
    
    // Chat state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [hasChat, setHasChat] = useState(false);
    
    // Bookmark state
    const [isBookmarkSelectorOpen, setIsBookmarkSelectorOpen] = useState(false);
    const [currentBookmarkGroupId, setCurrentBookmarkGroupId] = useState<string | null>(null);
    const [bookmarkGroupColor, setBookmarkGroupColor] = useState<string | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const bookmarkButtonRef = useRef<HTMLButtonElement>(null);

    // Use pre-calculated paragraphHash from parent (no need to recalculate)
    const translationId = `${bookId}-${paragraphHash}`;
    const noteId = `${bookId}-${paragraphHash}`;
    const threadId = chatThreadId; // Use the one from context hooks
    const bookmarkId = `${bookId}-${paragraphHash}`;

    // Track if note is being edited to prevent overwrites
    const isNoteBeingEditedRef = useRef(false);
    const lastSavedNoteContentRef = useRef<string>('');
    const previousCachedNoteRef = useRef<{ content: string; height?: number } | null>(null);

    // Phase 1: Use pre-loaded data from lookup maps instead of DB queries
    useEffect(() => {
        // Set translation from cached data
        if (cachedTranslation) {
            setTranslation(cachedTranslation.translatedText);
        }
        
        // Set note from cached data - but only if not currently being edited
        if (cachedNote) {
            const cachedContent = cachedNote.content;
            const previousContent = previousCachedNoteRef.current?.content;
            
            // Only update if:
            // 1. Note is not open (not being edited) - always sync
            // 2. OR note just opened (previous was null) - initial load
            // 3. OR cached content matches what we last saved (our own save) - safe to sync
            // 4. OR cached content is different from previous AND we're not editing (external change)
            const shouldUpdate = !isNoteOpen || 
                                 previousCachedNoteRef.current === null ||
                                 cachedContent === lastSavedNoteContentRef.current ||
                                 (cachedContent !== previousContent && !isNoteBeingEditedRef.current);
            
            if (shouldUpdate) {
                setNoteContent(cachedContent);
                setSavedNoteContent(cachedContent);
                if (cachedNote.height) {
                    setNoteHeight(cachedNote.height);
                }
            }
            
            // Update ref for next comparison
            previousCachedNoteRef.current = cachedNote;
        } else {
            // Only clear if note is not open
            if (!isNoteOpen) {
                setNoteContent('');
                setSavedNoteContent('');
            }
            previousCachedNoteRef.current = null;
        }
        
        // Set chat state from cached data
        if (cachedHasChat) {
            setHasChat(true);
        }
        
        // Set bookmark from cached data
        if (cachedBookmark) {
            setCurrentBookmarkGroupId(cachedBookmark.colorGroupId);
            // Get color from bookmarkGroupMap
            const group = bookmarkGroupMap.get(cachedBookmark.colorGroupId);
            if (group) {
                setBookmarkGroupColor(group.color);
            } else {
                // Group might have been deleted, clear bookmark
                setCurrentBookmarkGroupId(null);
                setBookmarkGroupColor(null);
            }
        } else {
            // Clear bookmark if no cached bookmark
            setCurrentBookmarkGroupId(null);
            setBookmarkGroupColor(null);
        }
    }, [cachedTranslation, cachedNote, cachedHasChat, cachedBookmark, bookmarkGroupMap, isNoteOpen]);

    // Also update bookmark color when bookmarkGroupMap changes (for when group colors are updated)
    useEffect(() => {
        if (currentBookmarkGroupId && bookmarkGroupMap) {
            const group = bookmarkGroupMap.get(currentBookmarkGroupId);
            if (group) {
                setBookmarkGroupColor(group.color);
            } else {
                // Group was deleted, clear bookmark
                setCurrentBookmarkGroupId(null);
                setBookmarkGroupColor(null);
            }
        }
    }, [currentBookmarkGroupId, bookmarkGroupMap]);
    
    // Track previous showAll states to detect changes
    const prevShowAllTranslationsRef = useRef(showAllTranslations);
    const prevShowAllCommentsRef = useRef(showAllComments);
    
    // When showAllTranslations changes, always override local state
    useEffect(() => {
        // Only react to actual changes in the prop
        if (prevShowAllTranslationsRef.current !== showAllTranslations) {
            prevShowAllTranslationsRef.current = showAllTranslations;
            if (showAllTranslations && translation) {
                setShowTranslation(true);
            } else if (!showAllTranslations) {
                setShowTranslation(false);
            }
        }
    }, [showAllTranslations, translation]);
    
    // When showAllComments changes, always override local state
    useEffect(() => {
        // Only react to actual changes in the prop
        if (prevShowAllCommentsRef.current !== showAllComments) {
            prevShowAllCommentsRef.current = showAllComments;
            if (showAllComments && savedNoteContent) {
                setIsNoteOpen(true);
            } else if (!showAllComments) {
                setIsNoteOpen(false);
            }
        }
    }, [showAllComments, savedNoteContent]);
    
    // Track previous showAllChats state
    const prevShowAllChatsRef = useRef(showAllChats);
    
    // When showAllChats changes, always override local state
    useEffect(() => {
        if (prevShowAllChatsRef.current !== showAllChats) {
            prevShowAllChatsRef.current = showAllChats;
            if (showAllChats && hasChat) {
                setIsChatOpen(true);
            } else if (!showAllChats) {
                setIsChatOpen(false);
            }
        }
    }, [showAllChats, hasChat]);

    // Mobile: handle paragraph tap
    const handleParagraphClick = (e: React.MouseEvent) => {
        if (isMobile && !zenMode) {
            // Don't open panel if clicking on a button, interactive element, or bookmark selector
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('textarea') || target.closest('input')) {
                return;
            }
            
            // Check if clicking on bookmark selector - if so, don't do anything
            if (target.closest('[data-bookmark-selector]')) {
                return;
            }
            
            // Activate this paragraph and open bottom panel with translation tab,
            // but DO NOT start translation automatically
            dataStore.setActiveParagraphHash(paragraphHash);
            dispatchPanelOpen({
                tab: 'translation',
                paragraphHash,
                paragraphText,
                translation: translation || null,
                translationError: error || null,
                isTranslating: false,
                noteContent: noteContent || '',
                bookId,
                chatThreadId: `${bookId}|${paragraphHash}`,
                hasChat,
            });
        }
    };

    // Desktop: hover handlers (unchanged)
    const handleMouseEnter = () => {
        if (isMobile) return; // Ignore hover on mobile
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        if (isMobile) return; // Ignore hover on mobile
        hoverTimeoutRef.current = setTimeout(() => {
            if (!isButtonHovered && !isNoteButtonHovered && !isNoteOpen) {
                setIsHovered(false);
            }
        }, 150);
    };

    const handleButtonMouseEnter = () => {
        setIsButtonHovered(true);
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
    };

    const handleButtonMouseLeave = () => {
        setIsButtonHovered(false);
        hoverTimeoutRef.current = setTimeout(() => {
            if (!isNoteButtonHovered && !isNoteOpen) {
                setIsHovered(false);
            }
        }, 150);
    };

    const handleNoteButtonMouseEnter = () => {
        setIsNoteButtonHovered(true);
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
    };

    const handleNoteButtonMouseLeave = () => {
        setIsNoteButtonHovered(false);
        hoverTimeoutRef.current = setTimeout(() => {
            if (!isButtonHovered && !isNoteOpen) {
                setIsHovered(false);
            }
        }, 150);
    };

    const handleTranslate = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (!isMobile) {
            // Desktop: If we already have a translation, just toggle display
            if (translation) {
                setShowTranslation(!showTranslation);
                return;
            }
        }

        setIsLoading(true);
        setError(null);
        
        // Dispatch "translating" state to isolated panel (if open on mobile)
        if (isMobile) {
            dispatchPanelContentUpdate({
                paragraphHash,
                type: 'translation',
                translation: null,
                translationError: null,
                isTranslating: true,
            });
        }

        try {
            // Get translation engine, API key, target language, and book source language
            const { getApiKey } = await import('@/lib/apiKeyStorage');
            const [engineSetting, apiKeyValue, targetLangSetting, bergamotSourceSetting, bergamotTargetSetting, book] = await Promise.all([
                db.settings.get('translation_engine'),
                getApiKey(),
                db.settings.get('target_language'),
                db.settings.get('bergamot_source_language'),
                db.settings.get('bergamot_target_language'),
                db.books.get(bookId),
            ]);

            let selectedEngine: TranslationEngine = 'openai';
            let apiKey: string | undefined = apiKeyValue || undefined;
            let targetLanguage = targetLangSetting?.value || 'en';
            let sourceLanguage = book?.sourceLanguage || 'ja'; // Default to Japanese for backward compatibility

            // Determine which engine to use
            if (engineSetting?.value === 'google') {
                selectedEngine = 'google';
            } else if (engineSetting?.value === 'openai') {
                selectedEngine = 'openai';
            } else if (engineSetting?.value === 'bergamot') {
                selectedEngine = 'bergamot';
                // Use Bergamot-specific language pair
                sourceLanguage = bergamotSourceSetting?.value || 'ja';
                targetLanguage = bergamotTargetSetting?.value || 'en';
            } else {
                // No engine selected - try to auto-select
                const googleAvailable = await checkGoogleTranslateAvailable();
                if (googleAvailable) {
                    selectedEngine = 'google';
                } else if (apiKey) {
                    selectedEngine = 'openai';
                } else {
                    setError('Please configure a translation engine in Settings. Google Translate is unavailable in this browser.');
                    setIsLoading(false);
                    return;
                }
            }

            // Validate engine availability
            if (selectedEngine === 'google') {
                const googleAvailable = await checkGoogleTranslateAvailable();
                if (!googleAvailable) {
                    setError('Google Translate is unavailable in this browser. Please use OpenAI or switch to Chrome.');
                    setIsLoading(false);
                    return;
                }
            } else if (selectedEngine === 'openai') {
                if (!apiKey) {
                    setError('Please set your OpenAI API key in settings');
                    setIsLoading(false);
                    return;
                }
            } else if (selectedEngine === 'bergamot') {
                // Check if model is loaded
                const { isBergamotModelLoaded } = await import('@/lib/translation');
                const modelLoaded = await isBergamotModelLoaded(sourceLanguage, targetLanguage);
                if (!modelLoaded) {
                    setError('Bergamot model not loaded. Please load the model in Settings first.');
                    setIsLoading(false);
                    return;
                }
            }

            // Translate using selected engine with language parameters
            const translatedText = await translate(paragraphText, selectedEngine, apiKey, sourceLanguage, targetLanguage);

            if (!translatedText) {
                throw new Error('Translation failed - no result received');
            }

            // Cache the translation in DB
            await db.translations.put({
                id: translationId,
                bookId,
                paragraphHash,
                originalText: paragraphText,
                translatedText,
                createdAt: Date.now(),
            });

            // Update context store
            dataStore.setTranslation(paragraphHash, { translatedText, originalText: paragraphText });
            // Clear any previous errors
            dataStore.setTranslationError(paragraphHash, null);

            setTranslation(translatedText);
            // On mobile, translation is shown in bottom panel, not inline
            if (!isMobile) {
                setShowTranslation(true);
            }
            
            // Dispatch to isolated panel (if open on mobile)
            if (isMobile) {
                dispatchPanelContentUpdate({
                    paragraphHash,
                    type: 'translation',
                    translation: translatedText,
                    translationError: null,
                    isTranslating: false,
                });
            }
        } catch (e) {
            console.error('Translation error:', e);
            const errorMessage = e instanceof Error ? e.message : 'Translation failed';
            setError(errorMessage);
            // Pass error to context for mobile bottom panel display
            dataStore.setTranslationError(paragraphHash, errorMessage);
            // Clear translation from store
            dataStore.setTranslation(paragraphHash, null);
            
            // Dispatch error to isolated panel (if open on mobile)
            if (isMobile) {
                dispatchPanelContentUpdate({
                    paragraphHash,
                    type: 'translation',
                    translation: null,
                    translationError: errorMessage,
                    isTranslating: false,
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRedoTranslation = async () => {
        // Clear cached translation from DB
        try {
            await db.translations.delete(translationId);
        } catch (e) {
            console.error('Failed to clear translation cache:', e);
        }

        // Update context store
        dataStore.setTranslation(paragraphHash, null);

        // Reset state
        setTranslation(null);
        setShowTranslation(false);
        setError(null);

        // Retranslate
        await handleTranslate();
    };

    const hasTranslation = !!translation;
    const hasNote = !!savedNoteContent;
    const hasBookmark = !!currentBookmarkGroupId;

    const handleNoteClick = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (isMobile) {
            // On mobile, set active paragraph for bottom panel
            dataStore.setActiveParagraphHash(paragraphHash);
            
            // Dispatch panel open event with note tab
            dispatchPanelOpen({
                tab: 'note',
                paragraphHash,
                paragraphText,
                translation: translation || null,
                translationError: error || null,
                isTranslating: false,
                noteContent: noteContent || '',
                bookId,
                chatThreadId: `${bookId}|${paragraphHash}`,
                hasChat,
            });
        } else {
            // Desktop: toggle note sidebar
            const wasOpen = isNoteOpen;
            setIsNoteOpen(!isNoteOpen);
            if (!wasOpen) {
                // Opening note - reset editing flag
                isNoteBeingEditedRef.current = false;
                // Focus textarea when opening
                setTimeout(() => noteTextareaRef.current?.focus(), 100);
            } else {
                // Closing note - reset editing flag
                isNoteBeingEditedRef.current = false;
            }
        }
    };

    const saveNote = async () => {
        if (noteContent === savedNoteContent) return;
        
        setIsNoteSaving(true);
        try {
            if (noteContent.trim()) {
                await db.notes.put({
                    id: noteId,
                    bookId,
                    paragraphHash,
                    content: noteContent,
                    height: noteHeight,
                    createdAt: savedNoteContent ? Date.now() : Date.now(),
                    updatedAt: Date.now(),
                });
                
                // Update context store
                dataStore.setNote(paragraphHash, { content: noteContent, height: noteHeight });
            } else {
                // Delete note if empty
                await db.notes.delete(noteId);
                
                // Update context store
                dataStore.setNote(paragraphHash, null);
            }
            // Track what we saved to prevent overwrites
            lastSavedNoteContentRef.current = noteContent;
            setSavedNoteContent(noteContent);
        } catch (e) {
            console.error('Failed to save note:', e);
        } finally {
            setIsNoteSaving(false);
        }
    };

    const handleNoteBlur = () => {
        saveNote();
        // Don't close if there's content
        if (!noteContent.trim()) {
            setIsNoteOpen(false);
        }
    };

    const handleNoteKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            saveNote();
            setIsNoteOpen(false);
        }
    };

    // Desktop: show buttons on hover/interaction
    // Check if this paragraph is the active one
    const isActiveParagraph = activeParagraphHash === paragraphHash;
    
    // Mobile: show right-side buttons only for the active paragraph,
    // but keep bookmark visible on paragraphs that already have a bookmark.
    // Desktop: show buttons on hover or if any related state is active.
    const showButtons = isMobile 
        ? (isActiveParagraph || hasBookmark)
        : (isHovered || isButtonHovered || isNoteButtonHovered || isChatButtonHovered || isBookmarkButtonHovered || isNoteOpen || isChatOpen || isBookmarkSelectorOpen || hasBookmark);
    
    const handleBookmarkClick = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // If clicking the bookmark button while selector is open, close it
        // Otherwise, open it
        if (isBookmarkSelectorOpen) {
            setIsBookmarkSelectorOpen(false);
        } else {
            setIsBookmarkSelectorOpen(true);
            // Activate this paragraph when opening bookmark selector
            dataStore.setActiveParagraphHash(paragraphHash);
        }
        // Force hover state to show buttons
        if (!isMobile) {
            setIsBookmarkButtonHovered(true);
        }
    };

    const handleBookmarkSelect = async (colorGroupId: string | null) => {
        const bookmarkId = `${bookId}-${paragraphHash}`;
        
        if (colorGroupId) {
            // Get color from bookmarkGroupMap (already loaded)
            const group = bookmarkGroupMap.get(colorGroupId);
            if (group) {
                // Save bookmark to DB
                try {
                    await db.bookmarks.put({
                        id: bookmarkId,
                        bookId,
                        paragraphHash,
                        colorGroupId,
                        createdAt: currentBookmarkGroupId ? Date.now() : Date.now(),
                        updatedAt: Date.now(),
                    });
                    
                    // Update context store
                    dataStore.setBookmark(paragraphHash, { colorGroupId });
                    
                    setBookmarkGroupColor(group.color);
                    setCurrentBookmarkGroupId(colorGroupId);
                } catch (e) {
                    console.error('Failed to save bookmark:', e);
                }
            } else {
                console.error('Bookmark group not found:', colorGroupId);
                setCurrentBookmarkGroupId(null);
                setBookmarkGroupColor(null);
            }
        } else {
            // Remove bookmark
            try {
                await db.bookmarks.delete(bookmarkId);
                
                // Update context store
                dataStore.setBookmark(paragraphHash, null);
                
                setCurrentBookmarkGroupId(null);
                setBookmarkGroupColor(null);
            } catch (e) {
                console.error('Failed to remove bookmark:', e);
            }
        }
        setIsBookmarkSelectorOpen(false);
    };
    
    const handleChatClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (isMobile) {
            // On mobile, set active paragraph for bottom panel
            dataStore.setActiveParagraphHash(paragraphHash);
            if (!hasChat) {
                // Mark as having chat when opening for first time
                setHasChat(true);
            }
            
            // Dispatch panel open event with chat tab
            dispatchPanelOpen({
                tab: 'chat',
                paragraphHash,
                paragraphText,
                translation: translation || null,
                translationError: error || null,
                isTranslating: false,
                noteContent: noteContent || '',
                bookId,
                chatThreadId: `${bookId}|${paragraphHash}`,
                hasChat,
            });
        } else {
            // Desktop: toggle chat sidebar
            setIsChatOpen(!isChatOpen);
            if (!isChatOpen && !hasChat) {
                // When opening chat for first time, mark as having chat
                setHasChat(true);
            }
        }
    };
    
    // Update hasChat from cached data (no need to query DB)
    useEffect(() => {
        setHasChat(cachedHasChat);
    }, [cachedHasChat]);

    return (
        <div 
            ref={containerRef}
            className="relative transition-colors duration-200"
            data-paragraph-hash={paragraphHash}
            style={{ 
                marginLeft: isMobile ? '0' : '-60px', 
                marginRight: isMobile ? '0' : '-60px', 
                paddingLeft: isMobile ? '4px' : '60px', 
                paddingRight: isMobile ? '32px' : '60px',
                backgroundColor: isActiveParagraph && isMobile && !zenMode 
                    ? 'rgba(251, 191, 36, 0.08)' // Less strong yellow tint
                    : 'transparent',
                borderRadius: isActiveParagraph && isMobile && !zenMode ? '8px' : '0',
                // Keep vertical padding constant so the paragraph doesn't "jump" when selected
                paddingTop: '0',
                paddingBottom: '0',
                // Always reserve space for the left border so content doesn't shift horizontally
                borderLeft: isMobile && !zenMode
                    ? (isActiveParagraph ? '3px solid rgba(251, 191, 36, 0.3)' : '3px solid transparent')
                    : 'none',
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflowWrap: 'break-word',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleParagraphClick}
        >
            {/* Mobile: Hidden translate button for retry feature - not visible but accessible via querySelector */}
            {!zenMode && isMobile && (
                <button
                    data-translate-button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTranslate(e);
                    }}
                    disabled={isLoading}
                    style={{ display: 'none' }}
                    aria-hidden="true"
                />
            )}

            {/* Mobile: Right-side bookmark button only */}
            {!zenMode && isMobile && (
                <div 
                    className={`absolute right-1 top-0 z-30 flex flex-col gap-1.5 transition-all duration-300 ease-out ${
                        showButtons ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
                    }`}
                >
                    {/* Bookmark button (only visible button on mobile paragraphs) */}
                    <button
                        ref={bookmarkButtonRef}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBookmarkClick(e);
                        }}
                        className={`
                            w-8 h-8 
                            flex items-center justify-center 
                            rounded-full 
                            transition-all duration-300 ease-out
                            focus:outline-none focus:ring-2 focus:ring-rose-200
                        `}
                        style={{
                            boxShadow: hasBookmark ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                            backgroundColor: hasBookmark && bookmarkGroupColor
                                ? `${bookmarkGroupColor}20` // 20% opacity
                                : 'var(--zen-btn-bg, rgba(255, 255, 255, 0.9))',
                            borderWidth: hasBookmark ? '2px' : '1px',
                            borderStyle: 'solid',
                            borderColor: hasBookmark && bookmarkGroupColor
                                ? bookmarkGroupColor
                                : 'var(--zen-btn-border, rgba(0, 0, 0, 0.1))',
                            color: hasBookmark && bookmarkGroupColor
                                ? bookmarkGroupColor
                                : 'var(--zen-btn-text, rgba(0, 0, 0, 0.5))',
                        }}
                        title={hasBookmark ? 'Change bookmark' : 'Bookmark paragraph'}
                    >
                        {hasBookmark ? (
                            <IoBookmark size={16} />
                        ) : (
                            <IoBookmarkOutline size={16} />
                        )}
                    </button>
                </div>
            )}

            {/* Desktop: Translation button - left side (hidden in zen mode) */}
            {!zenMode && !isMobile && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTranslate(e);
                    }}
                    onMouseEnter={handleButtonMouseEnter}
                    onMouseLeave={handleButtonMouseLeave}
                    disabled={isLoading}
                    className={`
                        absolute -left-3 top-1 
                        w-8 h-8 
                        flex items-center justify-center 
                        rounded-full 
                        transition-all duration-300 ease-out
                        ${showButtons ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}
                        ${isLoading ? 'animate-pulse' : ''}
                        focus:outline-none focus:ring-2 focus:ring-rose-200
                    `}
                    style={{
                        boxShadow: showButtons ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                        backgroundColor: hasTranslation 
                            ? 'var(--zen-translation-btn-active-bg, rgba(16, 185, 129, 0.15))' 
                            : 'var(--zen-translation-btn-bg, rgba(255, 255, 255, 0.9))',
                        borderWidth: hasTranslation ? '2px' : '1px',
                        borderStyle: 'solid',
                        borderColor: hasTranslation 
                            ? 'var(--zen-translation-btn-active-border, rgba(16, 185, 129, 0.4))' 
                            : 'var(--zen-translation-btn-border, rgba(0, 0, 0, 0.1))',
                        color: hasTranslation 
                            ? 'var(--zen-translation-btn-active-text, rgba(16, 185, 129, 0.8))' 
                            : 'var(--zen-translation-btn-text, rgba(0, 0, 0, 0.5))',
                    }}
                    title={hasTranslation ? 'Show/hide translation' : 'Translate paragraph'}
                >
                    {isLoading ? (
                        <span className="w-4 h-4 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                        >
                            <path d="M5 8l6 6" />
                            <path d="M4 14l6-6 2-3" />
                            <path d="M2 5h12" />
                            <path d="M7 2h1" />
                            <path d="M22 22l-5-10-5 10" />
                            <path d="M14 18h6" />
                        </svg>
                    )}
                </button>
            )}

            {/* Desktop: Bookmark button - right side */}
            {!zenMode && !isMobile && (
                <button
                    ref={bookmarkButtonRef}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleBookmarkClick(e);
                    }}
                    onMouseEnter={() => setIsBookmarkButtonHovered(true)}
                    onMouseLeave={() => setIsBookmarkButtonHovered(false)}
                    className={`
                        absolute -right-24 top-1 
                        w-8 h-8 
                        flex items-center justify-center 
                        rounded-full 
                        transition-all duration-300 ease-out
                        ${(showButtons || hasBookmark) ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}
                        focus:outline-none focus:ring-2 focus:ring-rose-200
                    `}
                    style={{
                        boxShadow: (showButtons || hasBookmark) ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                        backgroundColor: hasBookmark && bookmarkGroupColor
                            ? `${bookmarkGroupColor}20` // 20% opacity
                            : 'var(--zen-btn-bg, rgba(255, 255, 255, 0.9))',
                        borderWidth: hasBookmark ? '2px' : '1px',
                        borderStyle: 'solid',
                        borderColor: hasBookmark && bookmarkGroupColor
                            ? bookmarkGroupColor
                            : 'var(--zen-btn-border, rgba(0, 0, 0, 0.1))',
                        color: hasBookmark && bookmarkGroupColor
                            ? bookmarkGroupColor
                            : 'var(--zen-btn-text, rgba(0, 0, 0, 0.5))',
                        zIndex: hasBookmark ? 35 : 30, // Higher z-index when active to ensure clickability
                        pointerEvents: 'auto',
                    }}
                    title={hasBookmark ? 'Change bookmark' : 'Bookmark paragraph'}
                >
                    {hasBookmark ? (
                        <IoBookmark size={16} />
                    ) : (
                        <IoBookmarkOutline size={16} />
                    )}
                </button>
            )}

            {/* Desktop: Note button - right side */}
            {!zenMode && !isMobile && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleNoteClick(e);
                    }}
                    onMouseEnter={handleNoteButtonMouseEnter}
                    onMouseLeave={handleNoteButtonMouseLeave}
                    className={`
                        absolute -right-3 top-1 
                        w-8 h-8 
                        flex items-center justify-center 
                        rounded-full 
                        transition-all duration-300 ease-out
                        ${(showButtons || hasNote) ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}
                        ${isNoteOpen ? 'ring-2' : ''}
                        focus:outline-none focus:ring-2
                    `}
                    style={{
                        boxShadow: (showButtons || hasNote) ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                        backgroundColor: hasNote 
                            ? 'var(--zen-note-btn-active-bg, rgba(245, 158, 11, 0.15))' 
                            : 'var(--zen-note-btn-bg, rgba(255, 255, 255, 0.9))',
                        borderWidth: hasNote ? '2px' : '1px',
                        borderStyle: 'solid',
                        borderColor: hasNote 
                            ? 'var(--zen-note-btn-active-border, rgba(245, 158, 11, 0.4))' 
                            : 'var(--zen-note-btn-border, rgba(0, 0, 0, 0.1))',
                        color: hasNote 
                            ? 'var(--zen-note-btn-active-text, rgba(245, 158, 11, 0.8))' 
                            : 'var(--zen-note-btn-text, rgba(0, 0, 0, 0.5))',
                    }}
                    onFocus={(e) => {
                        if (isNoteOpen) {
                            e.currentTarget.style.boxShadow = '0 0 0 2px var(--zen-note-border, rgba(245, 158, 11, 0.3))';
                        }
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.boxShadow = '';
                    }}
                    title={hasNote ? 'Edit note' : 'Add note'}
                >
                    <svg 
                        width="14" 
                        height="14" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                    >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                </button>
            )}

            {/* Desktop: Chat button - right side */}
            {!zenMode && !isMobile && (
                <button
                    onClick={handleChatClick}
                    onMouseEnter={() => setIsChatButtonHovered(true)}
                    onMouseLeave={() => setIsChatButtonHovered(false)}
                    className={`
                        absolute -right-12 top-1 
                        w-8 h-8 
                        flex items-center justify-center 
                        rounded-full 
                        transition-all duration-300 ease-out
                        ${(showButtons || hasChat) ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}
                        ${isChatOpen ? 'ring-2' : ''}
                        focus:outline-none focus:ring-2
                    `}
                    style={{
                        boxShadow: (showButtons || hasChat) ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                        backgroundColor: hasChat 
                            ? 'var(--zen-note-btn-active-bg, rgba(139, 92, 246, 0.15))' 
                            : 'var(--zen-note-btn-bg, rgba(255, 255, 255, 0.9))',
                        borderWidth: hasChat ? '2px' : '1px',
                        borderStyle: 'solid',
                        borderColor: hasChat 
                            ? 'var(--zen-note-btn-active-border, rgba(139, 92, 246, 0.4))' 
                            : 'var(--zen-note-btn-border, rgba(0, 0, 0, 0.1))',
                        color: hasChat 
                            ? 'var(--zen-note-btn-active-text, rgba(139, 92, 246, 0.8))' 
                            : 'var(--zen-note-btn-text, rgba(0, 0, 0, 0.5))',
                    }}
                    title={hasChat ? 'Open AI chat' : 'Start AI chat'}
                >
                    <IoChatbubbleOutline size={14} />
                </button>
            )}

            {/* Original paragraph content - reduce margin when translation shown */}
            <div style={{ marginBottom: showTranslation ? '-22px' : '0' }}>
                {children}
            </div>

            {/* Translation display - Desktop (hidden in zen mode) */}
            {!zenMode && !isMobile && showTranslation && translation && (
                <div 
                    className="relative py-2 pl-4 pr-12 border-l-2 rounded-r-lg text-base leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300"
                    style={{ 
                        fontFamily: 'system-ui, sans-serif', 
                        marginBottom: '2em',
                        backgroundColor: 'var(--zen-translation-bg, rgba(255, 241, 242, 0.5))',
                        borderColor: 'var(--zen-translation-border, #fecdd3)',
                        color: 'var(--zen-translation-text, #57534e)'
                    }}
                >
                    {translation}
                    {/* Redo button - bottom right */}
                    <button
                        onClick={handleRedoTranslation}
                        disabled={isLoading}
                        className="absolute bottom-2 right-2 p-1.5 rounded-full hover:bg-black/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ color: 'var(--zen-text-muted, #78716c)' }}
                        title="Clear and retranslate"
                    >
                        <IoTrashOutline size={14} />
                    </button>
                </div>
            )}


            {/* Bookmark Selector (hidden in zen mode) */}
            {!zenMode && isBookmarkSelectorOpen && (
                <BookmarkSelector
                    bookId={bookId}
                    paragraphHash={paragraphHash}
                    currentColorGroupId={currentBookmarkGroupId}
                    onSelect={handleBookmarkSelect}
                    onClose={() => setIsBookmarkSelectorOpen(false)}
                    buttonRef={bookmarkButtonRef}
                />
            )}

            {/* Chat Assistant - Desktop only (hidden in zen mode) */}
            {!zenMode && !isMobile && (
                <ChatAssistant
                    bookId={bookId}
                    paragraphHash={paragraphHash}
                    paragraphText={paragraphText}
                    translation={translation}
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    showAllChats={showAllChats}
                    noteHeight={isNoteOpen ? noteHeight : 0}
                    isNoteOpen={isNoteOpen}
                    onChatDeleted={() => {
                        setHasChat(false);
                        setIsChatOpen(false);
                        // Update context store
                        dataStore.setChat(threadId, false);
                    }}
                    onChatCreated={() => {
                        setHasChat(true);
                        // Update context store
                        dataStore.setChat(threadId, true);
                    }}
                />
            )}

            {/* Note input area - Desktop only (hidden in zen mode) */}
            {!zenMode && !isMobile && isNoteOpen && (
                <div 
                    className="absolute -right-3 top-10 w-64 animate-in fade-in slide-in-from-right-2 duration-200 z-10"
                    style={{ marginRight: '-220px' }}
                >
                    <div 
                        className="rounded-xl shadow-lg overflow-hidden"
                        style={{ 
                            backgroundColor: 'var(--zen-note-bg, white)',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: 'var(--zen-note-border, #fcd34d)'
                        }}
                    >
                        <div 
                            className="px-3 py-2 flex items-center justify-between"
                            style={{
                                backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
                                borderBottomWidth: '1px',
                                borderBottomStyle: 'solid',
                                borderBottomColor: 'var(--zen-note-border, #fde68a)'
                            }}
                        >
                            <span className="text-xs font-medium" style={{ color: 'var(--zen-note-header-text, #b45309)' }}>Note</span>
                            {isNoteSaving && (
                                <span className="text-xs" style={{ color: 'var(--zen-note-header-text, #d97706)' }}>Saving...</span>
                            )}
                        </div>
                        <textarea
                            ref={noteTextareaRef}
                            value={noteContent}
                            onChange={(e) => {
                                isNoteBeingEditedRef.current = true;
                                setNoteContent(e.target.value);
                                // Auto-resize based on content
                                if (e.target.scrollHeight > noteHeight) {
                                    setNoteHeight(Math.min(e.target.scrollHeight, 400)); // Max 400px
                                }
                            }}
                            onBlur={handleNoteBlur}
                            onKeyDown={handleNoteKeyDown}
                            onFocus={() => {
                                isNoteBeingEditedRef.current = true;
                            }}
                            placeholder="Write your note..."
                            className="w-full p-3 text-sm resize-y focus:outline-none"
                            style={{ 
                                height: `${noteHeight}px`,
                                minHeight: '80px',
                                maxHeight: '400px',
                                fontFamily: 'system-ui, sans-serif',
                                backgroundColor: 'var(--zen-note-bg, white)',
                                color: 'var(--zen-text, #44403c)',
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Error display - only on mobile (desktop shows errors in bottom panel) */}
            {error && isMobile && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Simple comparison - data comes from context, not props
    // Only re-render if these stable props change
    return (
        prevProps.bookId === nextProps.bookId &&
        prevProps.paragraphHash === nextProps.paragraphHash &&
        prevProps.showAllTranslations === nextProps.showAllTranslations &&
        prevProps.showAllComments === nextProps.showAllComments &&
        prevProps.showAllChats === nextProps.showAllChats &&
        prevProps.zenMode === nextProps.zenMode &&
        prevProps.children === nextProps.children
    );
});

export default TranslatableParagraph;

