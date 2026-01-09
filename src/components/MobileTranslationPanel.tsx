'use client';

import React, { useEffect, useRef, useState } from 'react';
import { IoTrashOutline, IoClose } from 'react-icons/io5';

interface MobileTranslationPanelProps {
  translation: string;
  paragraphRef: React.RefObject<HTMLElement | null>;
  isVisible: boolean;
  onClose: () => void;
  onRedoTranslation: () => void;
  isLoading?: boolean;
}

/**
 * Mobile translation panel that appears below the activated paragraph
 * with independent scrolling and auto-hide functionality
 */
export default function MobileTranslationPanel({
  translation,
  paragraphRef,
  isVisible,
  onClose,
  onRedoTranslation,
  isLoading = false,
}: MobileTranslationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [shouldHide, setShouldHide] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track paragraph visibility using Intersection Observer
  useEffect(() => {
    if (!isVisible || !paragraphRef.current) return;

    const paragraph = paragraphRef.current;
    const threshold = 300; // Hide when paragraph is more than 300px away from viewport

    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Debounce scroll handler
      scrollTimeoutRef.current = setTimeout(() => {
        if (!paragraph || !panelRef.current) return;

        const paragraphRect = paragraph.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Calculate distance from paragraph to viewport
        // If paragraph is above viewport
        const distanceAbove = paragraphRect.top < 0 ? Math.abs(paragraphRect.top) : 0;
        // If paragraph is below viewport
        const distanceBelow = paragraphRect.bottom > viewportHeight 
          ? paragraphRect.bottom - viewportHeight 
          : 0;

        const maxDistance = Math.max(distanceAbove, distanceBelow);

        // Hide if paragraph is significantly away from viewport
        if (maxDistance > threshold) {
          setShouldHide(true);
        } else {
          setShouldHide(false);
        }
      }, 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isVisible, paragraphRef]);

  // Reset shouldHide when visibility changes
  useEffect(() => {
    if (!isVisible) {
      setShouldHide(false);
    }
  }, [isVisible]);

  if (!isVisible || shouldHide) return null;

  // Calculate position below paragraph
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  
  useEffect(() => {
    if (!isVisible || !paragraphRef.current) return;

    const updatePosition = () => {
      const paragraph = paragraphRef.current;
      if (!paragraph) return;

      const rect = paragraph.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

      // Position panel below the paragraph, but ensure it stays within viewport
      const topPos = rect.bottom + scrollTop + 8; // 8px spacing
      const maxTop = window.innerHeight + scrollTop - 100; // Leave 100px at bottom for panel
      
      // Position panel below the paragraph
      setPosition({
        top: Math.min(topPos, maxTop),
        left: scrollLeft + 16, // 16px margin from left edge
        width: window.innerWidth - 32, // Full width minus margins
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, paragraphRef]);

  return (
    <div
      ref={panelRef}
      className="fixed z-40 md:hidden animate-in fade-in slide-in-from-top-2 duration-300"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        maxHeight: '40vh',
      }}
    >
      <div
        className="rounded-lg shadow-lg overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--zen-translation-bg, rgba(255, 241, 242, 0.95))',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--zen-translation-border, #fecdd3)',
        }}
      >
        {/* Header */}
        <div className="px-3 py-2 flex items-center justify-between shrink-0 border-b"
          style={{ borderColor: 'var(--zen-translation-border, #fecdd3)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--zen-translation-text, #57534e)' }}>
            Translation
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onRedoTranslation}
              disabled={isLoading}
              className="p-1 rounded-full hover:bg-black/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: 'var(--zen-translation-text, #57534e)' }}
              title="Clear and retranslate"
            >
              <IoTrashOutline size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-black/10 transition-colors"
              style={{ color: 'var(--zen-translation-text, #57534e)' }}
              title="Close translation"
            >
              <IoClose size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          className="px-4 py-3 overflow-y-auto"
          style={{
            color: 'var(--zen-translation-text, #57534e)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            lineHeight: '1.6',
          }}
        >
          {translation}
        </div>
      </div>
    </div>
  );
}
