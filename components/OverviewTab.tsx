'use client';
import { useMemo, useState } from 'react';
import EChart, { C, yearColor } from './EChart';
import { useStations } from './useStation';
import { DataIndex, srcFor, StationMeta } from '@/lib/data';
import { chillWinterMonths, Monthly, toDaily, toMonthly, WINTER_MONTH_LABELS } from '@/lib/agri';
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
  const [sid, setSid] = useState('composite');
  const [year, setYear] = useState('all');
  const [metric, setMetric] = useState<keyof Monthly>('tMean');
  const { data, loading } = useStations([sid]);
  const cols = data[sid];

  const monthly = useMemo(() => (cols ? toMonthly(toDaily(cols, idx.hours)) : []), [cols, idx.hours]);
  const years = useMemo(() => [...new Set(monthly.map(m => m.month.slice(0, 4)))], [monthly]);
  const chillWinters = useMemo(() => chillWinterMonths(monthly, idx.generatedAt.slice(0, 10)), [monthly, idx.generatedAt]);
  const shown = year === 'all' ? monthly : monthly.filter(m => m.month.startsWith(year));
  const months = shown.map(m => m.month);

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
  const mDef = METRICS.find(m => m.key === metric)!;

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

          <Card title="每月氣溫" src={srcFor(meta, ['t'])}hint="實線：月平均；上下虛線：月平均最高 / 最低溫；圓點：當月極端最高 / 最低溫">
            <EChart option={{
              xAxis: { type: 'category', data: months },
              yAxis: { type: 'value', name: '°C' },
              series: [
                { name: '平均最高溫', type: 'line', data: shown.map(m => m.tMaxMean), lineStyle: { type: 'dashed' }, color: C.tMax, symbol: 'none' },
                { name: '平均氣溫', type: 'line', data: shown.map(m => m.tMean), color: C.temp, lineStyle: { width: 3 } },
                { name: '平均最低溫', type: 'line', data: shown.map(m => m.tMinMean), lineStyle: { type: 'dashed' }, color: C.tMin, symbol: 'none' },
                { name: '極端最高', type: 'scatter', data: shown.map(m => m.tAbsMax), color: C.tMax, symbolSize: 6 },
                { name: '極端最低', type: 'scatter', data: shown.map(m => m.tAbsMin), color: C.tMin, symbolSize: 6 },
              ],
            }} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="每月雨量與雨日" src={srcFor(meta, ['rain'])}hint="柱：月雨量 mm；線：下雨天數（日雨量 ≥ 1mm）">
              <EChart option={{
                xAxis: { type: 'category', data: months },
                yAxis: [{ type: 'value', name: 'mm' }, { type: 'value', name: '天', splitLine: { show: false } }],
                series: [
                  { name: '月雨量', type: 'bar', data: shown.map(m => m.rain), color: C.rain },
                  { name: '雨日', type: 'line', yAxisIndex: 1, data: shown.map(m => m.rainDays), color: C.grey },
                ],
              }} />
            </Card>
            <Card title="每月濕度與高濕時數" src={srcFor(meta, ['rh', 't'])}hint="線：月平均濕度；柱：濕度 ≥90% 且 15~28°C 的小時數（病害好發）">
              <EChart option={{
                xAxis: { type: 'category', data: months },
                yAxis: [{ type: 'value', name: '%', min: 50, max: 100 }, { type: 'value', name: '小時', splitLine: { show: false } }],
                series: [
                  { name: '高濕病害時數', type: 'bar', yAxisIndex: 1, data: shown.map(m => m.wet), color: '#c9e4ca' },
                  { name: '平均濕度', type: 'line', data: shown.map(m => m.rhMean), color: C.rh, lineStyle: { width: 3 } },
                ],
              }} />
            </Card>
          </div>

          <Card title="年度比較：同一個月份，每一年的差別" src={srcFor(meta, mDef.fields)}hint="選一個項目，比較每一年同月份的數值，看今年是偏冷、偏濕還是偏乾">
            <div className="mb-3">
              <Select label="比較項目" value={metric as string} onChange={v => setMetric(v as keyof Monthly)} options={METRICS.map(m => ({ value: m.key as string, label: m.label }))} />
            </div>
            {metric === 'chill' ? (
              <>
                <p className="mb-2 text-sm text-stone-500">需冷時數依冬天（10 月～隔年 3 月）分組：例如「2025~2026 冬」是 2025 年 10～12 月加上 2026 年 1～3 月，圖例括號是整個冬天的合計。</p>
                <EChart height={360} tipUnit=" 小時" option={{
                  xAxis: { type: 'category', data: WINTER_MONTH_LABELS },
                  yAxis: { type: 'value', name: mDef.unit },
                  series: chillWinters.map((w, k) => ({
                    name: `${w.label}（${w.total}h）`, type: 'bar', color: yearColor(k, chillWinters.length), data: w.values,
                  })),
                }} />
              </>
            ) : (
            <EChart height={360} option={{
              xAxis: { type: 'category', data: Array.from({ length: 12 }, (_, i) => `${i + 1}月`) },
              yAxis: { type: 'value', name: mDef.unit, scale: !mDef.bar },
              series: years.map((y, k) => ({
                name: `${y}`,
                type: mDef.bar ? 'bar' : 'line',
                color: yearColor(k, years.length),
                lineStyle: { width: y === years.at(-1) ? 4 : 2 },
                data: Array.from({ length: 12 }, (_, i) => {
                  const m = monthly.find(x => x.month === `${y}-${String(i + 1).padStart(2, '0')}`);
                  return m && m.coverage > 0.3 ? (m[metric] as number | null) : null;
                }),
              })),
            }} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
