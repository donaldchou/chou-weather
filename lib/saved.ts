'use client';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * 記在這台電腦瀏覽器（localStorage）的設定：重新整理（F5）、換頁回來都還在。
 * 無痕模式等無法儲存時，只在這次瀏覽有效。
 */
const PREFIX = 'chou-weather:';
const listeners = new Map<string, Set<() => void>>();
const memory = new Map<string, string | null>();

export function readSaved(key: string): string | null {
  const k = PREFIX + key;
  if (memory.has(k)) return memory.get(k)!;
  let v: string | null = null;
  try { v = localStorage.getItem(k); } catch { /* 無法讀取就當作沒存 */ }
  memory.set(k, v);
  return v;
}

export function writeSaved(key: string, value: string | null) {
  const k = PREFIX + key;
  if (memory.get(k) === value) return;
  memory.set(k, value);
  try {
    if (value === null) localStorage.removeItem(k); else localStorage.setItem(k, value);
  } catch { /* 無法儲存時只在這次瀏覽有效 */ }
  listeners.get(k)?.forEach(l => l());
}

export function subscribeSaved(key: string, cb: () => void) {
  const k = PREFIX + key;
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(cb);
  return () => { listeners.get(k)?.delete(cb); };
}

/**
 * 像 useState，但值會記在瀏覽器。valid：存的值不合用（例如測站已不存在）就用預設值。
 */
export function useSaved<T>(key: string, initial: T, valid?: (v: T) => boolean): [T, (v: T | ((prev: T) => T)) => void] {
  const raw = useSyncExternalStore(cb => subscribeSaved(key, cb), () => readSaved(key), () => null);
  const initialJson = JSON.stringify(initial);
  const value = useMemo(() => {
    const fallback = JSON.parse(initialJson) as T;
    if (raw === null) return fallback;
    try {
      const v = JSON.parse(raw) as T;
      return valid && !valid(v) ? fallback : v;
    } catch {
      return fallback;
    }
    // valid 只用來檢查，不必因為它重新計算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, initialJson]);
  const set = useCallback((v: T | ((prev: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(value) : v;
    writeSaved(key, JSON.stringify(next));
  }, [key, value]);
  return [value, set];
}
