'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current viewport is mobile (< 768px)
 * Uses window.matchMedia to track screen size changes
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if window is available (client-side only)
    if (typeof window === 'undefined') {
      return;
    }

    // Create media query matcher (Tailwind's md breakpoint is 768px)
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    
    // Set initial value
    setIsMobile(mediaQuery.matches);

    // Handler to update state when media query changes
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    // Add listener (modern browsers use addEventListener, older use addListener)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    // Cleanup
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  return isMobile;
}
