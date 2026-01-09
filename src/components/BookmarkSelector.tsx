'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db, type BookmarkGroup } from '@/lib/db';
import { IoBookmark, IoBookmarkOutline, IoSettingsOutline, IoClose } from 'react-icons/io5';
import BookmarkSettingsModal from './BookmarkSettingsModal';
import { useIsMobile } from '@/hooks/useIsMobile';

interface BookmarkSelectorProps {
  bookId: string;
  paragraphHash: string;
  currentColorGroupId: string | null;
  onSelect: (colorGroupId: string | null) => void;
  onClose: () => void;
  buttonRef?: React.RefObject<HTMLElement | null>; // Reference to the button that opened this
}

export default function BookmarkSelector({
  bookId,
  paragraphHash,
  currentColorGroupId,
  onSelect,
  onClose,
  buttonRef,
}: BookmarkSelectorProps) {
  const isMobile = useIsMobile();
  const [groups, setGroups] = useState<BookmarkGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const loadGroups = async () => {
    try {
      const allGroups = await db.bookmarkGroups.orderBy('order').toArray();
      setGroups(allGroups);
    } catch (e) {
      console.error('Failed to load bookmark groups:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  // Reload groups when settings modal closes or when component mounts
  useEffect(() => {
    if (!isSettingsOpen) {
      loadGroups();
    }
  }, [isSettingsOpen]);

  // Calculate position for desktop to ensure it's visible on screen
  useEffect(() => {
    if (!isMobile && buttonRef?.current) {
      const calculatePosition = () => {
        if (!buttonRef?.current) return;
        
        const buttonRect = buttonRef.current.getBoundingClientRect();
        const selectorWidth = 192; // w-48 = 192px
        const estimatedSelectorHeight = 300; // Estimate height before render
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 16;

        let left = buttonRect.right + 8; // Default: to the right of button
        let top = buttonRect.top;

        // If it would go off the right edge, position to the left instead
        if (left + selectorWidth + padding > viewportWidth) {
          left = buttonRect.left - selectorWidth - 8;
        }

        // Ensure it doesn't go off the left edge
        if (left < padding) {
          left = padding;
        }

        // Ensure it doesn't go off the bottom
        if (top + estimatedSelectorHeight + padding > viewportHeight) {
          top = viewportHeight - estimatedSelectorHeight - padding;
        }

        // Ensure it doesn't go off the top
        if (top < padding) {
          top = padding;
        }

        setPosition({ top, left });
      };

      // Calculate position immediately
      calculatePosition();

      // Also recalculate when groups load (affects height)
      if (groups.length > 0 || !isLoading) {
        // Use a small delay to ensure DOM is ready
        const timeoutId = setTimeout(calculatePosition, 50);
        return () => clearTimeout(timeoutId);
      }
    } else if (!isMobile) {
      // If no buttonRef, center it (fallback)
      setPosition({ top: window.innerHeight / 2 - 150, left: window.innerWidth / 2 - 96 });
    }
  }, [isMobile, buttonRef, groups.length, isLoading]);

  // Calculate position for desktop to ensure it's visible on screen
  useEffect(() => {
    if (!isMobile && !position && buttonRef?.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const selectorWidth = 192;
      const viewportWidth = window.innerWidth;
      const padding = 16;
      
      let left = buttonRect.right + 8;
      if (left + selectorWidth + padding > viewportWidth) {
        left = buttonRect.left - selectorWidth - 8;
      }
      if (left < padding) {
        left = padding;
      }
      
      setPosition({ top: buttonRect.top, left });
    }
  }, [isMobile, position, buttonRef]);

  // Handle clicks outside the selector to close it
  useEffect(() => {
    // Only set up click outside handler for mobile (desktop uses different positioning)
    if (isMobile) {
      let cleanup: (() => void) | null = null;
      
      // Small delay to prevent immediate closing when opening
      const timeoutId = setTimeout(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
          if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
            // Only close if clicking outside the selector
            onClose();
          }
        };

        // Add event listeners with capture phase to catch events early
        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('touchstart', handleClickOutside, true);

        cleanup = () => {
          document.removeEventListener('mousedown', handleClickOutside, true);
          document.removeEventListener('touchstart', handleClickOutside, true);
        };
      }, 150);

      return () => {
        clearTimeout(timeoutId);
        if (cleanup) {
          cleanup();
        }
      };
    }
  }, [onClose, isMobile]);

  const handleSelect = async (colorGroupId: string | null) => {
    const bookmarkId = `${bookId}-${paragraphHash}`;
    
    if (colorGroupId === null) {
      // Remove bookmark
      try {
        await db.bookmarks.delete(bookmarkId);
        onSelect(null);
      } catch (e) {
        console.error('Failed to remove bookmark:', e);
      }
    } else {
      // Add or update bookmark
      try {
        // Ensure we have the latest group data before selecting
        await loadGroups();
        
        await db.bookmarks.put({
          id: bookmarkId,
          bookId,
          paragraphHash,
          colorGroupId,
          createdAt: currentColorGroupId ? Date.now() : Date.now(), // Preserve original if updating
          updatedAt: Date.now(),
        });
        onSelect(colorGroupId);
      } catch (e) {
        console.error('Failed to save bookmark:', e);
      }
    }
    onClose();
  };

  // Mobile: Modal overlay with backdrop
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          style={{
            animation: 'fadeIn 0.2s ease-out',
          }}
        />
        
        {/* Modal Content */}
        <div
          ref={selectorRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{
              backgroundColor: 'var(--zen-note-bg, white)',
              borderWidth: '2px',
              borderStyle: 'solid',
              borderColor: 'var(--zen-note-border, #fcd34d)',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-4 py-3 flex items-center justify-between shrink-0"
              style={{
                backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
                borderBottomWidth: '1px',
                borderBottomStyle: 'solid',
                borderBottomColor: 'var(--zen-note-border, #fde68a)',
              }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--zen-note-header-text, #b45309)' }}>
                Select Bookmark
              </span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-amber-200 transition-colors"
                style={{ color: 'var(--zen-note-header-text, #b45309)' }}
              >
                <IoClose size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="p-6 text-center text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                  Loading...
                </div>
              ) : (
                <div className="py-2">
                  {/* None option */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(null);
                    }}
                    className="w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors"
                    style={{
                      color: currentColorGroupId === null ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                      backgroundColor: currentColorGroupId === null ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent',
                    }}
                  >
                    <IoBookmarkOutline size={18} />
                    <span className="font-medium">None</span>
                  </button>

                  {/* Bookmark groups */}
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(group.id);
                      }}
                      className="w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors"
                      style={{
                        color: currentColorGroupId === group.id ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                        backgroundColor: currentColorGroupId === group.id ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent',
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                      {currentColorGroupId === group.id ? (
                        <IoBookmark size={18} />
                      ) : (
                        <IoBookmarkOutline size={18} />
                      )}
                      <span className="font-medium flex-1">{group.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer with settings button */}
            <div
              className="px-4 py-3 border-t shrink-0"
              style={{
                borderColor: 'var(--zen-note-border, #fde68a)',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSettingsOpen(true);
                }}
                className="w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
                  color: 'var(--zen-note-header-text, #b45309)',
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <IoSettingsOutline size={16} />
                  <span>Manage Groups</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <BookmarkSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </>
    );
  }

  // Desktop: Calculate fallback position if not set
  const desktopPosition = position || (buttonRef?.current ? (() => {
    try {
      const buttonRect = buttonRef.current!.getBoundingClientRect();
      const selectorWidth = 192;
      const viewportWidth = window.innerWidth;
      const padding = 16;
      
      let left = buttonRect.right + 8;
      if (left + selectorWidth + padding > viewportWidth) {
        left = buttonRect.left - selectorWidth - 8;
      }
      if (left < padding) {
        left = padding;
      }
      
      return { top: buttonRect.top, left };
    } catch (e) {
      return null;
    }
  })() : null);

  return (
    <>
      {desktopPosition && (
        <div
          ref={selectorRef}
          className="fixed z-40 w-48 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-2 duration-200"
          style={{
            top: `${desktopPosition.top}px`,
            left: `${desktopPosition.left}px`,
            backgroundColor: 'var(--zen-note-bg, white)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--zen-note-border, #fcd34d)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{
              backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
              borderBottomWidth: '1px',
              borderBottomStyle: 'solid',
              borderBottomColor: 'var(--zen-note-border, #fde68a)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--zen-note-header-text, #b45309)' }}>
              Bookmark
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen(true);
              }}
              className="p-1 hover:bg-amber-200 rounded transition-colors"
              style={{ color: 'var(--zen-note-header-text, #b45309)' }}
              title="Manage bookmark groups"
            >
              <IoSettingsOutline size={14} />
            </button>
          </div>
          <div className="py-2">
            {isLoading ? (
              <div className="p-3 text-center text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                Loading...
              </div>
            ) : (
              <>
                {/* None option */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(null);
                  }}
                  className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors"
                  style={{
                    color: currentColorGroupId === null ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                    backgroundColor: currentColorGroupId === null ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (currentColorGroupId !== null) {
                      e.currentTarget.style.backgroundColor = 'var(--zen-accent-bg, rgba(255,255,255,0.5))';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentColorGroupId !== null) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <IoBookmarkOutline size={14} />
                  <span>None</span>
                </button>

                {/* Bookmark groups */}
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(group.id);
                    }}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors"
                    style={{
                      color: currentColorGroupId === group.id ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                      backgroundColor: currentColorGroupId === group.id ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (currentColorGroupId !== group.id) {
                        e.currentTarget.style.backgroundColor = 'var(--zen-accent-bg, rgba(255,255,255,0.5))';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentColorGroupId !== group.id) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                    {currentColorGroupId === group.id ? (
                      <IoBookmark size={14} />
                    ) : (
                      <IoBookmarkOutline size={14} />
                    )}
                    <span className="truncate">{group.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      <BookmarkSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
