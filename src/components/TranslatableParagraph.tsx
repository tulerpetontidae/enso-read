'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '@/lib/db';

// Simple hash function for paragraph text
function hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

interface TranslatableParagraphProps {
    children: React.ReactNode;
    bookId: string;
    paragraphText: string;
}

export default function TranslatableParagraph({ 
    children, 
    bookId, 
    paragraphText 
}: TranslatableParagraphProps) {
    // Hover state
    const [isHovered, setIsHovered] = useState(false);
    const [isButtonHovered, setIsButtonHovered] = useState(false);
    const [isNoteButtonHovered, setIsNoteButtonHovered] = useState(false);
    
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
    
    const containerRef = useRef<HTMLDivElement>(null);
    const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const paragraphHash = hashText(paragraphText);
    const translationId = `${bookId}-${paragraphHash}`;
    const noteId = `${bookId}-${paragraphHash}`;

    // Check for cached translation and note on mount
    useEffect(() => {
        const loadCachedData = async () => {
            try {
                const [cachedTranslation, cachedNote] = await Promise.all([
                    db.translations.get(translationId),
                    db.notes.get(noteId),
                ]);
                if (cachedTranslation) {
                    setTranslation(cachedTranslation.translatedText);
                }
                if (cachedNote) {
                    setNoteContent(cachedNote.content);
                    setSavedNoteContent(cachedNote.content);
                }
            } catch (e) {
                console.error('Failed to load cached data:', e);
            }
        };
        loadCachedData();
    }, [translationId, noteId]);

    const handleMouseEnter = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
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

    const handleTranslate = async () => {
        // If we already have a translation, just toggle display
        if (translation) {
            setShowTranslation(!showTranslation);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Get API key from settings
            const apiKeySetting = await db.settings.get('openai_api_key');
            if (!apiKeySetting?.value) {
                setError('Please set your OpenAI API key in settings');
                setIsLoading(false);
                return;
            }

            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: paragraphText,
                    apiKey: apiKeySetting.value,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Translation failed');
            }

            const data = await response.json();
            const translatedText = data.translation;

            // Cache the translation
            await db.translations.put({
                id: translationId,
                bookId,
                paragraphHash,
                originalText: paragraphText,
                translatedText,
                createdAt: Date.now(),
            });

            setTranslation(translatedText);
            setShowTranslation(true);
        } catch (e) {
            console.error('Translation error:', e);
            setError(e instanceof Error ? e.message : 'Translation failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleNoteClick = () => {
        setIsNoteOpen(!isNoteOpen);
        if (!isNoteOpen) {
            // Focus textarea when opening
            setTimeout(() => noteTextareaRef.current?.focus(), 100);
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
                    createdAt: savedNoteContent ? Date.now() : Date.now(),
                    updatedAt: Date.now(),
                });
            } else {
                // Delete note if empty
                await db.notes.delete(noteId);
            }
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

    const showButtons = isHovered || isButtonHovered || isNoteButtonHovered || isNoteOpen;
    const hasTranslation = !!translation;
    const hasNote = !!savedNoteContent;

    return (
        <div 
            ref={containerRef}
            className="relative"
            style={{ marginLeft: '-60px', marginRight: '-60px', paddingLeft: '60px', paddingRight: '60px' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Translation button - left side */}
            <button
                onClick={handleTranslate}
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
                    ${hasTranslation 
                        ? 'bg-emerald-100 border-2 border-emerald-300 text-emerald-600 hover:bg-emerald-200 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-100' 
                        : 'bg-white border border-stone-200 text-stone-500 hover:border-rose-300 hover:text-rose-500 hover:shadow-lg hover:shadow-rose-100'}
                    ${isLoading ? 'animate-pulse' : ''}
                    focus:outline-none focus:ring-2 focus:ring-rose-200
                `}
                style={{
                    boxShadow: showButtons ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
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

            {/* Note button - right side */}
            <button
                onClick={handleNoteClick}
                onMouseEnter={handleNoteButtonMouseEnter}
                onMouseLeave={handleNoteButtonMouseLeave}
                className={`
                    absolute -right-3 top-1 
                    w-8 h-8 
                    flex items-center justify-center 
                    rounded-full 
                    transition-all duration-300 ease-out
                    ${(showButtons || hasNote) ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}
                    ${hasNote 
                        ? 'bg-amber-100 border-2 border-amber-300 text-amber-600 hover:bg-amber-200 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-100' 
                        : 'bg-white border border-stone-200 text-stone-500 hover:border-amber-300 hover:text-amber-500 hover:shadow-lg hover:shadow-amber-100'}
                    ${isNoteOpen ? 'ring-2 ring-amber-200' : ''}
                    focus:outline-none focus:ring-2 focus:ring-amber-200
                `}
                style={{
                    boxShadow: (showButtons || hasNote) ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
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

            {/* Original paragraph content - reduce margin when translation shown */}
            <div style={{ marginBottom: showTranslation ? '-22px' : '0' }}>
                {children}
            </div>

            {/* Translation display */}
            {showTranslation && translation && (
                <div 
                    className="py-2 px-4 border-l-2 rounded-r-lg text-base leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300"
                    style={{ 
                        fontFamily: 'system-ui, sans-serif', 
                        marginBottom: '2em',
                        backgroundColor: 'var(--zen-translation-bg, rgba(255, 241, 242, 0.5))',
                        borderColor: 'var(--zen-translation-border, #fecdd3)',
                        color: 'var(--zen-translation-text, #57534e)'
                    }}
                >
                    {translation}
                </div>
            )}

            {/* Note input area */}
            {isNoteOpen && (
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
                            onChange={(e) => setNoteContent(e.target.value)}
                            onBlur={handleNoteBlur}
                            onKeyDown={handleNoteKeyDown}
                            placeholder="Write your note..."
                            className="w-full p-3 text-sm resize-none focus:outline-none"
                            style={{ 
                                minHeight: '80px', 
                                fontFamily: 'system-ui, sans-serif',
                                backgroundColor: 'var(--zen-note-bg, white)',
                                color: 'var(--zen-text, #44403c)',
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}

