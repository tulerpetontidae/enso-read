'use client';

import React, { useState, useEffect, useRef } from "react";
import FileUpload from "@/components/FileUpload";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaBook } from "react-icons/fa";
import { RiDeleteBinLine, RiPencilLine } from "react-icons/ri";
import { IoSettingsOutline } from "react-icons/io5";
import { FaGithub } from "react-icons/fa";
import ePub from "epubjs";
import { initializeDefaultBook } from "@/lib/initDefaultBook";
import { SUPPORTED_LANGUAGES, getLanguageName, getLanguageCode, getLongestLanguageName, LANGUAGE_MAP } from "@/lib/languages";

// Extract cover image from EPUB (best effort)
async function extractCoverImage(arrayBuffer: ArrayBuffer): Promise<string | undefined> {
  try {
    // @ts-ignore
    const book = ePub(arrayBuffer);
    await book.ready;
    
    // @ts-ignore
    const coverUrl = await book.coverUrl();
    if (coverUrl) {
      try {
        const response = await fetch(coverUrl);
        const blob = await response.blob();
        const result = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        book.destroy();
        return result;
      } catch {
        // Cover fetch failed
      }
    }
    book.destroy();
  } catch (e) {
    console.warn('Cover extraction skipped:', e);
  }
  return undefined;
}

