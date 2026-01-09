'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { IoClose, IoEye, IoEyeOff } from 'react-icons/io5';
import { checkGoogleTranslateAvailable } from '@/lib/browser';
import type { TranslationEngine, TranslationPairInfo } from '@/lib/translation';
import { getAvailableBergamotLanguagePairs, getTranslationPairInfo } from '@/lib/translation';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';
import { useIsMobile } from '@/hooks/useIsMobile';

export const FONT_OPTIONS = [
    { value: 'serif', label: 'Serif', fontFamily: 'var(--font-noto-serif-jp), "Times New Roman", Times, serif' },
    { value: 'sans', label: 'Sans Serif', fontFamily: 'var(--font-noto-sans-jp), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
];

export const WIDTH_OPTIONS = [
    // New mapping:
    // - Narrow now corresponds to the old Medium width
    // - Medium now corresponds to the old Wide width
    // - Wide is an even wider layout for large screens
    { value: 'narrow', label: 'Narrow', maxWidth: '768px' },
    { value: 'medium', label: 'Medium', maxWidth: '960px' },
    { value: 'wide', label: 'Wide', maxWidth: '1100px' },
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
    // Cache theme in localStorage for instant loading
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem('enso-read-theme', theme);
        } catch (e) {
            // localStorage might be disabled
        }
    }
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSettingsChange?: () => void;
}

// Get initial theme from localStorage synchronously
function getInitialTheme(): string {
    if (typeof window === 'undefined') return 'light';
    try {
        const theme = localStorage.getItem('enso-read-theme');
        if (theme && ['light', 'sepia', 'dark'].includes(theme)) {
            return theme;
        }
    } catch (e) {
        // localStorage might be disabled
    }
    return 'light';
}

