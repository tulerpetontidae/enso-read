'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import Link from 'next/link';
import { FaChevronLeft } from 'react-icons/fa';
import { IoEye, IoEyeOff } from 'react-icons/io5';
import { FONT_OPTIONS, WIDTH_OPTIONS, FONT_SIZE_OPTIONS, THEME_OPTIONS, applyTheme } from '@/components/SettingsModal';
import { checkGoogleTranslateAvailable } from '@/lib/browser';
import type { TranslationEngine } from '@/lib/translation';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';

export default function SettingsPage() {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [selectedFont, setSelectedFont] = useState('noto-serif');
    const [selectedWidth, setSelectedWidth] = useState('medium');
    const [selectedFontSize, setSelectedFontSize] = useState('medium');
    const [selectedTheme, setSelectedTheme] = useState('light');
    const [selectedEngine, setSelectedEngine] = useState<TranslationEngine>('openai');
    const [targetLanguage, setTargetLanguage] = useState<string>('en');
    const [googleAvailable, setGoogleAvailable] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Check Google Translate availability
    useEffect(() => {
        checkGoogleTranslateAvailable().then(setGoogleAvailable);
    }, []);

    // Load existing settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const [apiKeySetting, fontSetting, widthSetting, fontSizeSetting, themeSetting, engineSetting, targetLangSetting] = await Promise.all([
                    db.settings.get('openai_api_key'),
                    db.settings.get('reader_font'),
                    db.settings.get('reader_width'),
                    db.settings.get('reader_font_size'),
                    db.settings.get('theme'),
                    db.settings.get('translation_engine'),
                    db.settings.get('target_language'),
                ]);
                if (apiKeySetting?.value) setApiKey(apiKeySetting.value);
                if (fontSetting?.value) setSelectedFont(fontSetting.value);
                if (widthSetting?.value) setSelectedWidth(widthSetting.value);
                if (fontSizeSetting?.value) setSelectedFontSize(fontSizeSetting.value);
                if (themeSetting?.value) setSelectedTheme(themeSetting.value);
                if (targetLangSetting?.value) setTargetLanguage(targetLangSetting.value);
                
                // Determine engine: use saved, or auto-select based on availability
                if (engineSetting?.value === 'google' || engineSetting?.value === 'openai') {
                    setSelectedEngine(engineSetting.value as TranslationEngine);
                } else {
                    // Auto-select: prefer Google if available, else OpenAI if key exists
                    const googleAvail = await checkGoogleTranslateAvailable();
                    if (googleAvail) {
                        setSelectedEngine('google');
                    } else if (apiKeySetting?.value) {
                        setSelectedEngine('openai');
                    }
                }
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        };
        loadSettings();
    }, []);
    
    // Live preview theme
    useEffect(() => {
        applyTheme(selectedTheme);
    }, [selectedTheme]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);

        try {
            await Promise.all([
                db.settings.put({ key: 'openai_api_key', value: apiKey.trim() }),
                db.settings.put({ key: 'reader_font', value: selectedFont }),
                db.settings.put({ key: 'reader_width', value: selectedWidth }),
                db.settings.put({ key: 'reader_font_size', value: selectedFontSize }),
                db.settings.put({ key: 'theme', value: selectedTheme }),
                db.settings.put({ key: 'translation_engine', value: selectedEngine }),
                db.settings.put({ key: 'target_language', value: targetLanguage }),
            ]);
            applyTheme(selectedTheme);
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => {
                setSaveMessage(null);
            }, 3000);
        } catch (e) {
            console.error('Failed to save settings:', e);
            setSaveMessage('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--zen-bg, #FDFBF7)' }}>
            {/* Header */}
            <header className="h-14 flex items-center px-4 border-b" style={{ borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
                <Link href="/" className="p-2 transition-colors" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                    <FaChevronLeft size={16} />
                </Link>
                <h1 className="ml-4 text-xl font-serif font-medium" style={{ color: 'var(--zen-heading, #1c1917)' }}>Settings</h1>
            </header>

            {/* Content */}
            <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
                {/* Reading Settings */}
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--zen-card-solid-bg, white)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
                    <div className="p-6 space-y-6">
                        <div>
                            <h2 className="text-lg font-serif font-medium mb-1" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                                Reading Settings
                            </h2>
                            <p className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Customize your reading experience.
                            </p>
                        </div>

                        {/* Font Selection */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Font</label>
                            <div className="grid grid-cols-2 gap-3">
                                {FONT_OPTIONS.map((font) => (
                                    <button
                                        key={font.value}
                                        onClick={() => setSelectedFont(font.value)}
                                        className={`px-4 py-4 rounded-xl border text-left transition-all ${
                                            selectedFont === font.value
                                                ? 'border-rose-300 bg-rose-50 text-rose-700'
                                                : ''
                                        }`}
                                        style={{ 
                                            fontFamily: font.fontFamily,
                                            ...(selectedFont !== font.value ? {
                                                backgroundColor: 'var(--zen-btn-bg)',
                                                borderColor: 'var(--zen-btn-border)',
                                                color: 'var(--zen-btn-text)'
                                            } : {})
                                        }}
                                    >
                                        <span className="text-sm block mb-1">{font.label}</span>
                                        <span className="text-2xl">読書の楽しみ</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Width Selection */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Text Width</label>
                            <div className="flex gap-3">
                                {WIDTH_OPTIONS.map((width) => (
                                    <button
                                        key={width.value}
                                        onClick={() => setSelectedWidth(width.value)}
                                        className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                                            selectedWidth === width.value
                                                ? 'border-rose-300 bg-rose-50 text-rose-700'
                                                : ''
                                        }`}
                                        style={selectedWidth !== width.value ? {
                                            backgroundColor: 'var(--zen-btn-bg)',
                                            borderColor: 'var(--zen-btn-border)',
                                            color: 'var(--zen-btn-text)'
                                        } : undefined}
                                    >
                                        {width.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Font Size Selection */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Font Size</label>
                            <div className="grid grid-cols-4 gap-3">
                                {FONT_SIZE_OPTIONS.map((size) => (
                                    <button
                                        key={size.value}
                                        onClick={() => setSelectedFontSize(size.value)}
                                        className={`px-2 py-3 rounded-xl border text-center transition-all flex flex-col items-center justify-end gap-1 h-24 ${
                                            selectedFontSize === size.value
                                                ? 'border-rose-300 bg-rose-50'
                                                : ''
                                        }`}
                                        style={selectedFontSize !== size.value ? {
                                            backgroundColor: 'var(--zen-btn-bg)',
                                            borderColor: 'var(--zen-btn-border)',
                                        } : undefined}
                                    >
                                        <span 
                                            className="font-serif leading-none"
                                            style={{ 
                                                fontSize: `${size.displaySize}px`,
                                                color: selectedFontSize === size.value ? '#be123c' : 'var(--zen-btn-text)'
                                            }}
                                        >
                                            あ
                                        </span>
                                        <span 
                                            className="text-xs"
                                            style={{ color: selectedFontSize === size.value ? '#e11d48' : 'var(--zen-text-muted)' }}
                                        >
                                            {size.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Theme Selection */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Theme</label>
                            <div className="flex gap-3">
                                {THEME_OPTIONS.map((theme) => (
                                    <button
                                        key={theme.value}
                                        onClick={() => setSelectedTheme(theme.value)}
                                        className={`flex-1 px-4 py-4 rounded-xl border-2 text-sm font-medium transition-all flex flex-col items-center gap-2 ${
                                            selectedTheme === theme.value
                                                ? 'border-rose-400 ring-2 ring-rose-200'
                                                : 'hover:border-stone-300'
                                        }`}
                                        style={{ borderColor: selectedTheme === theme.value ? undefined : 'var(--zen-border, #e7e5e4)' }}
                                    >
                                        <div className={`w-10 h-10 rounded-full border-2 ${theme.preview}`} />
                                        <span style={{ color: 'var(--zen-text-muted, #57534e)' }}>{theme.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Translation Settings */}
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--zen-card-solid-bg, white)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
                    <div className="p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-serif font-medium mb-1" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                                Translation Settings
                            </h2>
                            <p className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Choose your translation engine and configure API keys.
                            </p>
                        </div>

                        {/* Translation Engine Selection */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Translation Engine</label>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setSelectedEngine('google')}
                                    disabled={!googleAvailable}
                                    className={`flex-1 px-4 py-4 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-2 ${
                                        selectedEngine === 'google'
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                    } ${!googleAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    style={selectedEngine !== 'google' ? {
                                        borderColor: 'var(--zen-border)'
                                    } : undefined}
                                >
                                    <span style={{ color: 'var(--zen-text)' }}>Google Translate</span>
                                    {!googleAvailable && (
                                        <span className="text-xs" style={{ color: 'var(--zen-text-muted)' }}>Unavailable</span>
                                    )}
                                    {googleAvailable && selectedEngine === 'google' && (
                                        <span className="text-xs" style={{ color: 'var(--zen-text-muted)' }}>Free</span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setSelectedEngine('openai')}
                                    className={`flex-1 px-4 py-4 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-2 ${
                                        selectedEngine === 'openai'
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                    }`}
                                    style={selectedEngine !== 'openai' ? {
                                        borderColor: 'var(--zen-border)'
                                    } : undefined}
                                >
                                    <span style={{ color: 'var(--zen-text)' }}>OpenAI</span>
                                    <span className="text-xs" style={{ color: 'var(--zen-text-muted)' }}>gpt-5.2</span>
                                </button>
                            </div>
                        </div>

                        {/* Target Language Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Target Language</label>
                            <select
                                value={targetLanguage}
                                onChange={(e) => setTargetLanguage(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all"
                                style={{
                                    backgroundColor: 'var(--zen-btn-bg)',
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: 'var(--zen-btn-border)',
                                    color: 'var(--zen-text)',
                                }}
                            >
                                {SUPPORTED_LANGUAGES.map((lang) => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.nativeName} ({lang.englishName})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* OpenAI API Key */}
                        {selectedEngine === 'openai' && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>
                                    OpenAI API Key
                                </label>
                                <p className="text-xs mb-2" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                    Required for OpenAI translation. Get your key from{' '}
                                    <a 
                                        href="https://platform.openai.com/api-keys" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-rose-500 hover:text-rose-600 underline"
                                    >
                                        OpenAI Platform
                                    </a>
                                </p>
                                <div className="relative">
                                    <input
                                        type={showKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full px-4 py-3 pr-12 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all"
                                        style={{
                                            backgroundColor: 'var(--zen-btn-bg)',
                                            borderWidth: '1px',
                                            borderStyle: 'solid',
                                            borderColor: 'var(--zen-btn-border)',
                                            color: 'var(--zen-text)',
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey(!showKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                                        style={{ color: 'var(--zen-text-muted)' }}
                                    >
                                        {showKey ? <IoEyeOff size={18} /> : <IoEye size={18} />}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                    {saveMessage && (
                        <span className={`text-sm ${saveMessage.includes('success') ? 'text-emerald-600' : 'text-red-500'}`}>
                            {saveMessage}
                        </span>
                    )}
                </div>

                {/* Info Section */}
                <div 
                    className="mt-8 p-6 rounded-2xl"
                    style={{
                        backgroundColor: 'var(--zen-info-bg)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'var(--zen-info-border)'
                    }}
                >
                    <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--zen-info-heading)' }}>How Translation Works</h3>
                    <ul className="text-sm space-y-2" style={{ color: 'var(--zen-info-text)' }}>
                        <li>• Hover near a paragraph to see the translate button</li>
                        <li>• Click to translate Japanese text to English</li>
                        <li>• Translations are cached locally - no repeat API calls</li>
                        <li>• Your API key is stored securely in your browser</li>
                    </ul>
                </div>

                {/* 10ten Recommendation */}
                <div 
                    className="p-6 rounded-2xl"
                    style={{
                        backgroundColor: 'var(--zen-recommend-bg)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'var(--zen-recommend-border)'
                    }}
                >
                    <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--zen-recommend-heading)' }}>Recommended Extension</h3>
                    <p className="text-sm" style={{ color: 'var(--zen-recommend-text)' }}>
                        For instant word lookups while reading, install the{' '}
                        <a 
                            href="https://github.com/birchill/10ten-ja-reader"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline"
                        >
                            10ten Japanese Reader
                        </a>{' '}
                        browser extension. Simply hover over any Japanese word to see its reading and meaning.
                    </p>
                </div>
            </main>
        </div>
    );
}

