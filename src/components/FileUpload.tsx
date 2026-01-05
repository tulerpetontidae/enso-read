'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { FaBookOpen, FaCloudUploadAlt } from 'react-icons/fa';
import ePub from 'epubjs';

// Extract cover image from EPUB (best effort, fails gracefully)
async function extractCoverImage(arrayBuffer: ArrayBuffer): Promise<string | undefined> {
    try {
        // @ts-ignore
        const book = ePub(arrayBuffer);
        await book.ready;
        
        // Try to get cover from metadata
        // @ts-ignore
        const coverUrl = await book.coverUrl();
        if (coverUrl) {
            try {
                const response = await fetch(coverUrl);
                const blob = await response.blob();
                const result = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                book.destroy();
                return result;
            } catch {
                // Cover fetch failed, continue without cover
            }
        }
        
        book.destroy();
    } catch (e) {
        console.warn('Cover extraction skipped:', e);
    }
    return undefined;
}

export default function FileUpload() {
    const router = useRouter();
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.epub')) {
            alert('Please upload a valid .epub file');
            return;
        }

        setIsProcessing(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const id = uuidv4();
            
            // Try to extract cover image (non-blocking, fails gracefully)
            let coverImage: string | undefined;
            try {
                // Create a copy for cover extraction so original buffer stays intact
                const bufferCopy = arrayBuffer.slice(0);
                coverImage = await extractCoverImage(bufferCopy);
            } catch {
                // Cover extraction failed, continue without it
            }

            await db.books.add({
                id,
                title: file.name.replace('.epub', ''),
                data: arrayBuffer,
                addedAt: Date.now(),
                coverImage,
            });

            router.push(`/reader/${id}`);
        } catch (error) {
            console.error('Error saving book:', error);
            alert('Failed to save book to library.');
            setIsProcessing(false);
        }
    };

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await processFile(e.target.files[0]);
        }
    };

    return (
        <div
            className={clsx(
                "w-full max-w-xl px-12 py-10 rounded-2xl transition-all duration-500 flex flex-col items-center justify-center gap-5 cursor-pointer relative overflow-hidden group shadow-xl hover:shadow-2xl",
                isDragging && "scale-[1.02]",
                isProcessing && "opacity-80 pointer-events-none"
            )}
            style={{
                backgroundColor: isDragging ? 'var(--zen-upload-drag-bg, #f5f5f4)' : 'var(--zen-upload-bg, white)',
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
        >
            <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700" 
                style={{ background: 'var(--zen-upload-hover-gradient, linear-gradient(to bottom right, rgba(255,228,230,0.5), transparent))' }}
            />

            <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".epub"
                onChange={handleFileSelect}
            />

            <div 
                className={clsx(
                    "relative p-5 rounded-full transition-all duration-500 group-hover:text-rose-500",
                    isDragging && "scale-110"
                )}
                style={{
                    backgroundColor: isDragging ? 'var(--zen-upload-icon-drag-bg, #e7e5e4)' : 'var(--zen-upload-icon-bg, #fafaf9)',
                    color: 'var(--zen-text-muted, #a8a29e)'
                }}
            >
                {isProcessing ? (
                    <FaBookOpen className="text-3xl animate-bounce" />
                ) : (
                    <FaCloudUploadAlt className="text-3xl" />
                )}
            </div>

            <div className="text-center space-y-2 relative z-10">
                <h3 className="text-xl font-serif font-light tracking-wide" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                    {isProcessing ? 'Opening Book...' : 'Book Import'}
                </h3>
                <p className="text-sm font-light tracking-wide" style={{ color: 'var(--zen-text-muted, #a8a29e)' }}>
                    Drop your EPUB file here to begin
                </p>
            </div>

            <div 
                className={clsx(
                    "h-0.5 w-16 rounded-full transition-all duration-700 group-hover:bg-rose-200",
                    isDragging && "bg-stone-400 w-24"
                )}
                style={{ backgroundColor: isDragging ? undefined : 'var(--zen-upload-line-bg, #e7e5e4)' }}
            />
        </div>
    );
}
