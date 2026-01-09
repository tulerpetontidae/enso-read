'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

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

      // Debounce scroll handler
      scrollTimeoutRef.current = setTimeout(() => {
        if (!content) return;
        
        const { scrollTop, scrollHeight, clientHeight } = content;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        
        // If scrolled to bottom (within 10px threshold), close the panel
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

export type BottomPanelTab = 'note' | 'chat' | 'translation';

interface MobileBottomPanelProps {
  isOpen: boolean;
  initialTab?: BottomPanelTab;  // Only used when opening, not controlled
  onClose: () => void;
  translationContent?: React.ReactNode;
  noteContent?: React.ReactNode;
  chatContent?: React.ReactNode;
}

type PanelState = 'collapsed' | 'partial' | 'full';

/**
 * Draggable bottom panel for mobile devices
 * States: collapsed (minimal), partial (33% viewport), full (100% with blur)
 */
function MobileBottomPanel({
  isOpen,
  initialTab = 'translation',
  onClose,
  translationContent,
  noteContent,
  chatContent,
}: MobileBottomPanelProps) {
  // CRITICAL: Tab state is managed INTERNALLY to avoid parent re-renders
  // This makes tab switching instant regardless of book size
  const [activeTab, setActiveTab] = useState<BottomPanelTab>(initialTab);
  const [panelState, setPanelState] = useState<PanelState>('partial');
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragStartHeight, setDragStartHeight] = useState<number>(0);
  const [currentHeight, setCurrentHeight] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const wasOpenRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastHeightRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const partialHeight = viewportHeight * 0.33; // 33% of viewport
  const collapsedHeight = 48; // Handle height only
  const fullHeight = viewportHeight;

  // Sync tab with initialTab when panel opens (allows parent to control initial tab)
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Initialize height based on panel state
  useEffect(() => {
    if (!isOpen) {
      setCurrentHeight(0);
      setPanelState('collapsed');
      wasOpenRef.current = false;
      // Cleanup on close
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

    // When opening for the first time, always start at partial height
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setPanelState('partial');
      setCurrentHeight(partialHeight);
      return;
    }

    // Otherwise, respect the current panel state
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

  // Determine panel state based on height (for UI purposes like backdrop)
  // Debounced to avoid excessive state updates during drag
  const updatePanelState = useCallback((height: number) => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounce state update (only affects backdrop visibility, not critical)
    debounceTimeoutRef.current = setTimeout(() => {
      const threshold1 = collapsedHeight + 50; // Small buffer for collapsed
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

  // Handle drag start (touch or mouse)
  const handleDragStart = useCallback((clientY: number) => {
    if (!panelRef.current) return;
    
    // Cancel any pending RAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    isDraggingRef.current = true;
    setIsDragging(true);
    setDragStartY(clientY);
    setDragStartHeight(panelRef.current.offsetHeight);
    lastHeightRef.current = panelRef.current.offsetHeight;
    document.body.style.userSelect = 'none'; // Prevent text selection during drag
  }, []);

  // Handle drag move with RAF throttling and direct DOM manipulation
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDraggingRef.current || dragStartY === null || !panelRef.current) return;

    const deltaY = dragStartY - clientY; // Negative when dragging up
    const newHeight = Math.max(collapsedHeight, Math.min(fullHeight, dragStartHeight + deltaY));
    
    // Apply height directly to DOM for immediate visual feedback (no React re-render)
    if (panelRef.current) {
      panelRef.current.style.height = `${newHeight}px`;
    }
    
    // Store height for later sync (only update React state on drag end, not during drag)
    lastHeightRef.current = newHeight;
    
    // Only update panel state for backdrop visibility (debounced, doesn't cause re-render of content)
    // Don't update currentHeight during drag to avoid React re-renders
    updatePanelState(newHeight);
  }, [dragStartY, dragStartHeight, collapsedHeight, fullHeight, updatePanelState]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    
    // Cancel any pending RAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    isDraggingRef.current = false;
    setIsDragging(false);
    
    // Use the last height from ref (more accurate than state during drag)
    const finalHeight = lastHeightRef.current;
    setDragStartY(null);
    document.body.style.userSelect = '';

    // Sync React state with final height
    setCurrentHeight(finalHeight);

    // Close if below one line of text height (< 150px)
    if (finalHeight < 150) {
      // Close if dragged below 150px (one line of text)
      onClose();
      return;
    }
    
    // If > 2/3 of viewport, snap to full screen
    const twoThirdsHeight = viewportHeight * (2/3);
    if (finalHeight > twoThirdsHeight) {
      setCurrentHeight(fullHeight);
      setPanelState('full');
      return;
    }
    
    // Keep the current height (allow arbitrary sizes below 2/3)
    // Only update state for UI purposes (backdrop, etc.)
    updatePanelState(finalHeight);
  }, [viewportHeight, fullHeight, onClose, updatePanelState]);

  // Touch event handlers - use native event listeners to avoid passive event issues
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const touchStart = (e: TouchEvent) => {
      // Only start drag if touching the handle area, not the buttons
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        return; // Don't start drag if clicking a button
      }
      e.preventDefault();
      handleDragStart(e.touches[0].clientY);
    };

    const touchMove = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
        handleDragMove(e.touches[0].clientY);
      }
    };

    const touchEnd = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
        handleDragEnd();
      }
    };

    // Use non-passive listeners on handle
    handle.addEventListener('touchstart', touchStart, { passive: false });
    
    // Add global touchmove and touchend listeners so dragging continues even outside handle
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd, { passive: false });

    return () => {
      handle.removeEventListener('touchstart', touchStart);
      document.removeEventListener('touchmove', touchMove);
      document.removeEventListener('touchend', touchEnd);
    };
  }, [handleDragStart, handleDragMove, handleDragEnd]);


  // Mouse event handlers (for testing on desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  }, [handleDragStart]);

  useEffect(() => {
    if (!isDraggingRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleDragMove, handleDragEnd]);

  // Double tap on handle to toggle full/collapsed
  const lastTapRef = useRef<number>(0);
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap detected
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

  if (!isOpen) return null;

  const showBackdrop = panelState === 'full';

  return (
    <>
      {/* Backdrop blur when full overlay */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-40 md:hidden transition-opacity duration-300"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={onClose}
        />
      )}

      {/* Bottom Panel */}
      <div
        ref={panelRef}
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          height: `${currentHeight}px`,
          maxHeight: '100vh',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: isDragging ? 'none' : 'height 0.2s ease-out, transform 0.2s ease-out',
          willChange: isDragging ? 'height' : 'auto',
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
            onMouseDown={handleMouseDown}
            style={{
              backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
              borderBottomWidth: '1px',
              borderBottomStyle: 'solid',
              borderBottomColor: 'var(--zen-note-border, #fde68a)',
              touchAction: 'none', // Prevent default touch behaviors
              paddingTop: '16px', // Increased padding for easier grabbing
              paddingBottom: '12px',
              minHeight: '64px', // Minimum height for easier touch target
            }}
          >
            {/* Handle indicator - draggable area */}
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
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'translation' ? '' : 'opacity-60'
                }`}
                style={{
                  backgroundColor: activeTab === 'translation' 
                    ? 'var(--zen-translation-btn-active-bg, rgba(16, 185, 129, 0.2))' 
                    : 'transparent',
                  color: 'var(--zen-note-header-text, #b45309)',
                }}
              >
                Translation
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('note');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'note' ? '' : 'opacity-60'
                }`}
                style={{
                  backgroundColor: activeTab === 'note' 
                    ? 'var(--zen-note-active-bg, rgba(245, 158, 11, 0.2))' 
                    : 'transparent',
                  color: 'var(--zen-note-header-text, #b45309)',
                }}
              >
                Note
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('chat');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'chat' ? '' : 'opacity-60'
                }`}
                style={{
                  backgroundColor: activeTab === 'chat' 
                    ? 'var(--zen-note-active-bg, rgba(139, 92, 246, 0.2))' 
                    : 'transparent',
                  color: 'var(--zen-note-header-text, #b45309)',
                }}
              >
                Chat
              </button>
            </div>
          </div>

          {/* Content Area - Render content based on active tab */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'translation' && translationContent && (
              <ScrollableContent onScrollToBottom={onClose}>
                {translationContent}
              </ScrollableContent>
            )}
            {activeTab === 'note' && noteContent && (
              <ScrollableContent onScrollToBottom={onClose}>
                {noteContent}
              </ScrollableContent>
            )}
            {activeTab === 'chat' && chatContent && (
              <ScrollableContent onScrollToBottom={onClose}>
                {chatContent}
              </ScrollableContent>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Memoize to prevent re-renders when parent re-renders
// CRITICAL: Only compare essential props for panel visibility/initial state
// Content props use refs in parent so they're stable between renders
export default React.memo(MobileBottomPanel, (prevProps, nextProps) => {
  // Re-render only when panel opens/closes or initial tab changes
  if (prevProps.isOpen !== nextProps.isOpen) return false;
  if (prevProps.initialTab !== nextProps.initialTab) return false;
  // Don't compare content props - they're memoized with refs in parent
  // and React's children reconciliation will handle actual changes efficiently
  return true;
});
