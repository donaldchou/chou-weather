'use client';
import { useMemo } from 'react';
import { C } from './EChart';
import YearOverlayCard from './YearOverlayCard';
import { useStations } from './useStation';
import { useSaved } from '@/lib/saved';
import { DataIndex, srcFor, StationMeta } from '@/lib/data';
import { Monthly, toDaily, toMonthly } from '@/lib/agri';
import { Card, Select, SrcTags, Stat, Loading } from './ui';

// fields：這個項目是用哪些觀測項目算出來的（決定標「實際量測值」或「估算值」）
const METRICS: { key: keyof Monthly; label: string; unit: string; bar?: boolean; fields: string[] }[] = [
  { key: 'tMean', label: '月平均氣溫', unit: '°C', fields: ['t'] },
  { key: 'tMinMean', label: '月平均最低溫', unit: '°C', fields: ['t'] },
  { key: 'tMaxMean', label: '月平均最高溫', unit: '°C', fields: ['t'] },
  { key: 'rain', label: '月雨量', unit: 'mm', bar: true, fields: ['rain'] },
  { key: 'rainDays', label: '雨日（≥1mm）', unit: '天', bar: true, fields: ['rain'] },
  { key: 'rhMean', label: '月平均濕度', unit: '%', fields: ['rh'] },
  { key: 'chill', label: '需冷時數（0~7.2°C）', unit: '小時', bar: true, fields: ['t'] },
  { key: 'frost', label: '霜害風險時數（≤2°C）', unit: '小時', bar: true, fields: ['t'] },
  { key: 'wet', label: '高濕病害時數', unit: '小時', bar: true, fields: ['rh', 't'] },
  { key: 'spray', label: '適合噴藥時數', unit: '小時', bar: true, fields: ['t', 'rh', 'rain', 'ws'] },
  { key: 'gdd', label: '生長度日', unit: '°C·日', bar: true, fields: ['t'] },
];

export default function OverviewTab({ idx, stations }: { idx: DataIndex; stations: StationMeta[] }) {
  const [sid, setSid] = useSaved('monthly:station', 'composite', v => stations.some(s => s.id === v));
  const [year, setYear] = useSaved('monthly:year', 'all');
  const { data, loading } = useStations([sid]);
  const cols = data[sid];

  const monthly = useMemo(() => (cols ? toMonthly(toDaily(cols, idx.hours)) : []), [cols, idx.hours]);
  const years = useMemo(() => [...new Set(monthly.map(m => m.month.slice(0, 4)))], [monthly]);
  const today = idx.generatedAt.slice(0, 10);

  const yearStats = useMemo(() => {
    return years.map(y => {
      const ms = monthly.filter(m => m.month.startsWith(y));
      const rains = ms.map(m => m.rain).filter(v => v != null) as number[];
      const tMins = ms.map(m => m.tAbsMin).filter(v => v != null) as number[];
      const tMaxs = ms.map(m => m.tAbsMax).filter(v => v != null) as number[];
      const tMeans = ms.filter(m => m.coverage > 0.7).map(m => m.tMean!).filter(v => v != null);
      return {
        y, months: ms.length,
        rain: rains.length ? Math.round(rains.reduce((s, v) => s + v, 0)) : null,
        tMean: tMeans.length === 12 ? Math.round((tMeans.reduce((s, v) => s + v, 0) / 12) * 10) / 10 : null,
        tMin: tMins.length ? Math.min(...tMins) : null,
        tMax: tMaxs.length ? Math.max(...tMaxs) : null,
      };
    });
  }, [monthly, years]);

  const meta = stations.find(s => s.id === sid)!;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Select label="測站" value={sid} onChange={setSid} options={stations.map(s => ({ value: s.id, label: `${s.name}（${s.elevation}m）` }))} />
          <Select label="年份" value={year} onChange={setYear} options={[{ value: 'all', label: `${years[0] ?? ''} ~ 現在全部` }, ...years.map(y => ({ value: y, label: `${y} 年` }))]} />
          <p className="text-sm text-stone-500 flex-1 min-w-60">{meta?.note}</p>
        </div>
      </Card>

      {loading || !cols ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(year === 'all' ? yearStats : yearStats.filter(s => s.y === year)).slice(-4).map(s => (
              <Card key={s.y} className="!p-4">
                <div className="font-semibold text-stone-700 mb-2">{s.y} 年{s.months < 12 && <span className="text-xs text-stone-400">（{s.months} 個月）</span>}</div>
                <div className="flex flex-wrap gap-1 mb-2"><SrcTags items={srcFor(meta, ['rain', 't'])} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="雨量" value={s.rain} unit="mm" color={C.rain} />
                  <Stat label="年均溫" value={s.tMean} unit="°C" color={C.temp} />
                  <Stat label="最低溫" value={s.tMin} unit="°C" color={C.tMin} />
                  <Stat label="最高溫" value={s.tMax} unit="°C" color={C.tMax} />
                </div>
              </Card>
            ))}
          </div>

          <YearOverlayCard title="每月氣溫（各年比較）" saveKey="monthly:temp" statePath="/monthly" today={today} monthly={monthly} years={years} year={year} meta={meta}
            hint="「極端最高／最低溫」是當月單一小時量到的最高／最低溫。"
            options={[
              { key: 'tMean', label: '平均氣溫', unit: '°C', fields: ['t'] },
              { key: 'tMaxMean', label: '平均最高溫', unit: '°C', fields: ['t'] },
              { key: 'tMinMean', label: '平均最低溫', unit: '°C', fields: ['t'] },
              { key: 'tAbsMax', label: '極端最高溫', unit: '°C', fields: ['t'] },
              { key: 'tAbsMin', label: '極端最低溫', unit: '°C', fields: ['t'] },
            ]} />
          <YearOverlayCard title="每月雨量與雨日（各年比較）" saveKey="monthly:rain" statePath="/monthly" today={today} monthly={monthly} years={years} year={year} meta={meta}
            hint="雨日＝日雨量 ≥ 1mm 的天數。"
            options={[
              { key: 'rain', label: '月雨量', unit: 'mm', fields: ['rain'], rain: true },
              { key: 'rainDays', label: '雨日', unit: '天', fields: ['rain'], rain: true },
            ]} />
          <YearOverlayCard title="每月濕度與高濕時數（各年比較）" saveKey="monthly:rh" statePath="/monthly" today={today} monthly={monthly} years={years} year={year} meta={meta}
            hint="高濕病害時數＝濕度 ≥ 90% 且氣溫 15~28°C 的小時數，病害好發。"
            options={[
              { key: 'rhMean', label: '平均濕度', unit: '%', fields: ['rh'] },
              { key: 'wet', label: '高濕病害時數', unit: '小時', fields: ['rh', 't'] },
            ]} />

          <YearOverlayCard title="年度比較：同一個月份，每一年的差別" saveKey="monthly:metric" statePath="/monthly"
            monthly={monthly} years={years} year={year} meta={meta} today={today}
            hint="選一個項目，看今年是偏冷、偏濕還是偏乾。"
            options={METRICS.map(m => ({ key: m.key, label: m.label, unit: m.unit, fields: m.fields, rain: m.key === 'rain' || m.key === 'rainDays', winter: m.key === 'chill' }))} />
        </>
      )}
    </div>
  );
}
