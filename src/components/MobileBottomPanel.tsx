'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ChatAssistant from './ChatAssistant';
import {
  type BottomPanelTab,
  type PanelOpenPayload,
  type PanelContentUpdatePayload,
  subscribeToPanelOpen,
  subscribeToPanelClose,
  subscribeToPanelContentUpdate,
  dispatchNoteSave,
  dispatchTranslationRetry,
  dispatchPanelClose,
  dispatchChatCreated,
  dispatchChatDeleted,
} from '@/utils/panelEventBridge';

// Re-export BottomPanelTab for external use
export type { BottomPanelTab };

// Component to handle scroll detection and close on bottom scroll
function ScrollableContent({ 
  children, 
  onScrollToBottom 
}: { 
  children: React.ReactNode; 
  onScrollToBottom: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        if (!content) return;
        
        const { scrollTop, scrollHeight, clientHeight } = content;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        
        if (distanceFromBottom <= 10 && scrollHeight > clientHeight) {
          onScrollToBottom();
        }
      }, 100);
    };

    content.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      content.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [onScrollToBottom]);

  return (
    <div ref={contentRef} className="h-full overflow-y-auto">
      {children}
    </div>
  );
}

// Note editor with local state management
function NoteEditor({ 
  initialContent, 
  paragraphHash,
}: { 
  initialContent: string;
  paragraphHash: string;
}) {
  const [localContent, setLocalContent] = useState(initialContent);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserTypingRef = useRef(false);
  const lastSavedContentRef = useRef(initialContent);

  // Update when initialContent changes externally
  useEffect(() => {
    if (!isUserTypingRef.current && initialContent !== lastSavedContentRef.current) {
      setLocalContent(initialContent);
      lastSavedContentRef.current = initialContent;
    }
  }, [initialContent]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    isUserTypingRef.current = true;
    setLocalContent(newContent);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      isUserTypingRef.current = false;
      lastSavedContentRef.current = newContent;
      // Dispatch event to main app to save
      dispatchNoteSave({ paragraphHash, content: newContent });
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full p-4">
      <textarea
        value={localContent}
        onChange={handleChange}
        className="flex-1 w-full resize-none rounded-lg p-3 text-sm focus:outline-none focus:ring-2"
        style={{
          // Let theme control the actual color; provide sensible fallbacks:
          // - light/sepia: warm beige
          // - dark: near-black, via --zen-note-bg / --zen-reader-bg
          backgroundColor: 'var(--zen-note-bg, var(--zen-note-content-bg, #fffbeb))',
          color: 'var(--zen-text, #1a1a1a)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--zen-note-border, #fde68a)',
        }}
        placeholder="Add your notes here..."
      />
    </div>
  );
}

