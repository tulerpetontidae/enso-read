'use client';

import { useEffect } from 'react';
import { db } from '@/lib/db';
import { applyTheme } from './SettingsModal';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const themeSetting = await db.settings.get('theme');
                const theme = themeSetting?.value || 'light';
                applyTheme(theme);
            } catch (e) {
                console.error('Failed to load theme:', e);
                applyTheme('light');
            }
        };
        loadTheme();
    }, []);

    return <>{children}</>;
}

