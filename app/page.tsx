'use client';
import { useEffect, useState } from 'react';
import { compositeMeta, DataIndex, loadIndex, StationMeta } from '@/lib/data';
import OverviewTab from '@/components/OverviewTab';
import HourlyTab from '@/components/HourlyTab';
import PeachTab from '@/components/PeachTab';
import SourcesTab from '@/components/SourcesTab';
import { Loading } from '@/components/ui';

const TABS = [
  { id: 'peach', label: '🍑 水蜜桃農事指標' },
  { id: 'overview', label: '📅 每月統計與年度比較' },
  { id: 'hourly', label: '⏱️ 逐時資料' },
  { id: 'sources', label: '📚 資料來源與下載' },
] as const;

export default function Home() {
  const [idx, setIdx] = useState<DataIndex | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('peach');

  useEffect(() => { loadIndex().then(setIdx); }, []);

  const stations: StationMeta[] = idx ? [compositeMeta(idx), ...idx.stations] : [];

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-gradient-to-r from-green-800 to-emerald-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <h1 className="text-2xl font-bold">拉拉山上巴陵 天氣資料</h1>
          <p className="text-green-100 text-sm mt-1">
            2015 年起逐時氣溫、雨量、濕度、風速與水蜜桃農事指標
            {idx && <>　·　資料更新到 {idx.generatedAt.slice(0, 10)}</>}
          </p>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-stone-50 text-green-900' : 'text-green-50 hover:bg-white/10'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {!idx ? <Loading /> : (
          <>
            {tab === 'peach' && <PeachTab idx={idx} stations={stations} />}
            {tab === 'overview' && <OverviewTab idx={idx} stations={stations} />}
            {tab === 'hourly' && <HourlyTab idx={idx} stations={stations} />}
            {tab === 'sources' && <SourcesTab idx={idx} stations={stations} />}
          </>
        )}
      </main>
    </div>
  );
}
