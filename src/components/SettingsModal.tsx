'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { IoClose, IoEye, IoEyeOff } from 'react-icons/io5';
import { checkGoogleTranslateAvailable } from '@/lib/browser';
import type { TranslationEngine } from '@/lib/translation';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';

export const FONT_OPTIONS = [
    { value: 'serif', label: 'Serif', fontFamily: 'var(--font-noto-serif-jp), "Times New Roman", Times, serif' },
    { value: 'sans', label: 'Sans Serif', fontFamily: 'var(--font-noto-sans-jp), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
];

export const WIDTH_OPTIONS = [
    { value: 'narrow', label: 'Narrow', maxWidth: '600px' },
    { value: 'medium', label: 'Medium', maxWidth: '768px' },
    { value: 'wide', label: 'Wide', maxWidth: '960px' },
];

export const FONT_SIZE_OPTIONS = [
    { value: 'compact', label: 'Compact', size: '14px', displaySize: 12 },
    { value: 'small', label: 'Small', size: '16px', displaySize: 14 },
    { value: 'medium', label: 'Medium', size: '18px', displaySize: 16 },
    { value: 'large', label: 'Large', size: '22px', displaySize: 20 },
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
    const [selectedFontSize, setSelectedFontSize] = useState('medium');
    const [selectedTheme, setSelectedTheme] = useState('light');
    const [selectedEngine, setSelectedEngine] = useState<TranslationEngine>('openai');
    const [targetLanguage, setTargetLanguage] = useState<string>('en');
    const [googleAvailable, setGoogleAvailable] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    
    // Store initial values to revert on cancel
    const initialValuesRef = useRef<{
        font: string;
        width: string;
        fontSize: string;
        theme: string;
        engine: TranslationEngine;
    } | null>(null);

    // Check Google Translate availability
    useEffect(() => {
        if (isOpen) {
            checkGoogleTranslateAvailable().then(setGoogleAvailable);
        }
    }, [isOpen]);

    // Load existing settings on mount
    useEffect(() => {
        if (isOpen) {
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
                    const font = fontSetting?.value || 'noto-serif';
                    const width = widthSetting?.value || 'medium';
                    const fontSize = fontSizeSetting?.value || 'medium';
                    const theme = themeSetting?.value || 'light';
                    
                    // Determine engine: use saved, or auto-select based on availability
                    let engine: TranslationEngine = 'openai';
                    if (engineSetting?.value === 'google' || engineSetting?.value === 'openai') {
                        engine = engineSetting.value as TranslationEngine;
                    } else {
                        // Auto-select: prefer Google if available, else OpenAI if key exists
                        const googleAvail = await checkGoogleTranslateAvailable();
                        if (googleAvail) {
                            engine = 'google';
                        } else if (apiKeySetting?.value) {
                            engine = 'openai';
                        }
                    }
                    
                    if (apiKeySetting?.value) setApiKey(apiKeySetting.value);
                    const targetLang = targetLangSetting?.value || 'en';
                    setSelectedFont(font);
                    setSelectedWidth(width);
                    setSelectedFontSize(fontSize);
                    setSelectedTheme(theme);
                    setSelectedEngine(engine);
                    setTargetLanguage(targetLang);
                    
                    // Store initial values for reverting
                    initialValuesRef.current = { font, width, fontSize, theme, engine };
                } catch (e) {
                    console.error('Failed to load settings:', e);
                }
            };
            loadSettings();
        }
    }, [isOpen]);
    
    // Live preview: apply theme immediately when changed
    useEffect(() => {
        if (isOpen) {
            applyTheme(selectedTheme);
        }
    }, [selectedTheme, isOpen]);
    
    // Live preview: notify parent of changes for font/width/size
    useEffect(() => {
        if (isOpen) {
            onSettingsChange?.();
        }
    }, [selectedFont, selectedWidth, selectedFontSize, isOpen]);

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
            // Update initial values after successful save
            initialValuesRef.current = { 
                font: selectedFont, 
                width: selectedWidth, 
                fontSize: selectedFontSize, 
                theme: selectedTheme,
                engine: selectedEngine
            };
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
    
    const handleCancel = () => {
        // Revert to initial values
        if (initialValuesRef.current) {
            setSelectedFont(initialValuesRef.current.font);
            setSelectedWidth(initialValuesRef.current.width);
            setSelectedFontSize(initialValuesRef.current.fontSize);
            setSelectedTheme(initialValuesRef.current.theme);
            setSelectedEngine(initialValuesRef.current.engine);
            applyTheme(initialValuesRef.current.theme);
            onSettingsChange?.();
        }
        onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleCancel();
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div 
                className="rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                style={{ backgroundColor: 'var(--zen-card-solid-bg, white)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div 
                    className="flex items-center justify-between px-6 py-4 border-b"
                    style={{ borderColor: 'var(--zen-border)' }}
                >
                    <h2 className="text-xl font-serif font-medium" style={{ color: 'var(--zen-heading)' }}>Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full transition-colors"
                        style={{ color: 'var(--zen-text-muted)' }}
                    >
                        <IoClose size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 space-y-6 max-h-[60vh] overflow-y-auto">
                    {/* Reading Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--zen-heading)' }}>Reading</h3>
                        
                        {/* Font Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text)' }}>Font</label>
                            <div className="grid grid-cols-2 gap-2">
                                {FONT_OPTIONS.map((font) => (
                                    <button
                                        key={font.value}
                                        onClick={() => setSelectedFont(font.value)}
                                        className={`px-4 py-3 rounded-xl border text-left transition-all ${
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
                                        <span className="text-sm">{font.label}</span>
                                        <br />
                                        <span className="text-lg">読書</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Width Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text)' }}>Text Width</label>
                            <div className="flex gap-2">
                                {WIDTH_OPTIONS.map((width) => (
                                    <button
                                        key={width.value}
                                        onClick={() => setSelectedWidth(width.value)}
                                        className={`flex-1 px-4 py-2 rounded-xl border text-sm transition-all ${
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
                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text)' }}>Font Size</label>
                            <div className="grid grid-cols-4 gap-2">
                                {FONT_SIZE_OPTIONS.map((size) => (
                                    <button
                                        key={size.value}
                                        onClick={() => setSelectedFontSize(size.value)}
                                        className={`px-2 py-3 rounded-xl border text-center transition-all flex flex-col items-center justify-end gap-1 h-20 ${
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
                                            className="text-[10px]"
                                            style={{ color: selectedFontSize === size.value ? '#e11d48' : 'var(--zen-text-muted)' }}
                                        >
                                            {size.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Theme Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text)' }}>Theme</label>
                            <div className="flex gap-2">
                                {THEME_OPTIONS.map((theme) => (
                                    <button
                                        key={theme.value}
                                        onClick={() => setSelectedTheme(theme.value)}
                                        className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-2 ${
                                            selectedTheme === theme.value
                                                ? 'border-rose-400 ring-2 ring-rose-200'
                                                : ''
                                        }`}
                                        style={selectedTheme !== theme.value ? {
                                            borderColor: 'var(--zen-btn-border)'
                                        } : undefined}
                                    >
                                        <div className={`w-8 h-8 rounded-full border-2 ${theme.preview}`} />
                                        <span style={{ color: 'var(--zen-text-muted)' }}>{theme.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <hr style={{ borderColor: 'var(--zen-border)' }} />

                    {/* Translation Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--zen-heading)' }}>Translation</h3>
                        
                        {/* Translation Engine Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text)' }}>Translation Engine</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedEngine('google')}
                                    disabled={!googleAvailable}
                                    className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-1 ${
                                        selectedEngine === 'google'
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                    } ${!googleAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    style={selectedEngine !== 'google' ? {
                                        borderColor: 'var(--zen-btn-border)'
                                    } : undefined}
                                >
                                    <span style={{ color: 'var(--zen-text)' }}>Google Translate</span>
                                    {!googleAvailable && (
                                        <span className="text-[10px]" style={{ color: 'var(--zen-text-muted)' }}>Unavailable</span>
                                    )}
                                    {googleAvailable && selectedEngine === 'google' && (
                                        <span className="text-[10px]" style={{ color: 'var(--zen-text-muted)' }}>Free</span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setSelectedEngine('openai')}
                                    className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-1 ${
                                        selectedEngine === 'openai'
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                    }`}
                                    style={selectedEngine !== 'openai' ? {
                                        borderColor: 'var(--zen-btn-border)'
                                    } : undefined}
                                >
                                    <span style={{ color: 'var(--zen-text)' }}>OpenAI</span>
                                    <span className="text-[10px]" style={{ color: 'var(--zen-text-muted)' }}>gpt-5.2</span>
                                </button>
                            </div>
                        </div>

                        {/* Target Language Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text)' }}>Target Language</label>
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
                                <label className="block text-sm font-medium" style={{ color: 'var(--zen-text)' }}>
                                    OpenAI API Key
                                </label>
                                <p className="text-xs mb-2" style={{ color: 'var(--zen-text-muted)' }}>
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

                    {/* Save message */}
                    {saveMessage && (
                        <div className={`text-sm ${saveMessage.includes('success') ? 'text-emerald-600' : 'text-red-500'}`}>
                            {saveMessage}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div 
                    className="px-6 py-4 border-t flex justify-end gap-3"
                    style={{ 
                        backgroundColor: 'var(--zen-btn-bg)',
                        borderColor: 'var(--zen-border)'
                    }}
                >
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 rounded-lg transition-colors"
                        style={{ color: 'var(--zen-text-muted)' }}
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