export default function SettingsModal({ isOpen, onClose, onSettingsChange }: SettingsModalProps) {
    const isMobile = useIsMobile();
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [apiKeyStorageMode, setApiKeyStorageMode] = useState<'temporary' | 'persistent'>('temporary');
    const [selectedFont, setSelectedFont] = useState('noto-serif');
    const [selectedWidth, setSelectedWidth] = useState('medium');
    const [selectedFontSize, setSelectedFontSize] = useState('medium');
    const [selectedTheme, setSelectedTheme] = useState(getInitialTheme);
    const [selectedEngine, setSelectedEngine] = useState<TranslationEngine>('openai');
    const [targetLanguage, setTargetLanguage] = useState<string>('en');
    const [bergamotSourceLanguage, setBergamotSourceLanguage] = useState<string>('ja');
    const [bergamotTargetLanguage, setBergamotTargetLanguage] = useState<string>('en');
    const [isLoadingBergamotModel, setIsLoadingBergamotModel] = useState(false);
    const [bergamotModelLoaded, setBergamotModelLoaded] = useState(false);
    const [availableBergamotPairs, setAvailableBergamotPairs] = useState<Map<string, string[]>>(new Map());
    const [isLoadingBergamotPairs, setIsLoadingBergamotPairs] = useState(false);
    const [translationPairInfo, setTranslationPairInfo] = useState<TranslationPairInfo | null>(null);
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

    // Load available Bergamot language pairs when Bergamot is selected
    useEffect(() => {
        if (isOpen && selectedEngine === 'bergamot') {
            setIsLoadingBergamotPairs(true);
            getAvailableBergamotLanguagePairs()
                .then((pairs) => {
                    setAvailableBergamotPairs(pairs);
                })
                .catch((error) => {
                    console.error('Failed to load Bergamot language pairs:', error);
                })
                .finally(() => {
                    setIsLoadingBergamotPairs(false);
                });
        }
    }, [isOpen, selectedEngine]);
    
    // Update translation pair info when languages change
    useEffect(() => {
        if (isOpen && selectedEngine === 'bergamot' && bergamotSourceLanguage && bergamotTargetLanguage) {
            getTranslationPairInfo(bergamotSourceLanguage, bergamotTargetLanguage)
                .then(setTranslationPairInfo)
                .catch((error) => {
                    console.error('Failed to get translation pair info:', error);
                    setTranslationPairInfo(null);
                });
        } else {
            setTranslationPairInfo(null);
        }
    }, [isOpen, selectedEngine, bergamotSourceLanguage, bergamotTargetLanguage]);

    // Load existing settings on mount
    useEffect(() => {
        if (isOpen) {
            const loadSettings = async () => {
                try {
                    const { getApiKey, getStorageMode } = await import('@/lib/apiKeyStorage');
                    const [apiKeyValue, storageMode, fontSetting, widthSetting, fontSizeSetting, themeSetting, engineSetting, targetLangSetting, bergamotSourceSetting, bergamotTargetSetting] = await Promise.all([
                        getApiKey(),
                        getStorageMode(),
                        db.settings.get('reader_font'),
                        db.settings.get('reader_width'),
                        db.settings.get('reader_font_size'),
                        db.settings.get('theme'),
                        db.settings.get('translation_engine'),
                        db.settings.get('target_language'),
                        db.settings.get('bergamot_source_language'),
                        db.settings.get('bergamot_target_language'),
                    ]);
                    const font = fontSetting?.value || 'noto-serif';
                    const width = widthSetting?.value || 'medium';
                    const fontSize = fontSizeSetting?.value || 'medium';
                    const theme = themeSetting?.value || 'light';
                    
                    // Determine engine: use saved, or auto-select based on availability
                    let engine: TranslationEngine = 'openai';
                    if (engineSetting?.value === 'google' || engineSetting?.value === 'openai' || engineSetting?.value === 'bergamot') {
                        engine = engineSetting.value as TranslationEngine;
                    } else {
                        // Auto-select: prefer Google if available, else OpenAI if key exists
                        const googleAvail = await checkGoogleTranslateAvailable();
                        if (googleAvail) {
                            engine = 'google';
                        } else if (apiKeyValue) {
                            engine = 'openai';
                        }
                    }
                    
                    if (apiKeyValue) setApiKey(apiKeyValue);
                    setApiKeyStorageMode(storageMode);
                    const targetLang = targetLangSetting?.value || 'en';
                    const bergamotSource = bergamotSourceSetting?.value || 'ja';
                    const bergamotTarget = bergamotTargetSetting?.value || 'en';
                    setSelectedFont(font);
                    setSelectedWidth(width);
                    setSelectedFontSize(fontSize);
                    setSelectedTheme(theme);
                    setSelectedEngine(engine);
                    setTargetLanguage(targetLang);
                    setBergamotSourceLanguage(bergamotSource);
                    setBergamotTargetLanguage(bergamotTarget);
                    
                    // Check if Bergamot model is loaded
                    if (engine === 'bergamot') {
                        const { isBergamotModelLoaded } = await import('@/lib/translation');
                        const loaded = await isBergamotModelLoaded(bergamotSource, bergamotTarget);
                        setBergamotModelLoaded(loaded);
                    }
                    
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
    
    // Check Bergamot model status when engine or language pair changes
    useEffect(() => {
        if (isOpen && selectedEngine === 'bergamot') {
            const checkModelStatus = async () => {
                const { isBergamotModelLoaded } = await import('@/lib/translation');
                const loaded = await isBergamotModelLoaded(bergamotSourceLanguage, bergamotTargetLanguage);
                setBergamotModelLoaded(loaded);
            };
            checkModelStatus();
        } else if (selectedEngine !== 'bergamot') {
            setBergamotModelLoaded(false);
        }
    }, [isOpen, selectedEngine, bergamotSourceLanguage, bergamotTargetLanguage]);
    
    // Handle Bergamot model loading
    const handleLoadBergamotModel = async () => {
        if (!bergamotSourceLanguage || !bergamotTargetLanguage) {
            setSaveMessage('Please select both source and target languages');
            setTimeout(() => setSaveMessage(null), 3000);
            return;
        }
        
        setIsLoadingBergamotModel(true);
        setSaveMessage(null);
        
        try {
            // Import and load the model
            const { translateWithBergamot } = await import('@/lib/translation');
            
            // Provide feedback for pivot translations
            const isPivot = translationPairInfo?.isPivot;
            if (isPivot) {
                setSaveMessage(`Downloading models: ${bergamotSourceLanguage} → en → ${bergamotTargetLanguage}...`);
            } else {
                setSaveMessage(`Downloading model: ${bergamotSourceLanguage} → ${bergamotTargetLanguage}...`);
            }
            
            // Trigger model loading by attempting a dummy translation
            // This will load and cache the model(s)
            await translateWithBergamot('test', bergamotSourceLanguage, bergamotTargetLanguage);
            setBergamotModelLoaded(true);
            const modelText = isPivot ? '2 models loaded successfully!' : 'Model loaded successfully!';
            setSaveMessage(modelText);
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (error) {
            console.error('Failed to load Bergamot model:', error);
            setSaveMessage(`Failed to load model: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setTimeout(() => setSaveMessage(null), 5000);
            setBergamotModelLoaded(false);
        } finally {
            setIsLoadingBergamotModel(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);

        try {
            const { setApiKey: saveApiKey, setStorageMode } = await import('@/lib/apiKeyStorage');
            
            // Save API key with selected storage mode
            await saveApiKey(apiKey, apiKeyStorageMode);
            await setStorageMode(apiKeyStorageMode);
            
            await Promise.all([
                db.settings.put({ key: 'reader_font', value: selectedFont }),
                db.settings.put({ key: 'reader_width', value: selectedWidth }),
                db.settings.put({ key: 'reader_font_size', value: selectedFontSize }),
                db.settings.put({ key: 'theme', value: selectedTheme }),
                db.settings.put({ key: 'translation_engine', value: selectedEngine }),
                db.settings.put({ key: 'target_language', value: targetLanguage }),
                db.settings.put({ key: 'bergamot_source_language', value: bergamotSourceLanguage }),
                db.settings.put({ key: 'bergamot_target_language', value: bergamotTargetLanguage }),
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

                        {/* Width Selection - Hidden on mobile */}
                        {!isMobile && (
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
                        )}
                        
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
                                    onClick={() => setSelectedEngine('bergamot')}
                                    className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-1 ${
                                        selectedEngine === 'bergamot'
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                    }`}
                                    style={selectedEngine !== 'bergamot' ? {
                                        borderColor: 'var(--zen-btn-border)'
                                    } : undefined}
                                >
                                    <span style={{ color: 'var(--zen-text)' }}>Bergamot</span>
                                    <span className="text-[10px]" style={{ color: 'var(--zen-text-muted)' }}>Offline</span>
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
                        
                        {/* Bergamot Language Pair Selection */}
                        {selectedEngine === 'bergamot' && (
                            <div className="space-y-4 p-4 rounded-xl border" style={{ 
                                borderColor: 'var(--zen-border)',
                                backgroundColor: 'var(--zen-btn-bg)'
                            }}>
                                <div className="text-xs mb-2" style={{ color: 'var(--zen-text-muted)' }}>
                                    ⚠️ Model size: ~50-100MB. Model will be downloaded and cached in browser.
                                </div>
                                <div className="text-xs mb-3" style={{ color: 'var(--zen-text-muted)' }}>
                                    ✓ Will work offline once loaded
                                </div>
                                <div className="text-xs mb-3">
                                    <a 
                                        href="https://github.com/mozilla/translations" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="underline hover:no-underline"
                                        style={{ color: 'var(--zen-text-muted)' }}
                                    >
                                        Powered by Firefox Translation
                                    </a>
                                </div>
                                {isLoadingBergamotPairs ? (
                                    <div className="text-xs text-center py-2" style={{ color: 'var(--zen-text-muted)' }}>
                                        Loading available language pairs...
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <label className="block text-xs font-medium" style={{ color: 'var(--zen-text)' }}>Source Language</label>
                                            <select
                                                value={bergamotSourceLanguage}
                                                onChange={(e) => {
                                                    const newSource = e.target.value;
                                                    setBergamotSourceLanguage(newSource);
                                                    // Reset target if same as source
                                                    if (newSource === bergamotTargetLanguage) {
                                                        const firstOther = SUPPORTED_LANGUAGES.find(l => l.code !== newSource);
                                                        if (firstOther) setBergamotTargetLanguage(firstOther.code);
                                                    }
                                                    setBergamotModelLoaded(false);
                                                }}
                                                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all"
                                                style={{
                                                    backgroundColor: 'var(--zen-note-bg)',
                                                    borderWidth: '1px',
                                                    borderStyle: 'solid',
                                                    borderColor: 'var(--zen-btn-border)',
                                                    color: 'var(--zen-text)',
                                                }}
                                            >
                                                {SUPPORTED_LANGUAGES.filter(lang => lang.code !== bergamotTargetLanguage).map((lang) => (
                                                    <option key={lang.code} value={lang.code}>
                                                        {lang.nativeName} ({lang.englishName})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-xs font-medium" style={{ color: 'var(--zen-text)' }}>Target Language</label>
                                            <select
                                                value={bergamotTargetLanguage}
                                                onChange={(e) => {
                                                    setBergamotTargetLanguage(e.target.value);
                                                    setBergamotModelLoaded(false);
                                                }}
                                                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all"
                                                style={{
                                                    backgroundColor: 'var(--zen-note-bg)',
                                                    borderWidth: '1px',
                                                    borderStyle: 'solid',
                                                    borderColor: 'var(--zen-btn-border)',
                                                    color: 'var(--zen-text)',
                                                }}
                                            >
                                                {SUPPORTED_LANGUAGES.filter(lang => lang.code !== bergamotSourceLanguage).map((lang) => (
                                                    <option key={lang.code} value={lang.code}>
                                                        {lang.nativeName} ({lang.englishName})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Pivot translation warning */}
                                {translationPairInfo?.isPivot && (
                                    <div 
                                        className="px-3 py-2 rounded-lg text-xs"
                                        style={{ 
                                            backgroundColor: 'rgba(234, 179, 8, 0.1)', 
                                            borderWidth: '1px',
                                            borderStyle: 'solid',
                                            borderColor: 'rgba(234, 179, 8, 0.3)',
                                            color: 'var(--zen-text)',
                                        }}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-yellow-500 flex-shrink-0">⚠️</span>
                                            <div>
                                                <span className="font-medium">Pivot translation: </span>
                                                <span style={{ color: 'var(--zen-text-muted)' }}>
                                                    {translationPairInfo.pivotPath}
                                                </span>
                                                <p className="mt-1" style={{ color: 'var(--zen-text-muted)' }}>
                                                    Uses English as an intermediate step. Results may be less accurate. Requires downloading 2 models (~80-120MB total).
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Unavailable pair warning */}
                                {translationPairInfo && !translationPairInfo.available && bergamotSourceLanguage !== bergamotTargetLanguage && (
                                    <div 
                                        className="px-3 py-2 rounded-lg text-xs"
                                        style={{ 
                                            backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                            borderWidth: '1px',
                                            borderStyle: 'solid',
                                            borderColor: 'rgba(239, 68, 68, 0.3)',
                                            color: 'var(--zen-text)',
                                        }}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-red-500 flex-shrink-0">❌</span>
                                            <span style={{ color: 'var(--zen-text-muted)' }}>
                                                No translation models available for this language pair. Please select a different combination.
                                            </span>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleLoadBergamotModel}
                                        disabled={isLoadingBergamotModel || !bergamotSourceLanguage || !bergamotTargetLanguage || !translationPairInfo?.available}
                                        className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        style={{
                                            backgroundColor: bergamotModelLoaded ? 'var(--zen-translation-btn-active-bg, rgba(16, 185, 129, 0.2))' : 'var(--zen-btn-bg)',
                                            borderWidth: '1px',
                                            borderStyle: 'solid',
                                            borderColor: 'var(--zen-btn-border)',
                                            color: 'var(--zen-text)',
                                        }}
                                    >
                                        {isLoadingBergamotModel ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                <span>Loading {translationPairInfo?.modelCount === 2 ? '2 Models' : 'Model'}...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Load {translationPairInfo?.modelCount === 2 ? '2 Models' : 'Model'}</span>
                                                {bergamotModelLoaded && (
                                                    <span className="text-xs">✓ Loaded</span>
                                                )}
                                            </>
                                        )}
                                    </button>
                                    {bergamotModelLoaded && (
                                        <span className="text-xs" style={{ color: 'var(--zen-text-muted)' }}>
                                            {translationPairInfo?.modelCount === 2 ? 'Models' : 'Model'} ready for translation
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

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
                                {/* Storage Mode Selection */}
                                <div className="space-y-2 mb-3">
                                    <label className="block text-xs font-medium" style={{ color: 'var(--zen-text)' }}>
                                        Storage Mode
                                    </label>
                                    <div className="flex flex-col gap-2">
                                        <label className="flex items-center text-xs cursor-pointer">
                                            <input
                                                type="radio"
                                                name="apiKeyStorage"
                                                value="temporary"
                                                checked={apiKeyStorageMode === 'temporary'}
                                                onChange={(e) => setApiKeyStorageMode(e.target.value as 'temporary' | 'persistent')}
                                                className="mr-2"
                                            />
                                            <span style={{ color: 'var(--zen-text)' }}>
                                                Temporary (this session) — Recommended
                                            </span>
                                        </label>
                                        <label className="flex items-center text-xs cursor-pointer">
                                            <input
                                                type="radio"
                                                name="apiKeyStorage"
                                                value="persistent"
                                                checked={apiKeyStorageMode === 'persistent'}
                                                onChange={(e) => setApiKeyStorageMode(e.target.value as 'temporary' | 'persistent')}
                                                className="mr-2"
                                            />
                                            <span style={{ color: 'var(--zen-text)' }}>
                                                Save on this device
                                            </span>
                                        </label>
                                    </div>
                                    {apiKeyStorageMode === 'persistent' && (
                                        <p className="text-xs mt-1" style={{ color: 'var(--zen-text-muted)' }}>
                                            ⚠️ Stored locally on this device. Browser tools or extensions may read it.
                                        </p>
                                    )}
                                </div>
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

