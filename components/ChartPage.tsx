'use client';
import { useEffect, useState } from 'react';
import { compositeMeta, DataIndex, loadIndex, StationMeta } from '@/lib/data';
import { Loading } from './ui';

/** 天氣圖表頁共用：標題＋載入資料索引，載入完再交給各分頁元件 */
export default function ChartPage({ title, render }: {
  title: string;
  render: (idx: DataIndex, stations: StationMeta[]) => React.ReactNode;
}) {
  const [idx, setIdx] = useState<DataIndex | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { loadIndex().then(setIdx, e => setErr(`連不上 ll3 主機，讀不到天氣資料：${(e as Error).message}`)); }, []);
  const stations: StationMeta[] = idx ? [compositeMeta(idx), ...idx.stations] : [];
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        <p className="mt-1 text-sm text-stone-500">
          拉拉山上巴陵 {idx ? idx.start.slice(0, 4) : ''} 年起逐時氣溫、雨量、濕度、風速
          {idx && (idx.latest
            ? <>　·　資料更新到 {idx.latest}（ll3 資料庫，每 10 分鐘更新）</>
            : <>　·　資料更新到 {idx.generatedAt.slice(0, 10)}<span className="text-amber-700">（暫時讀不到 ll3 資料庫的即時資料，只顯示到每天 10:00 匯出的部分）</span></>)}
        </p>
      </div>
      {err ? <p className="text-red-700 bg-red-50 rounded-lg p-4">{err}</p> : !idx ? <Loading /> : render(idx, stations)}
    </>
  );
}
