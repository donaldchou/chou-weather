'use client';
import { useEffect, useSyncExternalStore } from 'react';

/* ---------------- 共用：呼叫 API ---------------- */
export async function call<T>(url: string, init?: RequestInit & { code?: string }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.code !== undefined ? { 'x-verify-code': encodeURIComponent(init.code) } : {}),
    },
  });
  if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth/login')) {
    // 整頁重新載入：登入狀態改變，要讓 proxy 重新判斷
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status });
  return data as T;
}
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export type CodeResult = { ok: true } | { ok: false; error: string };

/* ---------------- 小型全域狀態 ---------------- */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => { value = v; listeners.forEach(l => l()); },
    use: () => useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => value, () => initial),
  };
}

/* ---------------- 目前登入的使用者 ---------------- */
export type Me = { id: string; email: string; name: string; role: 'admin' | 'user' };
const meStore = createStore<Me | null>(null);
let meLoading = false;

export function useMe() {
  const me = meStore.use();
  useEffect(() => {
    if (meStore.get() || meLoading) return;
    meLoading = true;
    call<Me>('/api/auth/me').then(meStore.set, () => {}).finally(() => { meLoading = false; });
  }, []);
  return me;
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  // 整頁重新載入，清掉畫面上所有資料
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/login';
}

/* ---------------- 驗證碼解鎖（到期時間，毫秒） ---------------- */
const unlockStore = createStore<number | null>(null);
let unlockLoaded = false;

export function useUnlock() {
  const until = unlockStore.use();
  useEffect(() => {
    if (unlockLoaded) return;
    unlockLoaded = true;
    call<{ expiresAt: number | null }>('/api/unlock').then(r => unlockStore.set(r.expiresAt), () => {});
  }, []);
  return until;
}
export const isUnlocked = () => {
  const u = unlockStore.get();
  return !!u && u > Date.now();
};
export async function unlock(code: string, hours: number): Promise<CodeResult> {
  try {
    const r = await call<{ expiresAt: number }>('/api/unlock', { method: 'POST', body: JSON.stringify({ code, hours }) });
    unlockStore.set(r.expiresAt);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
export async function lock() {
  await fetch('/api/unlock', { method: 'DELETE' });
  unlockStore.set(null);
}
