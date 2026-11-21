'use client';
import { ReactNode, useEffect, useState } from 'react';
import type { SrcItem } from '@/lib/data';
import { ChartKeyContext } from './chart-key';

/** 區塊標題後面的「實際量測值／估算值」標籤 */
export function SrcTags({ items }: { items: SrcItem[] }) {
  return (
    <>
      {items.map((s, k) => (
        <span key={k} title={s.note}
          className={`text-xs font-normal px-2 py-0.5 rounded-full whitespace-nowrap align-middle cursor-help ${s.kind === 'measured' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
          {s.label ? `${s.label}：` : ''}{s.kind === 'measured' ? '實際量測值' : '估算值'}
        </span>
      ))}
    </>
  );
}

export function Card({ title, hint, src, children, className = '' }: { title?: string; hint?: string; src?: SrcItem[]; children: ReactNode; className?: string }) {
  // 圖表的「放大」會把整個區塊放大成全螢幕（標題、說明、切換按鈕、圖表一起），按 Esc 或「關閉」回原畫面
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [full]);
  return (
    <section
      className={full
        ? 'fixed inset-0 z-50 bg-white p-4 sm:p-6 flex flex-col overflow-y-auto'
        : `bg-white rounded-xl border border-stone-200 shadow-sm p-5 ${className}`}
      // 放大時拿掉外層 space-y 加上的間距，否則全螢幕底下會露出一條原本的頁面
      style={full ? { margin: 0 } : undefined}>
      {title && (
        <h2 className={`${full ? 'text-xl' : 'text-lg'} font-bold text-stone-800 flex flex-wrap items-center gap-x-2 gap-y-1`}>
          {title}
          {src && src.length > 0 && <SrcTags items={src} />}
        </h2>
      )}
      {hint && <p className="text-sm text-stone-500 mt-1 mb-3">{hint}</p>}
      <ChartKeyContext.Provider value={title ? { title, src, hint, full, setFull } : null}>
        {full ? <div className="flex-1 min-h-0 flex flex-col">{children}</div> : children}
      </ChartKeyContext.Provider>
      {full && <p className="text-xs text-stone-400 text-center mt-2">在圖上按住滑鼠左右拖曳＝選取區間放大；點一下折線＝加粗（再點一次恢復）；按「重設縮放」看全部；按 Esc 或「關閉」回到原畫面</p>}
    </section>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col text-sm text-stone-600 gap-1">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="border border-stone-300 rounded-lg px-3 py-2 bg-white text-stone-800 text-base min-w-48">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Stat({ label, value, unit, color }: { label: string; value: number | null; unit: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value ?? '—'}<span className="text-xs font-normal text-stone-500 ml-0.5">{value != null ? unit : ''}</span></div>
    </div>
  );
}

export function Loading() {
  return <div className="text-center text-stone-500 py-16">資料載入中…</div>;
}

export function Badge({ kind }: { kind: string }) {
  const map: Record<string, [string, string]> = {
    cwa: ['氣象署實測', 'bg-blue-100 text-blue-800'],
    wra: ['水利署實測', 'bg-cyan-100 text-cyan-800'],
    openmeteo: ['模式推估', 'bg-amber-100 text-amber-800'],
    composite: ['綜合', 'bg-green-100 text-green-800'],
  };
  const [t, c] = map[kind] ?? [kind, 'bg-stone-100'];
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${c}`}>{t}</span>;
}
