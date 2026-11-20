'use client';
import { ReactNode } from 'react';

export function Card({ title, hint, children, className = '' }: { title?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-stone-200 shadow-sm p-5 ${className}`}>
      {title && <h2 className="text-lg font-bold text-stone-800">{title}</h2>}
      {hint && <p className="text-sm text-stone-500 mt-1 mb-3">{hint}</p>}
      {children}
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