export default function Home() {
  const router = useRouter();
  const books = useLiveQuery(() => db.books.toArray());
  const allProgress = useLiveQuery(() => db.progress.toArray());
  
  // Create progress map
  const progressMap = React.useMemo(() => {
    if (!allProgress || !books) return {};
    const map: Record<string, number> = {};
    allProgress.forEach(p => {
      map[p.bookId] = p.scrollPosition;
    });
    return map;
  }, [allProgress, books]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [updatingCovers, setUpdatingCovers] = useState(false);
  const [currentLanguageIndex, setCurrentLanguageIndex] = useState(0);
  const [titleTypingText, setTitleTypingText] = useState("JP");
  const [masterTypingText, setMasterTypingText] = useState("日本語");
  const [editingLanguageId, setEditingLanguageId] = useState<string | null>(null);
  const [editLanguage, setEditLanguage] = useState("");

  // Track initial animation so first load shows full JP/日本語 without typing
  const hasInitialTitleAnimationRunRef = useRef(false);
  const hasInitialMasterAnimationRunRef = useRef(false);

  // Find longest language name for fixed width
  const longestLanguageName = getLongestLanguageName();
  const longestLanguageCode = "CN"; // All codes are 2 chars, but CN is widest visually

  // Language cycling animation with typing effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLanguageIndex((prev) => (prev + 1) % SUPPORTED_LANGUAGES.length);
    }, 8000); // Change every 8 seconds (slower, more time to see)
    return () => clearInterval(interval);
  }, []);

  // Typing animation for title (EnsoRead [CODE]) with backspace effect
  useEffect(() => {
    // On initial load, don't animate; just ensure the correct code is shown
    if (!hasInitialTitleAnimationRunRef.current) {
      hasInitialTitleAnimationRunRef.current = true;
      const initialLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
      setTitleTypingText(getLanguageCode(initialLang.code));
      return;
    }

    const prevIndex = currentLanguageIndex === 0 ? SUPPORTED_LANGUAGES.length - 1 : currentLanguageIndex - 1;
    const prevLang = SUPPORTED_LANGUAGES[prevIndex];
    const currentLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
    const previousText = getLanguageCode(prevLang.code);
    const targetText = getLanguageCode(currentLang.code);
    
    // First, delete previous text (backspace effect)
    let deleteIndex = previousText.length;
    const deleteInterval = setInterval(() => {
      if (deleteIndex > 0) {
        setTitleTypingText(previousText.substring(0, deleteIndex - 1));
        deleteIndex--;
      } else {
        clearInterval(deleteInterval);
        
        // Small pause before typing
        setTimeout(() => {
          // Then type new text
          let currentIndex = 0;
          const typingInterval = setInterval(() => {
            if (currentIndex < targetText.length) {
              setTitleTypingText(targetText.substring(0, currentIndex + 1));
              currentIndex++;
            } else {
              clearInterval(typingInterval);
            }
          }, 300); // 300ms per character (slower typing)
        }, 200); // 200ms pause
      }
    }, 100); // 100ms per character deletion
    
    return () => {
      clearInterval(deleteInterval);
    };
  }, [currentLanguageIndex]);

  // Typing animation for "Master [language]" - only the language name types with backspace
  useEffect(() => {
    // On initial load, don't animate; just ensure the correct language name is shown
    if (!hasInitialMasterAnimationRunRef.current) {
      hasInitialMasterAnimationRunRef.current = true;
      const initialLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
      setMasterTypingText(initialLang.nativeName);
      return;
    }

    const prevIndex = currentLanguageIndex === 0 ? SUPPORTED_LANGUAGES.length - 1 : currentLanguageIndex - 1;
    const prevLang = SUPPORTED_LANGUAGES[prevIndex];
    const currentLang = SUPPORTED_LANGUAGES[currentLanguageIndex];
    const previousText = prevLang.nativeName;
    const targetLanguageName = currentLang.nativeName;
    
    // First, delete previous text (backspace effect)
    let deleteIndex = previousText.length;
    const deleteInterval = setInterval(() => {
      if (deleteIndex > 0) {
        setMasterTypingText(previousText.substring(0, deleteIndex - 1));
        deleteIndex--;
      } else {
        clearInterval(deleteInterval);
        
        // Small pause before typing
        setTimeout(() => {
          // Then type new text
          let currentIndex = 0;
          const typingInterval = setInterval(() => {
            if (currentIndex < targetLanguageName.length) {
              setMasterTypingText(targetLanguageName.substring(0, currentIndex + 1));
              currentIndex++;
            } else {
              clearInterval(typingInterval);
            }
          }, 150); // 150ms per character (slower typing)
        }, 200); // 200ms pause
      }
    }, 80); // 80ms per character deletion
    
    return () => {
      clearInterval(deleteInterval);
    };
  }, [currentLanguageIndex]);

  // Initialize default book on first load
  useEffect(() => {
    initializeDefaultBook();
  }, []);

  // Update missing covers for existing books
  useEffect(() => {
    if (!books || books.length === 0 || updatingCovers) return;
    
    const booksWithoutCovers = books.filter(book => !book.coverImage);
    if (booksWithoutCovers.length === 0) return;
    
    const updateCovers = async () => {
      setUpdatingCovers(true);
      for (const book of booksWithoutCovers) {
        try {
          const coverImage = await extractCoverImage(book.data);
          if (coverImage) {
            await db.books.update(book.id, { coverImage });
          }
        } catch (e) {
          console.warn(`Failed to extract cover for ${book.title}:`, e);
        }
      }
      setUpdatingCovers(false);
    };
    
    updateCovers();
  }, [books]);

  const deleteBook = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this book?")) {
      await db.books.delete(id);
      await db.progress.delete(id);
    }
  };

  const startEditing = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const saveTitle = async (e: React.FormEvent | React.FocusEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editTitle.trim()) {
      await db.books.update(id, { title: editTitle.trim() });
    }
    setEditingId(null);
  };

  const startEditingLanguage = (e: React.MouseEvent, id: string, currentLanguage: string | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingLanguageId(id);
    setEditLanguage(currentLanguage || 'ja');
  };

  const saveLanguage = async (e: React.FormEvent | React.FocusEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (editLanguage) {
      await db.books.update(id, { sourceLanguage: editLanguage });
    }
    setEditingLanguageId(null);
  };

  const handleLanguageKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      saveLanguage(e, id);
    } else if (e.key === 'Escape') {
      setEditingLanguageId(null);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      saveTitle(e, id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--zen-bg,#Fdfbf7)] text-[var(--zen-text,#1c1917)] font-sans selection:bg-rose-200 overflow-x-hidden relative">

      {/* Settings Button */}
      <Link 
        href="/settings"
        className="fixed top-6 right-6 z-20 p-3 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md transition-all duration-300"
        style={{ 
          color: 'var(--zen-text-muted, #78716c)',
          backgroundColor: 'var(--zen-accent-bg, rgba(255,255,255,0.5))',
          borderColor: 'var(--zen-border, rgba(255,255,255,0.3))'
        }}
        title="Settings"
      >
        <IoSettingsOutline size={20} />
      </Link>

      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-rose-100/30 dark:bg-rose-900/10 rounded-full blur-3xl opacity-60 animate-pulse duration-[10s]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-emerald-100/30 dark:bg-emerald-900/10 rounded-full blur-3xl opacity-60 animate-pulse duration-[12s]" />
      </div>

      <main className="container mx-auto px-6 py-24 flex flex-col items-center relative z-10">

        {/* Header */}
        <header className="mb-16 text-center space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-block mb-4">
            <img src="/landing_zen.svg" alt="EnsoRead" className="w-32 h-32" style={{ filter: 'var(--zen-logo-filter, none)' }} />
          </div>
          <h1 className="text-6xl md:text-8xl font-serif font-thin tracking-tighter" style={{ color: 'var(--zen-heading, #1c1917)' }}>
            <span className="inline-block">Ens<span className="macron-o">ō</span>Read</span>{' '}
            <span 
              className="text-rose-400 inline-block"
              style={{ 
                width: '2.5ch', // Fixed width for 2-char codes
                display: 'inline-block',
                textAlign: 'left',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                letterSpacing: 'inherit',
              }}
            >
              {titleTypingText || '\u00A0'}
              {titleTypingText && titleTypingText.length < longestLanguageCode.length && (
                <span className="animate-blink">|</span>
              )}
            </span>
          </h1>
          <p 
            className="text-lg md:text-xl font-light max-w-lg mx-auto leading-relaxed tracking-wide mt-4"
            style={{ 
              minHeight: '1.5em',
            }}
          >
            <span style={{ color: 'var(--zen-text-muted, #78716c)' }}>Master </span>
            <span style={{ color: 'var(--zen-text-muted, #78716c)' }}>
              {masterTypingText || '\u00A0'}
              {masterTypingText && masterTypingText.length < SUPPORTED_LANGUAGES[currentLanguageIndex].nativeName.length && (
                <span className="animate-blink">|</span>
              )}
            </span>
            {' '}
            <span style={{ color: 'var(--zen-text-muted, #78716c)' }}>through </span>
            <span className="font-normal" style={{ color: 'var(--zen-text, #1c1917)' }}>reading immersion</span>.
          </p>
        </header>

        {/* Upload Section */}
        <section className="w-full flex justify-center mb-20 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
          <FileUpload />
        </section>

        {/* Library Section */}
        {books && books.length > 0 && (
          <section className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-300">
            <div className="flex items-center justify-between mb-12 px-2">
              <h2 className="text-3xl font-serif font-light tracking-wide" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                Library
              </h2>
              <span className="text-sm font-light uppercase tracking-widest" style={{ color: 'var(--zen-text-muted, #78716c)' }}>{books.length} Books</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {books?.map((book) => (
                <div
                  key={book.id}
                  className="group relative flex flex-col aspect-[3/4] p-8 backdrop-blur-sm rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 overflow-hidden cursor-pointer"
                  style={{ 
                    backgroundColor: 'var(--zen-card-bg, rgba(255,255,255,0.4))',
                    borderColor: 'var(--zen-border, rgba(255,255,255,0.4))',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }}
                  onClick={(e) => {
                    // Don't navigate if clicking on interactive elements
                    const target = e.target as HTMLElement;
                    if (
                      editingId === book.id ||
                      editingLanguageId === book.id ||
                      target.closest('.language-badge-container') ||
                      target.closest('.action-buttons-container') ||
                      target.closest('input') ||
                      target.closest('select') ||
                      target.closest('button') ||
                      target.tagName === 'SELECT' ||
                      target.tagName === 'OPTION'
                    ) {
                      // Don't navigate - let the interactive element handle it
                      return;
                    }
                    // Navigate to the reader
                    router.push(`/reader/${book.id}`);
                  }}
                >
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
                    style={{ 
                      background: 'var(--zen-card-hover-gradient, linear-gradient(to top, rgba(255,255,255,0.9), transparent))'
                    }} 
                  />

                  {/* Progress Indicator - gradient from bottom to top */}
                  {progressMap[book.id] > 0 && (
                    <div 
                      className="absolute inset-0 pointer-events-none rounded-3xl"
                      style={{
                        background: `linear-gradient(to top, 
                          var(--zen-progress-gradient-start) 0%, 
                          var(--zen-progress-gradient-start) ${progressMap[book.id]}%, 
                          transparent ${progressMap[book.id]}%, 
                          transparent 100%)`
                      }}
                    />
                  )}

                  {/* Progress Percentage */}
                  {progressMap[book.id] > 0 && (
                    <div 
                      className="absolute bottom-4 right-4 z-10 text-xs font-light tracking-wider"
                      style={{ 
                        color: 'var(--zen-text-muted)',
                        opacity: 0.8
                      }}
                    >
                      {progressMap[book.id]}%
                    </div>
                  )}

                  {/* Language Badge - Editable (Top Left) */}
                  <div 
                    className="language-badge-container absolute top-4 left-4 z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editingLanguageId !== book.id) {
                        startEditingLanguage(e, book.id, book.sourceLanguage);
                      }
                    }}
                    title="Click to change language"
                  >
                    {editingLanguageId === book.id ? (
                      <select
                        value={editLanguage}
                        onChange={(e) => {
                          const newLang = e.target.value;
                          setEditLanguage(newLang);
                          // Save immediately on change
                          db.books.update(book.id, { sourceLanguage: newLang || undefined }).then(() => {
                            setEditingLanguageId(null);
                          });
                        }}
                        onBlur={(e) => {
                          saveLanguage(e, book.id);
                        }}
                        onKeyDown={(e) => handleLanguageKeyDown(e, book.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="px-2 py-1 rounded-md text-xs font-light backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                        style={{ 
                          backgroundColor: 'var(--zen-card-solid-bg, rgba(255,255,255,0.9))',
                          color: 'var(--zen-text)',
                          border: '1px solid var(--zen-border, rgba(0,0,0,0.1))',
                        }}
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.nativeName} ({lang.code.toUpperCase()})
                          </option>
                        ))}
                        <option value="">Unknown</option>
                      </select>
                    ) : (
                      <div 
                        className="px-2 py-1 rounded-md text-xs font-light backdrop-blur-sm cursor-pointer hover:bg-opacity-90 transition-all"
                        style={{ 
                          backgroundColor: book.sourceLanguage 
                            ? 'var(--zen-card-solid-bg, rgba(255,255,255,0.8))' 
                            : 'var(--zen-card-solid-bg, rgba(255,255,255,0.6))',
                          color: 'var(--zen-text-muted)',
                          border: '1px solid var(--zen-border, rgba(0,0,0,0.1))'
                        }}
                      >
                        {book.sourceLanguage 
                          ? `${getLanguageName(book.sourceLanguage)} ${getLanguageCode(book.sourceLanguage)}`
                          : 'Language?'}
                      </div>
                    )}
                  </div>

                  {/* Book Cover */}
                  <div className="flex-1 flex items-center justify-center mb-4">
                    {book.coverImage ? (
                      <div className="w-20 h-28 rounded-lg overflow-hidden shadow-md group-hover:scale-105 transition-transform duration-500">
                        <img 
                          src={book.coverImage} 
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-28 shadow-inner rounded-lg border-l-4 flex items-center justify-center group-hover:scale-105 transition-transform duration-500" style={{ backgroundColor: 'var(--zen-placeholder-bg, #f5f5f4)', borderColor: 'var(--zen-placeholder-border, #d6d3d1)' }}>
                        <span className="font-serif text-3xl opacity-50" style={{ color: 'var(--zen-placeholder-text, #d6d3d1)' }}>本</span>
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 space-y-2 text-center">
                    {editingId === book.id ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={(e) => saveTitle(e, book.id)}
                        onKeyDown={(e) => handleTitleKeyDown(e, book.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="w-full font-serif font-medium text-lg text-center rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-300"
                        style={{ backgroundColor: 'var(--zen-input-bg, white)', borderColor: 'var(--zen-border, #e7e5e4)', color: 'var(--zen-text, #1c1917)' }}
                      />
                    ) : (
                      <h3 className="font-serif font-medium text-xl leading-snug line-clamp-2 group-hover:text-rose-500 transition-colors" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                        {book.title}
                      </h3>
                    )}
                    <p className="text-xs font-light tracking-wider" style={{ color: 'var(--zen-text-muted, #a8a29e)' }}>
                      {new Date(book.addedAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="action-buttons-container absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all z-20">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(e, book.id, book.title);
                      }}
                      className="p-2 hover:text-amber-500 rounded-full transition-all"
                      style={{ color: 'var(--zen-text-muted, #d6d3d1)' }}
                      title="Rename book"
                    >
                      <RiPencilLine size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBook(e, book.id);
                      }}
                      className="p-2 hover:text-rose-500 rounded-full transition-all"
                      style={{ color: 'var(--zen-text-muted, #d6d3d1)' }}
                      title="Delete book"
                    >
                      <RiDeleteBinLine size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer with GitHub link */}
        <footer className="mt-32 pb-4 text-center">
          <a
            href="https://github.com/tulerpetontidae/enso-read"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-col items-center gap-1.5 transition-colors hover:opacity-80"
            style={{ color: 'var(--zen-text-muted)' }}
          >
            <FaGithub size={20} />
            <span className="text-xs">tulerpetontidae/enso-read</span>
          </a>
        </footer>
      </main>
    </div>
  );
}