// Translation content display
function TranslationContent({
  translation,
  translationError,
  isTranslating,
  paragraphHash,
}: {
  translation: string | null;
  translationError: string | null;
  isTranslating: boolean;
  paragraphHash: string;
}) {
  return (
    <div className="h-full flex flex-col p-4">
      {translationError ? (
        <div className="flex-1 flex items-center justify-center text-center p-4">
          <div className="w-full">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {translationError}
            </div>
            <button
              onClick={() => dispatchTranslationRetry({ paragraphHash })}
              className="mt-4 w-full px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Retry Translation
            </button>
          </div>
        </div>
      ) : translation ? (
        <div
          className="flex-1 text-sm leading-relaxed"
          style={{ color: 'var(--zen-text, #1a1a1a)' }}
        >
          {translation}
        </div>
      ) : isTranslating ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            Translating...
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <div className="mb-3 text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
              No translation yet for this paragraph.
            </div>
            <button
              onClick={() => dispatchTranslationRetry({ paragraphHash })}
              className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Translate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type PanelState = 'collapsed' | 'partial' | 'full';

// Content state managed by the panel itself
interface PanelContent {
  paragraphHash: string;
  paragraphText: string;
  // Translation
  translation: string | null;
  translationError: string | null;
  isTranslating: boolean;
  // Note
  noteContent: string;
  // Chat
  bookId: string;
  chatThreadId: string;
  hasChat?: boolean;
}

/**
 * Self-contained draggable bottom panel for mobile devices.
 * Completely isolated from main React tree - communicates via CustomEvents.
 */
function MobileBottomPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomPanelTab>('translation');
  const [panelState, setPanelState] = useState<PanelState>('partial');
  const [currentHeight, setCurrentHeight] = useState<number>(0);
  const [content, setContent] = useState<PanelContent | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0); // Track keyboard height
  
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(0);
  const wasOpenRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastHeightRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleDragStartRef = useRef<(clientY: number) => void>(() => {});
  const handleDragMoveRef = useRef<(clientY: number) => void>(() => {});
  const handleDragEndRef = useRef<() => void>(() => {});

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const partialHeight = viewportHeight * 0.33;
  const collapsedHeight = 48;
  const fullHeight = viewportHeight;

  // Subscribe to events from main app
  useEffect(() => {
    const unsubOpen = subscribeToPanelOpen((payload: PanelOpenPayload) => {
      setContent({
        paragraphHash: payload.paragraphHash,
        paragraphText: payload.paragraphText,
        translation: payload.translation || null,
        translationError: payload.translationError || null,
        isTranslating: payload.isTranslating || false,
        noteContent: payload.noteContent || '',
        bookId: payload.bookId || '',
        chatThreadId: payload.chatThreadId || `${payload.bookId}|${payload.paragraphHash}`,
        hasChat: payload.hasChat ?? false,
      });
      setActiveTab(payload.tab);
      setIsOpen(true);
    });

    const unsubClose = subscribeToPanelClose(() => {
      setIsOpen(false);
    });

    const unsubUpdate = subscribeToPanelContentUpdate((payload: PanelContentUpdatePayload) => {
      setContent(prev => {
        if (!prev || prev.paragraphHash !== payload.paragraphHash) return prev;
        
        if (payload.type === 'translation') {
          return {
            ...prev,
            translation: payload.translation ?? prev.translation,
            translationError: payload.translationError ?? prev.translationError,
            isTranslating: payload.isTranslating ?? prev.isTranslating,
          };
        }
        if (payload.type === 'note') {
          return {
            ...prev,
            noteContent: payload.noteContent ?? prev.noteContent,
          };
        }
        return prev;
      });
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubUpdate();
    };
  }, []);

  // Handle keyboard appearance - move panel up when keyboard shows
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    
    const handleResize = () => {
      // Calculate keyboard height as difference between window height and viewport height
      const windowHeight = window.innerHeight;
      const viewportHeight = viewport.height;
      const newKeyboardHeight = Math.max(0, windowHeight - viewportHeight);
      setKeyboardHeight(newKeyboardHeight);
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);
    
    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    setIsOpen(false);
    dispatchPanelClose();
  }, []);

  // Initialize height based on panel state
  useEffect(() => {
    if (!isOpen) {
      setCurrentHeight(0);
      setPanelState('collapsed');
      wasOpenRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setPanelState('partial');
      setCurrentHeight(partialHeight);
      return;
    }

    switch (panelState) {
      case 'collapsed':
        setCurrentHeight(collapsedHeight);
        break;
      case 'partial':
        setCurrentHeight(partialHeight);
        break;
      case 'full':
        setCurrentHeight(fullHeight);
        break;
    }
  }, [panelState, isOpen, partialHeight, fullHeight, collapsedHeight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Keep lastHeightRef in sync
  useEffect(() => {
    lastHeightRef.current = currentHeight;
  }, [currentHeight]);

  // Debounced panel state update
  const updatePanelState = useCallback((height: number) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const threshold1 = collapsedHeight + 50;
      const threshold2 = (partialHeight + fullHeight) / 2;

      if (height < threshold1) {
        setPanelState('collapsed');
      } else if (height < threshold2) {
        setPanelState('partial');
      } else {
        setPanelState('full');
      }
    }, 100);
  }, [collapsedHeight, partialHeight, fullHeight]);

  // Handle drag start - NO document.body manipulation!
  const handleDragStart = useCallback((clientY: number) => {
    if (!panelRef.current) return;
    
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    isDraggingRef.current = true;
    dragStartYRef.current = clientY;
    dragStartHeightRef.current = lastHeightRef.current || partialHeight;
    
    // Only affect panel element, not entire document
    panelRef.current.style.transition = 'none';
  }, [partialHeight]);

  handleDragStartRef.current = handleDragStart;

  // Handle drag move
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDraggingRef.current || !panelRef.current) return;

    const deltaY = dragStartYRef.current - clientY;
    const newHeight = Math.max(collapsedHeight, Math.min(fullHeight, dragStartHeightRef.current + deltaY));
    
    panelRef.current.style.height = `${newHeight}px`;
    lastHeightRef.current = newHeight;
  }, [collapsedHeight, fullHeight]);

  handleDragMoveRef.current = handleDragMove;

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    isDraggingRef.current = false;
    
    if (panelRef.current) {
      panelRef.current.style.transition = 'height 0.2s ease-out';
    }
    
    const finalHeight = lastHeightRef.current;

    if (finalHeight < 150) {
      if (panelRef.current) {
        panelRef.current.style.height = '0px';
      }
      requestAnimationFrame(() => {
        handleClose();
      });
      return;
    }
    
    const twoThirdsHeight = viewportHeight * (2/3);
    if (finalHeight > twoThirdsHeight) {
      if (panelRef.current) {
        panelRef.current.style.height = `${fullHeight}px`;
      }
      requestAnimationFrame(() => {
        setCurrentHeight(fullHeight);
        setPanelState('full');
      });
      return;
    }
    
    requestAnimationFrame(() => {
      setCurrentHeight(finalHeight);
      updatePanelState(finalHeight);
    });
  }, [viewportHeight, fullHeight, handleClose, updatePanelState]);

  handleDragEndRef.current = handleDragEnd;

  // Touch event handlers
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const touchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        return;
      }
      e.preventDefault();
      handleDragStartRef.current(e.touches[0].clientY);
    };

    const touchMove = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
        handleDragMoveRef.current(e.touches[0].clientY);
      }
    };

    const touchEnd = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
        handleDragEndRef.current();
      }
    };

    handle.addEventListener('touchstart', touchStart, { passive: false });
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd, { passive: false });

    return () => {
      handle.removeEventListener('touchstart', touchStart);
      document.removeEventListener('touchmove', touchMove);
      document.removeEventListener('touchend', touchEnd);
    };
  }, [isOpen]);

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        handleDragMoveRef.current(e.clientY);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        handleDragEndRef.current();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isOpen]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        return;
      }
      e.preventDefault();
      handleDragStartRef.current(e.clientY);
    };

    handle.addEventListener('mousedown', handleMouseDown);

    return () => {
      handle.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen]);

  // Double tap handler
  const lastTapRef = useRef<number>(0);
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (panelState === 'full') {
        setPanelState('partial');
        setCurrentHeight(partialHeight);
      } else if (panelState === 'partial') {
        setPanelState('full');
        setCurrentHeight(fullHeight);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [panelState, partialHeight, fullHeight]);

  if (!isOpen || !content) return null;

  const showBackdrop = panelState === 'full';

  return (
    <div style={{ pointerEvents: 'auto' }}>
      {/* Backdrop */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-40 md:hidden transition-opacity duration-300"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={handleClose}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed left-0 right-0 z-50 md:hidden"
        style={{
          bottom: `${keyboardHeight}px`, // Move up when keyboard is shown
          height: `${currentHeight}px`,
          maxHeight: `calc(100vh - ${keyboardHeight}px)`,
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'height 0.2s ease-out, transform 0.2s ease-out, bottom 0.15s ease-out',
          willChange: 'height, bottom',
          userSelect: 'none', // Apply to panel only, not entire document
        }}
      >
        <div
          className="h-full flex flex-col rounded-t-xl shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--zen-note-bg, white)',
            borderTopWidth: '1px',
            borderTopStyle: 'solid',
            borderTopColor: 'var(--zen-note-border, #fcd34d)',
          }}
        >
          {/* Draggable Handle */}
          <div
            ref={handleRef}
            className="shrink-0 flex flex-col items-center cursor-grab active:cursor-grabbing touch-none select-none"
            style={{
              backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
              borderBottomWidth: '1px',
              borderBottomStyle: 'solid',
              borderBottomColor: 'var(--zen-note-border, #fde68a)',
              touchAction: 'none',
              paddingTop: '16px',
              paddingBottom: '12px',
              minHeight: '64px',
            }}
          >
            <div
              className="w-12 h-1.5 rounded-full my-2"
              onClick={handleDoubleTap}
              style={{
                backgroundColor: 'var(--zen-text-muted, #78716c)',
                opacity: 0.4,
              }}
            />
            {/* Tabs */}
            <div className="flex gap-1 w-full px-4 pb-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('translation');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors border ${
                  activeTab === 'translation'
                    ? 'border-emerald-400 shadow-sm'
                    : 'border-transparent'
                }`}
                style={{
                  backgroundColor:
                    activeTab === 'translation'
                      ? 'var(--zen-translation-btn-active-bg, rgba(16, 185, 129, 0.3))'
                      : content.translation
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'transparent',
                  color: activeTab === 'translation'
                    ? 'var(--zen-tab-text-active, var(--zen-text, #0f172a))'
                    : 'var(--zen-tab-text, var(--zen-text, #0f172a))',
                }}
              >
                Translation
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('note');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors border ${
                  activeTab === 'note'
                    ? 'border-amber-400 shadow-sm'
                    : 'border-transparent'
                }`}
                style={{
                  backgroundColor:
                    activeTab === 'note'
                      ? 'var(--zen-note-active-bg, rgba(245, 158, 11, 0.2))'
                      : content.noteContent?.trim()
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'transparent',
                  color: activeTab === 'note'
                    ? 'var(--zen-tab-text-active, var(--zen-text, #0f172a))'
                    : 'var(--zen-tab-text, var(--zen-text, #0f172a))',
                }}
              >
                Note
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('chat');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors border ${
                  activeTab === 'chat'
                    ? 'border-violet-400 shadow-sm'
                    : 'border-transparent'
                }`}
                style={{
                  backgroundColor:
                    activeTab === 'chat'
                      ? 'rgba(139, 92, 246, 0.2)'
                      : content.hasChat
                      ? 'rgba(139, 92, 246, 0.12)'
                      : 'transparent',
                  color: activeTab === 'chat'
                    ? 'var(--zen-tab-text-active, var(--zen-text, #0f172a))'
                    : 'var(--zen-tab-text, var(--zen-text, #0f172a))',
                }}
              >
                Chat
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'translation' && (
              <ScrollableContent onScrollToBottom={handleClose}>
                <TranslationContent
                  translation={content.translation}
                  translationError={content.translationError}
                  isTranslating={content.isTranslating}
                  paragraphHash={content.paragraphHash}
                />
              </ScrollableContent>
            )}
            {activeTab === 'note' && (
              <ScrollableContent onScrollToBottom={handleClose}>
                <NoteEditor
                  initialContent={content.noteContent}
                  paragraphHash={content.paragraphHash}
                />
              </ScrollableContent>
            )}
            {activeTab === 'chat' && content.bookId && (
              // Chat has its own scroll behavior - don't wrap in ScrollableContent
              <div className="h-full overflow-hidden">
                <ChatAssistant
                  bookId={content.bookId}
                  paragraphHash={content.paragraphHash}
                  paragraphText={content.paragraphText}
                  translation={content.translation}
                  isOpen={true}
                  onClose={handleClose}
                  showAllChats={false}
                  isMobile={true}
                  onChatCreated={() => {
                    dispatchChatCreated({
                      bookId: content.bookId,
                      paragraphHash: content.paragraphHash,
                      threadId: content.chatThreadId,
                    });
                  }}
                  onChatDeleted={() => {
                    dispatchChatDeleted({
                      bookId: content.bookId,
                      paragraphHash: content.paragraphHash,
                      threadId: content.chatThreadId,
                    });
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MobileBottomPanel;
