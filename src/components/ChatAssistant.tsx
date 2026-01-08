'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { IoClose, IoTrashOutline } from 'react-icons/io5';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface ChatAssistantProps {
  bookId: string;
  paragraphHash: string;
  paragraphText: string;
  translation: string | null;
  isOpen: boolean;
  onClose: () => void;
  showAllChats: boolean;
  noteHeight?: number; // Height of note if open, to position chat below it
  isNoteOpen?: boolean; // Whether note is currently open
  onChatDeleted?: () => void; // Callback when chat is deleted
}

export default function ChatAssistant({
  bookId,
  paragraphHash,
  paragraphText,
  translation,
  isOpen,
  onClose,
  showAllChats,
  noteHeight = 0,
  isNoteOpen = false,
  onChatDeleted,
}: ChatAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const threadId = `${bookId}|${paragraphHash}`;

  // Load chat history when component opens
  useEffect(() => {
    if (isOpen) {
      loadChatHistoryAndCheckApiKey();
    }
  }, [isOpen, bookId, paragraphHash]);

  const loadChatHistoryAndCheckApiKey = async () => {
    try {
      // Load chat history first
      const chatMessages = await db.chats
        .where('threadId')
        .equals(threadId)
        .sortBy('createdAt');

      const loadedMessages = chatMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      }));

      // Check for API key and add warning if needed
      const apiKeySetting = await db.settings.get('openai_api_key');
      if (!apiKeySetting?.value) {
        // Only show warning if there are no existing messages
        if (loadedMessages.length === 0) {
          const warningMessage: ChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: '⚠️ OpenAI API key is not set. Please set it in Settings to use the AI chat feature.',
            createdAt: Date.now(),
          };
          setMessages([warningMessage]);
          return;
        }
      }

      setMessages(loadedMessages);
    } catch (e) {
      console.error('Failed to load chat history:', e);
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    try {
      const messageId = uuidv4();
      await db.chats.add({
        id: messageId,
        threadId,
        bookId,
        paragraphHash,
        role,
        content,
        createdAt: Date.now(),
      });
      return messageId;
    } catch (e) {
      console.error('Failed to save message:', e);
      throw e;
    }
  };

  const scrollToBottom = () => {
    // Scroll within the messages container, not the page
    if (messagesContainerRef.current && messagesEndRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setError(null);

    // Add user message to UI immediately
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: userMessage,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Save user message
    try {
      await saveMessage('user', userMessage);
    } catch (e) {
      console.error('Failed to save user message:', e);
    }

    setIsLoading(true);

    try {
      // Get API key from settings
      const apiKeySetting = await db.settings.get('openai_api_key');
      if (!apiKeySetting?.value) {
        throw new Error('OpenAI API key not found. Please set it in Settings.');
      }

      // Prepare conversation history for API
      const conversationHistory = [...messages, userMsg].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Call API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId,
          messages: conversationHistory,
          sourceText: paragraphText,
          translation: translation || undefined,
          apiKey: apiKeySetting.value,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();
      const assistantMessage = data.message;

      // Add assistant message to UI
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: assistantMessage,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Save assistant message
      await saveMessage('assistant', assistantMessage);
    } catch (e) {
      console.error('Chat error:', e);
      setError(e instanceof Error ? e.message : 'Failed to send message');
      // Remove user message from UI on error
      setMessages((prev) => prev.filter((msg) => msg.id !== userMsg.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      // Delete all messages for this thread
      await db.chats.where('threadId').equals(threadId).delete();
      // Clear messages state
      setMessages([]);
      // Clear error if any
      setError(null);
      // Hide confirmation
      setShowDeleteConfirm(false);
      // Notify parent component that chat was deleted
      if (onChatDeleted) {
        onChatDeleted();
      }
    } catch (e) {
      console.error('Failed to delete chat:', e);
      setError('Failed to delete chat');
      setShowDeleteConfirm(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  if (!isOpen && !showAllChats) return null;

  // Calculate top position:
  // - Buttons are at top-1 (4px) and are 32px tall, so they end around 36px
  // - Chat should start below buttons, so around 48px (top-12)
  // - If note is open: note starts at top-10 (40px), has header (~40px) + textarea (noteHeight)
  //   So chat should be at: 40px (note top) + 40px (header) + noteHeight + 12px spacing
  const noteHeaderHeight = 40; // Approximate header height
  const buttonAreaHeight = 48; // Space for buttons (top-1 + 32px button + spacing)
  const spacing = 12; // Spacing between note and chat
  
  const topPosition = isNoteOpen && noteHeight > 0 
    ? `${40 + noteHeaderHeight + noteHeight + spacing}px` 
    : `${buttonAreaHeight}px`;

  return (
    <div
      className="absolute -right-3 w-64 animate-in fade-in slide-in-from-right-2 duration-200 z-20"
      style={{ 
        marginRight: '-220px',
        top: topPosition,
      }}
    >
      <div
        className="rounded-xl shadow-lg overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--zen-note-bg, white)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--zen-note-border, #fcd34d)',
          maxHeight: '500px',
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--zen-note-border, #fde68a)',
          }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--zen-note-header-text, #b45309)' }}>
            AI Companion
          </span>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleDelete}
                className="p-1 hover:bg-amber-200 rounded transition-colors"
                style={{ color: 'var(--zen-note-header-text, #b45309)' }}
                title="Delete chat"
              >
                <IoTrashOutline size={14} />
              </button>
            )}
            {!showAllChats && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-amber-200 rounded transition-colors"
                style={{ color: 'var(--zen-note-header-text, #b45309)' }}
              >
                <IoClose size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-3 space-y-3 relative"
          style={{
            minHeight: '150px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {messages.length === 0 && (
            <div className="text-xs text-center py-4" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
              Ask a question about this paragraph...
            </div>
          )}
          <div
            style={{
              opacity: showDeleteConfirm ? 0.3 : 1,
              filter: showDeleteConfirm ? 'blur(2px)' : 'none',
              transition: 'opacity 0.2s ease, filter 0.2s ease',
              pointerEvents: showDeleteConfirm ? 'none' : 'auto',
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`text-xs mb-3 ${
                  msg.role === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                <div
                  className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-rose-100 text-rose-900'
                      : 'bg-stone-100 text-stone-900'
                  }`}
                  style={{
                    backgroundColor:
                      msg.role === 'user'
                        ? 'rgba(255, 228, 230, 0.8)'
                        : 'rgba(245, 245, 244, 0.8)',
                    color: msg.role === 'user' ? '#9f1239' : '#1c1917',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
          {showDeleteConfirm && (
            <div
              className="absolute inset-0 flex items-center justify-center z-30"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(1px)',
              }}
            >
              <div
                className="px-4 py-3 rounded-xl shadow-lg"
                style={{
                  backgroundColor: 'var(--zen-note-bg, white)',
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  borderColor: 'var(--zen-note-border, #fcd34d)',
                  maxWidth: '80%',
                }}
              >
                <div className="text-sm font-medium mb-3 text-center" style={{ color: 'var(--zen-text, #1c1917)' }}>
                  Delete all messages?
                </div>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: 'rgba(220, 38, 38, 0.9)',
                      color: 'white',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.9)';
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={cancelDelete}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--zen-btn-bg, rgba(245, 245, 244, 0.9))',
                      color: 'var(--zen-text, #1c1917)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: 'var(--zen-border, rgba(0,0,0,0.1))',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--zen-btn-hover-bg, rgba(245, 245, 244, 1))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--zen-btn-bg, rgba(245, 245, 244, 0.9))';
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          {isLoading && (
            <div className="text-xs text-left">
              <div
                className="inline-block px-3 py-2 rounded-lg bg-stone-100 text-stone-900"
                style={{
                  backgroundColor: 'rgba(245, 245, 244, 0.8)',
                  color: '#1c1917',
                }}
              >
                <span className="inline-block w-2 h-2 bg-stone-400 rounded-full animate-pulse mr-1" />
                <span className="inline-block w-2 h-2 bg-stone-400 rounded-full animate-pulse mr-1" style={{ animationDelay: '0.2s' }} />
                <span className="inline-block w-2 h-2 bg-stone-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error message */}
        {error && (
          <div className="px-3 py-2 text-xs text-red-600 bg-red-50 border-t" style={{ borderColor: 'var(--zen-note-border, #fde68a)' }}>
            {error}
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t shrink-0" style={{ borderColor: 'var(--zen-note-border, #fde68a)' }}>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="w-full p-2 text-xs rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-rose-200"
            style={{
              minHeight: '60px',
              maxHeight: '120px',
              fontFamily: 'system-ui, sans-serif',
              backgroundColor: 'var(--zen-note-bg, white)',
              color: 'var(--zen-text, #44403c)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--zen-note-border, #fcd34d)',
            }}
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="mt-2 w-full px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

