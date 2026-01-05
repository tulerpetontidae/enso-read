'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { IoClose, IoEye, IoEyeOff } from 'react-icons/io5';

export const FONT_OPTIONS = [
    { value: 'noto-serif', label: 'Noto Serif JP', fontFamily: 'var(--font-noto-serif-jp), serif' },
    { value: 'noto-sans', label: 'Noto Sans JP', fontFamily: 'var(--font-noto-sans-jp), sans-serif' },
];

export const WIDTH_OPTIONS = [
    { value: 'narrow', label: 'Narrow', maxWidth: '600px' },
    { value: 'medium', label: 'Medium', maxWidth: '768px' },
    { value: 'wide', label: 'Wide', maxWidth: '960px' },
];

export const THEME_OPTIONS = [
    { value: 'light', label: 'Light', preview: 'bg-[#FDFBF7] border-stone-200' },
    { value: 'sepia', label: 'Sepia', preview: 'bg-[#F5F0E6] border-amber-200' },
    { value: 'dark', label: 'Dark', preview: 'bg-[#0a0a0a] border-stone-700' },
];

// Apply theme to document
export function applyTheme(theme: string) {
    document.documentElement.classList.remove('theme-light', 'theme-sepia', 'theme-dark');
    document.documentElement.classList.add(`theme-${theme}`);
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSettingsChange?: () => void;
}

export default function SettingsModal({ isOpen, onClose, onSettingsChange }: SettingsModalProps) {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [selectedFont, setSelectedFont] = useState('noto-serif');
    const [selectedWidth, setSelectedWidth] = useState('medium');
    const [selectedTheme, setSelectedTheme] = useState('light');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Load existing settings on mount
    useEffect(() => {
        if (isOpen) {
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
        }
    }, [isOpen]);

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
            onSettingsChange?.();
            setTimeout(() => {
                setSaveMessage(null);
            }, 2000);
        } catch (e) {
            console.error('Failed to save settings:', e);
            setSaveMessage('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
                    <h2 className="text-xl font-serif font-medium text-stone-800">Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                    >
                        <IoClose size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 space-y-6 max-h-[60vh] overflow-y-auto">
                    {/* Reading Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-stone-800 uppercase tracking-wide">Reading</h3>
                        
                        {/* Font Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-stone-700">Font</label>
                            <div className="grid grid-cols-2 gap-2">
                                {FONT_OPTIONS.map((font) => (
                                    <button
                                        key={font.value}
                                        onClick={() => setSelectedFont(font.value)}
                                        className={`px-4 py-3 rounded-xl border text-left transition-all ${
                                            selectedFont === font.value
                                                ? 'border-rose-300 bg-rose-50 text-rose-700'
                                                : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300'
                                        }`}
                                        style={{ fontFamily: font.fontFamily }}
                                    >
                                        <span className="text-sm">{font.label}</span>
                                        <br />
                                        <span className="text-lg">読書</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Width Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-stone-700">Text Width</label>
                            <div className="flex gap-2">
                                {WIDTH_OPTIONS.map((width) => (
                                    <button
                                        key={width.value}
                                        onClick={() => setSelectedWidth(width.value)}
                                        className={`flex-1 px-4 py-2 rounded-xl border text-sm transition-all ${
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
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-stone-700">Theme</label>
                            <div className="flex gap-2">
                                {THEME_OPTIONS.map((theme) => (
                                    <button
                                        key={theme.value}
                                        onClick={() => setSelectedTheme(theme.value)}
                                        className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-2 ${
                                            selectedTheme === theme.value
                                                ? 'border-rose-400 ring-2 ring-rose-200'
                                                : 'border-stone-200 hover:border-stone-300'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full border-2 ${theme.preview}`} />
                                        <span className="text-stone-600">{theme.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <hr className="border-stone-100" />

                    {/* Translation Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-stone-800 uppercase tracking-wide">Translation</h3>
                        
                        {/* OpenAI API Key */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-stone-700">
                                OpenAI API Key
                            </label>
                            <p className="text-xs text-stone-500 mb-2">
                                Required for paragraph translation. Get your key from{' '}
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

                    {/* Save message */}
                    {saveMessage && (
                        <div className={`text-sm ${saveMessage.includes('success') ? 'text-emerald-600' : 'text-red-500'}`}>
                            {saveMessage}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-stone-600 hover:text-stone-800 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

