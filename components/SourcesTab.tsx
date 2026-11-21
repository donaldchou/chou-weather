'use client';
import { useState } from 'react';
import { DataIndex, FIELD_LABEL, fmtHour, indexOf, loadStation, StationMeta } from '@/lib/data';
import { Badge, Card, Select } from './ui';
import { useSaved } from '@/lib/saved';

const SOURCES = [
  {
    name: '交通部中央氣象署 — CODiS 氣候觀測資料查詢服務',
    url: 'https://codis.cwa.gov.tw/',
    kind: 'cwa',
    text: '自動氣象站每小時實測：氣溫、相對濕度、雨量、風速風向、最大陣風、氣壓。四稜、明池兩站 2025/3/27 才設站；白嶺、鴛鴦湖 2017/12～2018/1 起；復興、太平山 2010 年起完整（2018 年以前附近高山只有太平山有氣溫）；大曼為 2026/10 新設雨量站。',
  },
  {
    name: '經濟部水利署 — 水文資訊網（北區水資源分署雨量站）',
    url: 'https://gweb.wra.gov.tw/HydroInfo/',
    kind: 'wra',
    text: '石門水庫集水區的實測雨量站：巴陵（1220m）、嘎拉賀（1260m）、高義（620m）。逐時雨量經年報檢定後才公開，目前到 2025 年底；2023/11~2024/7 三站皆無資料，另有零星月份儀器停擺，已標為缺測。',
  },
  {
    name: 'Open-Meteo — 歷史天氣 API（ECMWF ERA5 / ERA5-Land 再分析）',
    url: 'https://open-meteo.com/en/docs/historical-weather-api',
    kind: 'openmeteo',
    text: '依上巴陵座標（24.6745N, 121.4146E, 海拔 1200m）計算的衛星＋模式重建資料，不是實測。只拿來補測站沒有量的項目：土壤溫度、土壤含水量、日射量、日照、參考蒸發散量 ET0、飽和水氣壓差 VPD、露點、雲量。',
  },
];

const yearList = (idx: DataIndex) => {
  const a: string[] = [];
  for (let y = +idx.generatedAt.slice(0, 4); y >= +idx.start.slice(0, 4); y--) a.push(String(y));
  return a;
};

function toCsv(meta: StationMeta, cols: Record<string, (number | null)[]>, from: number, to: number) {
  const fields = Object.keys(cols);
  const head = ['時間', ...fields.map(f => `${FIELD_LABEL[f]?.name ?? f}(${FIELD_LABEL[f]?.unit ?? ''})`)];
  const lines = [head.join(',')];
  for (let i = from; i <= to; i++) {
    const row = fields.map(f => cols[f][i] ?? '');
    if (row.every(v => v === '')) continue;
    lines.push([fmtHour(i), ...row].join(','));
  }
  return '﻿' + lines.join('\n');
}

export default function SourcesTab({ idx, stations }: { idx: DataIndex; stations: StationMeta[] }) {
  const [sid, setSid] = useSaved('sources:station', 'composite', v => stations.some(s => s.id === v));
  const [year, setYear] = useSaved('sources:year', idx.generatedAt.slice(0, 4), v => yearList(idx).includes(v));
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    const meta = stations.find(s => s.id === sid)!;
    const cols = await loadStation(sid);
    const from = Math.max(0, indexOf(`${year}-01-01T01`));
    const to = Math.min(idx.hours - 1, indexOf(`${+year + 1}-01-01T00`));
    const blob = new Blob([toCsv(meta, cols, from, to)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.name}_${year}_逐時.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <Card title="資料來源">
        <div className="space-y-4 mt-3">
          {SOURCES.map(s => (
            <div key={s.name} className="border-l-4 border-stone-300 pl-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge kind={s.kind} />
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{s.name}</a>
              </div>
              <p className="text-sm text-stone-600 mt-1">{s.text}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-400 mt-4">資料更新時間：{new Date(idx.generatedAt).toLocaleString('zh-TW')}。在專案資料夾執行 <code>npm run fetch</code> 可補抓最新資料。</p>
      </Card>

      <Card title="測站清單" hint="距離為與上巴陵（約 24.67N, 121.41E）的直線距離">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b">
                <th className="py-2 pr-3">測站</th><th className="pr-3">類型</th><th className="pr-3">海拔</th><th className="pr-3">距離</th>
                <th className="pr-3">資料期間</th><th className="pr-3">項目</th><th>說明</th>
              </tr>
            </thead>
            <tbody>
              {stations.map(s => (
                <tr key={s.id} className="border-b border-stone-100 align-top">
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">{s.name}<div className="text-xs text-stone-400">{s.id}</div></td>
                  <td className="pr-3 py-2"><Badge kind={s.source} /></td>
                  <td className="pr-3 py-2 whitespace-nowrap">{s.elevation} m</td>
                  <td className="pr-3 py-2 whitespace-nowrap">{s.distKm ? `${s.distKm} km` : '—'}</td>
                  <td className="pr-3 py-2 whitespace-nowrap">{s.from} ~ {s.to}</td>
                  <td className="pr-3 py-2">{s.fields.map(f => FIELD_LABEL[f]?.name ?? f).join('、')}</td>
                  <td className="py-2 text-stone-600">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="下載逐時資料（CSV，可用 Excel 開啟）">
        <div className="flex flex-wrap items-end gap-4 mt-2">
          <Select label="測站" value={sid} onChange={setSid} options={stations.map(s => ({ value: s.id, label: s.name }))} />
          <Select label="年份" value={year} onChange={setYear} options={yearList(idx).map(y => ({ value: y, label: `${y} 年` }))} />
          <button onClick={download} disabled={busy} className="px-5 py-2 rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50">
            {busy ? '產生中…' : '下載 CSV'}
          </button>
        </div>
      </Card>
    </div>
  );
}
