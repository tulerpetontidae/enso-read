'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import Link from 'next/link';
import { FaChevronLeft } from 'react-icons/fa';
import { IoEye, IoEyeOff } from 'react-icons/io5';
import { FONT_OPTIONS, WIDTH_OPTIONS, FONT_SIZE_OPTIONS, THEME_OPTIONS, applyTheme } from '@/components/SettingsModal';
import { checkGoogleTranslateAvailable } from '@/lib/browser';
import type { TranslationEngine, TranslationPairInfo } from '@/lib/translation';
import { getTranslationPairInfo } from '@/lib/translation';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';
import { exportDatabase, downloadExport } from '@/lib/dbExport';
import { parseImportFile, validateExportData, importDatabaseOverwrite, importDatabaseMerge } from '@/lib/dbImport';
import type { BookmarkGroup } from '@/lib/db';

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

export default function SettingsPage() {
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
    const [translationPairInfo, setTranslationPairInfo] = useState<TranslationPairInfo | null>(null);
    const [googleAvailable, setGoogleAvailable] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    
    // Data Management state
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importMode, setImportMode] = useState<'overwrite' | 'merge'>('merge');
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importMessage, setImportMessage] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Bookmark Groups state
    const [bookmarkGroups, setBookmarkGroups] = useState<BookmarkGroup[]>([]);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingGroupName, setEditingGroupName] = useState('');
    const [editingColorGroupId, setEditingColorGroupId] = useState<string | null>(null);
    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
    const [colorPickerPosition, setColorPickerPosition] = useState<{ top: number; left: number } | null>(null);
    
    const presetColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

    // Check Google Translate availability
    useEffect(() => {
        checkGoogleTranslateAvailable().then(setGoogleAvailable);
    }, []);

    // Load bookmark groups
    useEffect(() => {
        const loadBookmarkGroups = async () => {
            try {
                const groups = await db.bookmarkGroups.orderBy('order').toArray();
                setBookmarkGroups(groups);
            } catch (e) {
                console.error('Failed to load bookmark groups:', e);
            }
        };
        loadBookmarkGroups();
    }, []);

    // Close color picker when clicking outside
    useEffect(() => {
        if (editingColorGroupId) {
            const handleClickOutside = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (!target.closest('[data-color-picker]')) {
                    setEditingColorGroupId(null);
                    setColorPickerPosition(null);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [editingColorGroupId]);

    // Load existing settings on mount
    useEffect(() => {
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
                if (apiKeyValue) setApiKey(apiKeyValue);
                setApiKeyStorageMode(storageMode);
                if (fontSetting?.value) setSelectedFont(fontSetting.value);
                if (widthSetting?.value) setSelectedWidth(widthSetting.value);
                if (fontSizeSetting?.value) setSelectedFontSize(fontSizeSetting.value);
                if (themeSetting?.value) setSelectedTheme(themeSetting.value);
                if (targetLangSetting?.value) setTargetLanguage(targetLangSetting.value);
                
                // Determine engine: use saved, or auto-select based on availability
                if (engineSetting?.value === 'google' || engineSetting?.value === 'openai' || engineSetting?.value === 'bergamot') {
                    setSelectedEngine(engineSetting.value as TranslationEngine);
                } else {
                    // Auto-select: prefer Google if available, else OpenAI if key exists
                    const googleAvail = await checkGoogleTranslateAvailable();
                    if (googleAvail) {
                        setSelectedEngine('google');
                    } else if (apiKeyValue) {
                        setSelectedEngine('openai');
                    }
                }
                
                const bergamotSource = bergamotSourceSetting?.value || 'ja';
                const bergamotTarget = bergamotTargetSetting?.value || 'en';
                setBergamotSourceLanguage(bergamotSource);
                setBergamotTargetLanguage(bergamotTarget);
                
                // Check if Bergamot model is loaded
                if (engineSetting?.value === 'bergamot') {
                    const { isBergamotModelLoaded } = await import('@/lib/translation');
                    const loaded = await isBergamotModelLoaded(bergamotSource, bergamotTarget);
                    setBergamotModelLoaded(loaded);
                }
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        };
        loadSettings();
    }, []);
    
    // Apply theme immediately on mount and when changed
    useEffect(() => {
        applyTheme(selectedTheme);
    }, [selectedTheme]);
    
    // Check Bergamot model status when engine or language pair changes
    useEffect(() => {
        if (selectedEngine === 'bergamot') {
            const checkModelStatus = async () => {
                const { isBergamotModelLoaded } = await import('@/lib/translation');
                const loaded = await isBergamotModelLoaded(bergamotSourceLanguage, bergamotTargetLanguage);
                setBergamotModelLoaded(loaded);
            };
            checkModelStatus();
        } else {
            setBergamotModelLoaded(false);
        }
    }, [selectedEngine, bergamotSourceLanguage, bergamotTargetLanguage]);
    
    // Update translation pair info when languages change
    useEffect(() => {
        if (selectedEngine === 'bergamot' && bergamotSourceLanguage && bergamotTargetLanguage) {
            getTranslationPairInfo(bergamotSourceLanguage, bergamotTargetLanguage)
                .then(setTranslationPairInfo)
                .catch((error) => {
                    console.error('Failed to get translation pair info:', error);
                    setTranslationPairInfo(null);
                });
        } else {
            setTranslationPairInfo(null);
        }
    }, [selectedEngine, bergamotSourceLanguage, bergamotTargetLanguage]);
    
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

    // Bookmark group handlers
    const handleStartEditGroup = (group: BookmarkGroup) => {
        setEditingGroupId(group.id);
        setEditingGroupName(group.name);
    };

    const handleSaveGroupName = async (groupId: string) => {
        try {
            const group = bookmarkGroups.find(g => g.id === groupId);
            if (group) {
                await db.bookmarkGroups.update(groupId, {
                    name: editingGroupName.trim() || group.name,
                    updatedAt: Date.now(),
                });
                const updatedGroups = await db.bookmarkGroups.orderBy('order').toArray();
                setBookmarkGroups(updatedGroups);
            }
        } catch (e) {
            console.error('Failed to update bookmark group:', e);
        } finally {
            setEditingGroupId(null);
            setEditingGroupName('');
        }
    };

    const handleColorChange = async (groupId: string, newColor: string) => {
        try {
            await db.bookmarkGroups.update(groupId, {
                color: newColor,
                updatedAt: Date.now(),
            });
            const updatedGroups = await db.bookmarkGroups.orderBy('order').toArray();
            setBookmarkGroups(updatedGroups);
            setEditingColorGroupId(null);
        } catch (e) {
            console.error('Failed to update bookmark group color:', e);
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (bookmarkGroups.length <= 1) {
            alert('Cannot delete the last bookmark group. You must have at least one group.');
            return;
        }
        setDeletingGroupId(groupId);
    };

    const confirmDeleteGroup = async () => {
        if (!deletingGroupId) return;
        try {
            // Delete all bookmarks in this group
            await db.bookmarks.where('colorGroupId').equals(deletingGroupId).delete();
            // Delete the group
            await db.bookmarkGroups.delete(deletingGroupId);
            const updatedGroups = await db.bookmarkGroups.orderBy('order').toArray();
            setBookmarkGroups(updatedGroups);
            setDeletingGroupId(null);
        } catch (e) {
            console.error('Failed to delete bookmark group:', e);
            alert('Failed to delete bookmark group');
            setDeletingGroupId(null);
        }
    };

    const cancelDeleteGroup = () => {
        setDeletingGroupId(null);
    };

    const handleAddGroup = async () => {
        if (bookmarkGroups.length >= 5) {
            alert('Maximum 5 bookmark groups allowed');
            return;
        }
        try {
            const { v4: uuidv4 } = await import('uuid');
            const presetColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
            const usedColors = bookmarkGroups.map(g => g.color);
            const availableColor = presetColors.find(c => !usedColors.includes(c)) || presetColors[bookmarkGroups.length % presetColors.length];
            
            const newGroup: BookmarkGroup = {
                id: uuidv4(),
                name: `Group ${bookmarkGroups.length + 1}`,
                color: availableColor,
                order: bookmarkGroups.length,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            await db.bookmarkGroups.add(newGroup);
            const updatedGroups = await db.bookmarkGroups.orderBy('order').toArray();
            setBookmarkGroups(updatedGroups);
        } catch (e) {
            console.error('Failed to add bookmark group:', e);
            alert('Failed to add bookmark group');
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

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const jsonString = await exportDatabase();
            downloadExport(jsonString);
            setSaveMessage('Database exported successfully!');
            setTimeout(() => {
                setSaveMessage(null);
            }, 3000);
        } catch (error) {
            console.error('Export failed:', error);
            setSaveMessage('Failed to export database');
            setTimeout(() => {
                setSaveMessage(null);
            }, 3000);
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportFile(file);
        setValidationErrors([]);
        setImportMessage(null);

        try {
            const data = await parseImportFile(file);
            const validation = validateExportData(data);
            
            if (!validation.valid) {
                setValidationErrors(validation.errors.map(err => `${err.field}: ${err.message}`));
                setImportFile(null);
            }
        } catch (error) {
            setValidationErrors([error instanceof Error ? error.message : 'Invalid file format']);
            setImportFile(null);
        }
    };

    const handleImport = async () => {
        if (!importFile) return;

        if (importMode === 'overwrite' && !showOverwriteConfirm) {
            setShowOverwriteConfirm(true);
            return;
        }

        setIsImporting(true);
        setImportMessage(null);
        setValidationErrors([]);

        try {
            const data = await parseImportFile(importFile);
            const validation = validateExportData(data);
            
            if (!validation.valid) {
                setValidationErrors(validation.errors.map(err => `${err.field}: ${err.message}`));
                setIsImporting(false);
                return;
            }

            if (importMode === 'overwrite') {
                await importDatabaseOverwrite(data);
            } else {
                await importDatabaseMerge(data);
            }

            setImportMessage('Database imported successfully! Please refresh the page.');
            setImportFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            setShowOverwriteConfirm(false);
            
            // Reload settings after import
            window.location.reload();
        } catch (error) {
            console.error('Import failed:', error);
            setImportMessage('Failed to import database: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsImporting(false);
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
                                    onClick={() => setSelectedEngine('bergamot')}
                                    className={`flex-1 px-4 py-4 rounded-xl border-2 text-sm transition-all flex flex-col items-center gap-2 ${
                                        selectedEngine === 'bergamot'
                                            ? 'border-rose-400 ring-2 ring-rose-200'
                                            : ''
                                    }`}
                                    style={selectedEngine !== 'bergamot' ? {
                                        borderColor: 'var(--zen-border)'
                                    } : undefined}
                                >
                                    <span style={{ color: 'var(--zen-text)' }}>Bergamot</span>
                                    <span className="text-xs" style={{ color: 'var(--zen-text-muted)' }}>Offline</span>
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
                                {/* Storage Mode Selection */}
                                <div className="space-y-2 mb-3">
                                    <label className="block text-xs font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>
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
                                            <span style={{ color: 'var(--zen-text, #1c1917)' }}>
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
                                            <span style={{ color: 'var(--zen-text, #1c1917)' }}>
                                                Save on this device
                                            </span>
                                        </label>
                                    </div>
                                    {apiKeyStorageMode === 'persistent' && (
                                        <p className="text-xs mt-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
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
                </div>

                {/* Data Management */}
                <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--zen-card-solid-bg, white)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
                    <div className="p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-serif font-medium mb-1" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                                Data Management
                            </h2>
                            <p className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Backup and restore your reading data, translations, and notes.
                            </p>
                        </div>

                        {/* Export Section */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Export Database</label>
                            <p className="text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Download a backup of all your data (books, progress, translations, notes). API keys are excluded for security.
                            </p>
                            <button
                                onClick={handleExport}
                                disabled={isExporting}
                                className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExporting ? 'Exporting...' : 'Export Database'}
                            </button>
                        </div>

                        <div className="border-t pt-4" style={{ borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }} />

                        {/* Import Section */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Import Database</label>
                            <p className="text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Restore data from a backup file. Choose to overwrite all data or merge with existing.
                            </p>
                            
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="import-file-input"
                            />
                            <label
                                htmlFor="import-file-input"
                                className="inline-block px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-medium transition-colors cursor-pointer"
                                style={{
                                    backgroundColor: 'var(--zen-btn-bg)',
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: 'var(--zen-btn-border)',
                                    color: 'var(--zen-btn-text)'
                                }}
                            >
                                Select Backup File
                            </label>
                            
                            {importFile && (
                                <div className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                    Selected: {importFile.name}
                                </div>
                            )}

                            {validationErrors.length > 0 && (
                                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                                    <p className="text-sm font-medium text-red-800 mb-1">Validation Errors:</p>
                                    <ul className="text-xs text-red-700 list-disc list-inside space-y-1">
                                        {validationErrors.map((error, idx) => (
                                            <li key={idx}>{error}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {importFile && validationErrors.length === 0 && (
                                <>
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>Import Mode</label>
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="import-mode"
                                                    value="merge"
                                                    checked={importMode === 'merge'}
                                                    onChange={(e) => setImportMode(e.target.value as 'overwrite' | 'merge')}
                                                    className="w-4 h-4"
                                                    style={{ accentColor: '#f43f5e' }}
                                                />
                                                <span className="text-sm" style={{ color: 'var(--zen-text, #1c1917)' }}>Merge</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="import-mode"
                                                    value="overwrite"
                                                    checked={importMode === 'overwrite'}
                                                    onChange={(e) => setImportMode(e.target.value as 'overwrite' | 'merge')}
                                                    className="w-4 h-4"
                                                    style={{ accentColor: '#f43f5e' }}
                                                />
                                                <span className="text-sm" style={{ color: 'var(--zen-text, #1c1917)' }}>Overwrite All</span>
                                            </label>
                                        </div>
                                        <p className="text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                            {importMode === 'merge' 
                                                ? 'Merge will combine data, keeping newer versions of translations and notes.'
                                                : 'Overwrite will completely replace all existing data. This cannot be undone.'}
                                        </p>
                                    </div>

                                    {showOverwriteConfirm && (
                                        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                                            <p className="text-sm font-medium text-amber-800 mb-2">
                                                Warning: This will delete all existing data!
                                            </p>
                                            <p className="text-xs text-amber-700 mb-3">
                                                Are you sure you want to overwrite all your data? This action cannot be undone.
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleImport}
                                                    disabled={isImporting}
                                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                >
                                                    {isImporting ? 'Importing...' : 'Yes, Overwrite Everything'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowOverwriteConfirm(false);
                                                        setImportMode('merge');
                                                    }}
                                                    className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!showOverwriteConfirm && (
                                        <button
                                            onClick={handleImport}
                                            disabled={isImporting}
                                            className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isImporting ? 'Importing...' : 'Import Database'}
                                        </button>
                                    )}
                                </>
                            )}

                            {importMessage && (
                                <div className={`p-3 rounded-lg ${importMessage.includes('success') ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                                    <p className={`text-sm ${importMessage.includes('success') ? 'text-emerald-800' : 'text-red-800'}`}>
                                        {importMessage}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bookmark Groups */}
                <div className="rounded-2xl shadow-sm overflow-hidden relative" style={{ backgroundColor: 'var(--zen-card-solid-bg, white)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
                    <div className="p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-serif font-medium mb-1" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                                Bookmark Groups
                            </h2>
                            <p className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Manage color groups for organizing bookmarks. Click on a name to edit it.
                            </p>
                        </div>

                        <div className="space-y-2">
                            {bookmarkGroups.map((group) => (
                                <div
                                    key={group.id}
                                    className="flex items-center gap-3 p-3 rounded-lg"
                                    style={{
                                        backgroundColor: 'var(--zen-btn-bg, #fafaf9)',
                                        borderWidth: '1px',
                                        borderStyle: 'solid',
                                        borderColor: 'var(--zen-btn-border, #e7e5e4)',
                                    }}
                                >
                                    {/* Color swatch - clickable */}
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setColorPickerPosition({
                                                    top: rect.bottom + 8,
                                                    left: rect.left
                                                });
                                                setEditingColorGroupId(editingColorGroupId === group.id ? null : group.id);
                                            }}
                                            className="w-6 h-6 rounded-full flex-shrink-0 border-2 transition-all hover:scale-110"
                                            style={{ 
                                                backgroundColor: group.color,
                                                borderColor: editingColorGroupId === group.id ? 'var(--zen-text, #1c1917)' : 'transparent'
                                            }}
                                            title="Change color"
                                        />
                                        {editingColorGroupId === group.id && colorPickerPosition && (
                                            <div 
                                                className="fixed p-4 rounded-lg shadow-lg"
                                                data-color-picker
                                                style={{
                                                    backgroundColor: 'var(--zen-card-solid-bg, white)',
                                                    borderWidth: '1px',
                                                    borderStyle: 'solid',
                                                    borderColor: 'var(--zen-border, rgba(0,0,0,0.1))',
                                                    minWidth: '200px',
                                                    zIndex: 9999,
                                                    top: `${colorPickerPosition.top}px`,
                                                    left: `${colorPickerPosition.left}px`,
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="grid grid-cols-5 gap-3" style={{ width: '100%' }}>
                                                    {presetColors.map((color) => (
                                                        <button
                                                            key={color}
                                                            onClick={() => {
                                                                handleColorChange(group.id, color);
                                                                setEditingColorGroupId(null);
                                                                setColorPickerPosition(null);
                                                            }}
                                                            className={`rounded-full border-2 transition-all hover:scale-110 flex-shrink-0 ${
                                                                group.color === color ? 'ring-2 ring-offset-1' : ''
                                                            }`}
                                                            style={{ 
                                                                width: '32px',
                                                                height: '32px',
                                                                backgroundColor: color,
                                                                borderColor: group.color === color ? 'var(--zen-text, #1c1917)' : 'transparent',
                                                                flexShrink: 0,
                                                            }}
                                                            title={color}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Name input or display */}
                                    {editingGroupId === group.id ? (
                                        <input
                                            type="text"
                                            value={editingGroupName}
                                            onChange={(e) => setEditingGroupName(e.target.value)}
                                            onBlur={() => handleSaveGroupName(group.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleSaveGroupName(group.id);
                                                } else if (e.key === 'Escape') {
                                                    setEditingGroupId(null);
                                                    setEditingGroupName('');
                                                }
                                            }}
                                            className="flex-1 px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
                                            style={{
                                                backgroundColor: 'var(--zen-input-bg, white)',
                                                borderWidth: '1px',
                                                borderStyle: 'solid',
                                                borderColor: 'var(--zen-btn-border, #e7e5e4)',
                                                color: 'var(--zen-text, #1c1917)',
                                            }}
                                            autoFocus
                                        />
                                    ) : (
                                        <button
                                            onClick={() => handleStartEditGroup(group)}
                                            className="flex-1 text-left text-sm px-2 py-1 rounded hover:bg-white/50 transition-colors"
                                            style={{ color: 'var(--zen-text, #1c1917)' }}
                                        >
                                            {group.name}
                                        </button>
                                    )}
                                    
                                    {/* Delete button */}
                                    {bookmarkGroups.length > 1 && (
                                        <button
                                            onClick={() => handleDeleteGroup(group.id)}
                                            className="p-1.5 rounded hover:bg-red-100 transition-colors"
                                            style={{ color: '#ef4444' }}
                                            title="Delete group"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M3 6h18" />
                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Add group button */}
                        {bookmarkGroups.length < 5 && (
                            <button
                                onClick={handleAddGroup}
                                className="w-full px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-sm font-medium transition-colors"
                            >
                                Add Group ({bookmarkGroups.length}/5)
                            </button>
                        )}

                        {bookmarkGroups.length >= 5 && (
                            <p className="text-xs text-center" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                Maximum 5 groups reached
                            </p>
                        )}
                    </div>

                    {/* Delete confirmation modal */}
                    {deletingGroupId && (
                        <div 
                            className="absolute inset-0 flex items-center justify-center z-30 rounded-2xl"
                            style={{
                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                backdropFilter: 'blur(2px)',
                            }}
                            onClick={cancelDeleteGroup}
                        >
                            <div
                                className="p-4 rounded-lg shadow-lg max-w-xs mx-4"
                                style={{
                                    backgroundColor: 'var(--zen-card-solid-bg, white)',
                                    borderWidth: '2px',
                                    borderStyle: 'solid',
                                    borderColor: '#ef4444',
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="mb-3">
                                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--zen-text, #1c1917)' }}>
                                        Delete Bookmark Group?
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                                        All bookmarks in this group will be removed. This cannot be undone.
                                    </p>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={cancelDeleteGroup}
                                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                        style={{
                                            backgroundColor: 'var(--zen-btn-bg, #fafaf9)',
                                            color: 'var(--zen-text, #1c1917)',
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDeleteGroup}
                                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors text-white"
                                        style={{
                                            backgroundColor: '#ef4444',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#dc2626';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = '#ef4444';
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
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
                    <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--zen-recommend-heading)' }}>Recommended Extensions</h3>
                    <p className="text-sm mb-2" style={{ color: 'var(--zen-recommend-text)' }}>
                        For instant word lookups in Japanese, install the{' '}
                        <a 
                            href="https://github.com/birchill/10ten-ja-reader"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline"
                        >
                            10ten Japanese Reader
                        </a>{' '}
                        browser extension. Simply hover over any Japanese word to see its reading and meaning. Has automatic word parsing.
                    </p>
                    <p className="text-sm" style={{ color: 'var(--zen-recommend-text)' }}>
                        For other languages, the{' '}
                        <a
                            href="https://chromewebstore.google.com/detail/google-dictionary-by-goog/mgijmajocgfcbeboacabfgobmjgjcoja"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline"
                        >
                            Google Dictionary (by Google)
                        </a>{' '}
                        extension provides quick word definitions and translations on a click.
                    </p>
                </div>
            </main>
        </div>
    );
}

