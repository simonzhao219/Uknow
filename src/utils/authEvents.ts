/**
 * 認證狀態的簡易事件系統
 *
 * apiClient.ts 是純工具模組，沒有 react-router 的 navigate 可用，
 * 所以在 session 真的過期時透過這裡通知上層（App.tsx）以 SPA 導頁的方式
 * 處理，避免使用 window.location.href 造成整頁重新載入。
 */

type Listener = () => void;

let listeners: Listener[] = [];

export function onSessionExpired(callback: Listener): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((listener) => listener !== callback);
  };
}

export function emitSessionExpired(): void {
  listeners.forEach((listener) => listener());
}
