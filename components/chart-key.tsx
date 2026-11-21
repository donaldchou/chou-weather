'use client';
import { createContext } from 'react';

/** 區塊（Card）把標題傳給裡面的圖表，當作「記住這張圖的設定」用的名稱 */
export const ChartKeyContext = createContext<string | null>(null);
