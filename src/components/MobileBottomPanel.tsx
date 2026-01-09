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
  activeTab: BottomPanelTab;
  onTabChange: (tab: BottomPanelTab) => void;
  onClose: () => void;
  children?: React.ReactNode;
  noteContent?: React.ReactNode;
  chatContent?: React.ReactNode;
}

type PanelState = 'collapsed' | 'partial' | 'full';

/**
 * Draggable bottom panel for mobile devices
 * States: collapsed (minimal), partial (33% viewport), full (100% with blur)
 */
export default function MobileBottomPanel({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  children,
  noteContent,
  chatContent,
}: MobileBottomPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>('partial');
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragStartHeight, setDragStartHeight] = useState<number>(0);
  const [currentHeight, setCurrentHeight] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const wasOpenRef = useRef(false);

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const partialHeight = viewportHeight * 0.33; // 33% of viewport
  const collapsedHeight = 48; // Handle height only
  const fullHeight = viewportHeight;

  // Initialize height based on panel state
  useEffect(() => {
    if (!isOpen) {
      setCurrentHeight(0);
      setPanelState('collapsed');
      wasOpenRef.current = false;
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

  // Determine panel state based on height
  const updatePanelState = useCallback((height: number) => {
    const threshold1 = collapsedHeight + 50; // Small buffer for collapsed
    const threshold2 = (partialHeight + fullHeight) / 2;

    if (height < threshold1) {
      setPanelState('collapsed');
    } else if (height < threshold2) {
      setPanelState('partial');
    } else {
      setPanelState('full');
    }
  }, [collapsedHeight, partialHeight, fullHeight]);

  // Handle drag start (touch or mouse)
  const handleDragStart = useCallback((clientY: number) => {
    if (!panelRef.current) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    setDragStartY(clientY);
    setDragStartHeight(panelRef.current.offsetHeight);
    document.body.style.userSelect = 'none'; // Prevent text selection during drag
  }, []);

  // Handle drag move
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDraggingRef.current || dragStartY === null || !panelRef.current) return;

    const deltaY = dragStartY - clientY; // Negative when dragging up
    const newHeight = Math.max(collapsedHeight, Math.min(fullHeight, dragStartHeight + deltaY));
    
    setCurrentHeight(newHeight);
    updatePanelState(newHeight);
  }, [dragStartY, dragStartHeight, collapsedHeight, fullHeight, updatePanelState]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    
    isDraggingRef.current = false;
    setIsDragging(false);
    const finalHeight = currentHeight; // Use current height state
    setDragStartY(null);
    document.body.style.userSelect = '';

    // Snap to nearest state based on final height
    const threshold1 = (collapsedHeight + partialHeight) / 2;
    const threshold2 = (partialHeight + fullHeight) / 2;
    
    let targetHeight = finalHeight;
    let targetState: PanelState = 'partial';
    
    if (finalHeight < threshold1) {
      // Snap to collapsed or close
      if (finalHeight < collapsedHeight + 20) {
        onClose();
        return;
      } else {
        targetHeight = collapsedHeight;
        targetState = 'collapsed';
      }
    } else if (finalHeight < threshold2) {
      // Snap to partial
      targetHeight = partialHeight;
      targetState = 'partial';
    } else {
      // Snap to full
      targetHeight = fullHeight;
      targetState = 'full';
    }
    
    // Set the final height and state
    setCurrentHeight(targetHeight);
    setPanelState(targetState);
  }, [currentHeight, collapsedHeight, partialHeight, fullHeight, onClose]);

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
          transition: isDragging ? 'none' : 'height 0.3s ease-out, transform 0.3s ease-out',
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
            }}
          >
            {/* Handle indicator - draggable area */}
            <div
              className="w-12 h-1 rounded-full my-2"
              onClick={handleDoubleTap}
              style={{
                backgroundColor: 'var(--zen-text-muted, #78716c)',
                opacity: 0.3,
              }}
            />
            {/* Tabs */}
            <div className="flex gap-1 w-full px-4 pb-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabChange('translation');
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
                  onTabChange('note');
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
                  onTabChange('chat');
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

          {/* Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {children && (
              <ScrollableContent onScrollToBottom={onClose}>
                {children}
              </ScrollableContent>
            )}
            {!children && activeTab === 'note' && noteContent && (
              <ScrollableContent onScrollToBottom={onClose}>
                {noteContent}
              </ScrollableContent>
            )}
            {!children && activeTab === 'chat' && chatContent && (
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
