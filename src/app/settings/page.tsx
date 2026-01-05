'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import Link from 'next/link';
import { FaChevronLeft } from 'react-icons/fa';
import { IoEye, IoEyeOff } from 'react-icons/io5';
import { FONT_OPTIONS, WIDTH_OPTIONS, THEME_OPTIONS, applyTheme } from '@/components/SettingsModal';

export default function SettingsPage() {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [selectedFont, setSelectedFont] = useState('noto-serif');
    const [selectedWidth, setSelectedWidth] = useState('medium');
    const [selectedTheme, setSelectedTheme] = useState('light');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Load existing settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const [apiKeySetting, fontSetting, widthSetting, themeSetting] = await Promise.all([
                    db.settings.get('openai_api_key'),
                    db.settings.get('reader_font'),
                    db.settings.get('reader_width'),
                    db.settings.get('theme'),
                ]);
                if (apiKeySetting?.value) setApiKey(apiKeySetting.value);
                if (fontSetting?.value) setSelectedFont(fontSetting.value);
                if (widthSetting?.value) setSelectedWidth(widthSetting.value);
                if (themeSetting?.value) setSelectedTheme(themeSetting.value);
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);

        try {
            await Promise.all([
                db.settings.put({ key: 'openai_api_key', value: apiKey.trim() }),
                db.settings.put({ key: 'reader_font', value: selectedFont }),
                db.settings.put({ key: 'reader_width', value: selectedWidth }),
                db.settings.put({ key: 'theme', value: selectedTheme }),
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
                                                : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300'
                                        }`}
                                        style={{ fontFamily: font.fontFamily }}
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
                                                : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300'
                                        }`}
                                    >
                                        {width.label}
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
                                Configure your OpenAI API key for paragraph translation.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>
                                OpenAI API Key
                            </label>
                            <p className="text-xs mb-2" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Uses the cost-efficient gpt-5.2 model. Get your key from{' '}
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
                                    className="w-full px-4 py-3 pr-12 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 transition-colors"
                                >
                                    {showKey ? <IoEyeOff size={18} /> : <IoEye size={18} />}
                                </button>
                            </div>
                        </div>
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
                <div className="mt-8 p-6 bg-stone-50 rounded-2xl border border-stone-100">
                    <h3 className="text-sm font-medium text-stone-700 mb-2">How Translation Works</h3>
                    <ul className="text-sm text-stone-500 space-y-2">
                        <li>• Hover near a paragraph to see the translate button</li>
                        <li>• Click to translate Japanese text to English</li>
                        <li>• Translations are cached locally - no repeat API calls</li>
                        <li>• Your API key is stored securely in your browser</li>
                    </ul>
                </div>

                {/* 10ten Recommendation */}
                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200">
                    <h3 className="text-sm font-medium text-amber-800 mb-2">Recommended Extension</h3>
                    <p className="text-sm text-amber-700">
                        For instant word lookups while reading, install the{' '}
                        <a 
                            href="https://github.com/birchill/10ten-ja-reader"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline hover:text-amber-900"
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

