'use client';
import { createContext } from 'react';
import type { SrcItem } from '@/lib/data';

/**
 * 區塊（Card）把標題、資料來源標籤、說明傳給裡面的圖表：
 * 標題用來當「記住這張圖的設定」的名稱，放大畫面也會顯示這些內容，才知道在看哪一張圖。
 */
export interface ChartInfo {
  title: string; src?: SrcItem[]; hint?: string;
  /** 整個區塊放大（全螢幕）：區塊裡的切換按鈕、說明在放大後也看得到、按得到 */
  full?: boolean; setFull?: (v: boolean) => void;
}
export const ChartKeyContext = createContext<ChartInfo | null>(null);
