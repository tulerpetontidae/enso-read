/**
 * Event bridge for communication between the main React app and the isolated MobileBottomPanel.
 * Uses CustomEvents to completely decouple the panel from the main React render tree.
 */

export type BottomPanelTab = 'note' | 'chat' | 'translation';

// Event payloads
export interface PanelOpenPayload {
  tab: BottomPanelTab;
  paragraphHash: string;
  paragraphText: string;
  // Translation data
  translation?: string | null;
  translationError?: string | null;
  isTranslating?: boolean;
  // Note data
  noteContent?: string;
  // Chat data
  bookId?: string;
  chatThreadId?: string;
  hasChat?: boolean;
}

export interface PanelContentUpdatePayload {
  paragraphHash: string;
  type: 'translation' | 'note' | 'chat';
  // Translation updates
  translation?: string | null;
  translationError?: string | null;
  isTranslating?: boolean;
  // Note updates
  noteContent?: string;
}

export interface PanelClosePayload {
  // Empty for now, can be extended
}

// Note save callback - panel dispatches this when note is saved
export interface NoteSavePayload {
  paragraphHash: string;
  content: string;
}

// Translation retry request
export interface TranslationRetryPayload {
  paragraphHash: string;
}

// Chat created/deleted events
export interface ChatCreatedPayload {
  bookId: string;
  paragraphHash: string;
  threadId: string;
}

export interface ChatDeletedPayload {
  bookId: string;
  paragraphHash: string;
  threadId: string;
}

// Event names
export const PANEL_EVENTS = {
  OPEN: 'panel:open',
  CLOSE: 'panel:close',
  CONTENT_UPDATE: 'panel:content-update',
  NOTE_SAVE: 'panel:note-save',
  TRANSLATION_RETRY: 'panel:translation-retry',
  CHAT_CREATED: 'panel:chat-created',
  CHAT_DELETED: 'panel:chat-deleted',
} as const;

// Type-safe event dispatchers
export function dispatchPanelOpen(payload: PanelOpenPayload): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS.OPEN, { detail: payload }));
}

export function dispatchPanelClose(): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS.CLOSE, { detail: {} }));
}

export function dispatchPanelContentUpdate(payload: PanelContentUpdatePayload): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS.CONTENT_UPDATE, { detail: payload }));
}

export function dispatchNoteSave(payload: NoteSavePayload): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS.NOTE_SAVE, { detail: payload }));
}

export function dispatchTranslationRetry(payload: TranslationRetryPayload): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS.TRANSLATION_RETRY, { detail: payload }));
}

export function dispatchChatCreated(payload: ChatCreatedPayload): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS.CHAT_CREATED, { detail: payload }));
}

export function dispatchChatDeleted(payload: ChatDeletedPayload): void {
  window.dispatchEvent(new CustomEvent(PANEL_EVENTS.CHAT_DELETED, { detail: payload }));
}

// Type-safe event subscribers
type EventCallback<T> = (payload: T) => void;

export function subscribeToPanelOpen(callback: EventCallback<PanelOpenPayload>): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<PanelOpenPayload>).detail);
  window.addEventListener(PANEL_EVENTS.OPEN, handler);
  return () => window.removeEventListener(PANEL_EVENTS.OPEN, handler);
}

export function subscribeToPanelClose(callback: EventCallback<PanelClosePayload>): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<PanelClosePayload>).detail);
  window.addEventListener(PANEL_EVENTS.CLOSE, handler);
  return () => window.removeEventListener(PANEL_EVENTS.CLOSE, handler);
}

export function subscribeToPanelContentUpdate(callback: EventCallback<PanelContentUpdatePayload>): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<PanelContentUpdatePayload>).detail);
  window.addEventListener(PANEL_EVENTS.CONTENT_UPDATE, handler);
  return () => window.removeEventListener(PANEL_EVENTS.CONTENT_UPDATE, handler);
}

export function subscribeToNoteSave(callback: EventCallback<NoteSavePayload>): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<NoteSavePayload>).detail);
  window.addEventListener(PANEL_EVENTS.NOTE_SAVE, handler);
  return () => window.removeEventListener(PANEL_EVENTS.NOTE_SAVE, handler);
}

export function subscribeToTranslationRetry(callback: EventCallback<TranslationRetryPayload>): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<TranslationRetryPayload>).detail);
  window.addEventListener(PANEL_EVENTS.TRANSLATION_RETRY, handler);
  return () => window.removeEventListener(PANEL_EVENTS.TRANSLATION_RETRY, handler);
}

export function subscribeToChatCreated(callback: EventCallback<ChatCreatedPayload>): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<ChatCreatedPayload>).detail);
  window.addEventListener(PANEL_EVENTS.CHAT_CREATED, handler);
  return () => window.removeEventListener(PANEL_EVENTS.CHAT_CREATED, handler);
}

export function subscribeToChatDeleted(callback: EventCallback<ChatDeletedPayload>): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<ChatDeletedPayload>).detail);
  window.addEventListener(PANEL_EVENTS.CHAT_DELETED, handler);
  return () => window.removeEventListener(PANEL_EVENTS.CHAT_DELETED, handler);
}
