'use client';
import { useMemo } from 'react';
import EChart, { C, yearColor } from './EChart';
import { useStations } from './useStation';
import { useSaved } from '@/lib/saved';
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
  const [sid, setSid] = useSaved('monthly:station', 'composite', v => stations.some(s => s.id === v));
  const [year, setYear] = useSaved('monthly:year', 'all');
  const [metric, setMetric] = useSaved<keyof Monthly>('monthly:metric', 'tMean', v => METRICS.some(m => m.key === v));
  const { data, loading } = useStations([sid]);
  const cols = data[sid];

  const monthly = useMemo(() => (cols ? toMonthly(toDaily(cols, idx.hours)) : []), [cols, idx.hours]);
  const years = useMemo(() => [...new Set(monthly.map(m => m.month.slice(0, 4)))], [monthly]);
  const chillWinters = useMemo(() => chillWinterMonths(monthly, idx.generatedAt.slice(0, 10)), [monthly, idx.generatedAt]);

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

          <YearOverlayCard title="每月氣溫" saveKey="monthly:temp" monthly={monthly} years={years} year={year} meta={meta}
            hint="「極端最高／最低溫」是當月單一小時量到的最高／最低溫。"
            options={[
              { key: 'tMean', label: '平均氣溫', unit: '°C', fields: ['t'] },
              { key: 'tMaxMean', label: '平均最高溫', unit: '°C', fields: ['t'] },
              { key: 'tMinMean', label: '平均最低溫', unit: '°C', fields: ['t'] },
              { key: 'tAbsMax', label: '極端最高溫', unit: '°C', fields: ['t'] },
              { key: 'tAbsMin', label: '極端最低溫', unit: '°C', fields: ['t'] },
            ]} />
          <YearOverlayCard title="每月雨量與雨日" saveKey="monthly:rain" monthly={monthly} years={years} year={year} meta={meta}
            hint="雨日＝日雨量 ≥ 1mm 的天數。"
            options={[
              { key: 'rain', label: '月雨量', unit: 'mm', fields: ['rain'], rain: true },
              { key: 'rainDays', label: '雨日', unit: '天', fields: ['rain'], rain: true },
            ]} />
          <YearOverlayCard title="每月濕度與高濕時數" saveKey="monthly:rh" monthly={monthly} years={years} year={year} meta={meta}
            hint="高濕病害時數＝濕度 ≥ 90% 且氣溫 15~28°C 的小時數，病害好發。"
            options={[
              { key: 'rhMean', label: '平均濕度', unit: '%', fields: ['rh'] },
              { key: 'wet', label: '高濕病害時數', unit: '小時', fields: ['rh', 't'] },
            ]} />

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

/* ---------------- 各年疊在 1~12 月上比較（每年一條線＋歷年平均虛線） ---------------- */
type OverlayOpt = { key: keyof Monthly; label: string; unit: string; fields: string[]; rain?: boolean };
const MONTHS12 = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

function YearOverlayCard({ title, hint, saveKey, options, monthly, years, year, meta }: {
  title: string; hint: string; saveKey: string; options: OverlayOpt[];
  monthly: Monthly[]; years: string[]; year: string; meta: StationMeta | undefined;
}) {
  const [key, setKey] = useSaved<keyof Monthly>(saveKey, options[0].key, v => options.some(o => o.key === v));
  const o = options.find(x => x.key === key) ?? options[0];
  // 雨量看雨量資料的完整度，其他看氣溫資料的完整度
  const cov = (m: Monthly) => (o.rain ? m.rainCoverage : m.coverage);
  const byMonth = new Map(monthly.map(m => [m.month, m]));
  const val = (y: string, i: number) => {
    const m = byMonth.get(`${y}-${String(i + 1).padStart(2, '0')}`);
    return m && cov(m) > 0.3 ? (m[o.key] as number | null) : null;
  };
  // 歷年平均：只用資料完整（> 70%）的月份
  const avg = MONTHS12.map((_, i) => {
    const vals = monthly.filter(m => +m.month.slice(5) === i + 1 && cov(m) > 0.7).map(m => m[o.key]).filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  });
  const shownYears = year === 'all' ? years : years.filter(y => y === year);
  return (
    <Card title={`${title}（各年比較）`} src={srcFor(meta, o.fields)}
      hint={`每一年一條線疊在 1～12 月上，同一個月份上下比較；黑色虛線是歷年平均。${hint}今年最後一個月只算到目前為止。`}>
      <div className="flex flex-wrap gap-2 mb-3">
        {options.map(x => (
          <button key={x.key} onClick={() => setKey(x.key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${x.key === o.key ? 'bg-stone-800 text-white border-stone-800' : 'bg-white border-stone-300'}`}>{x.label}</button>
        ))}
      </div>
      <EChart height={380} tipUnit={` ${o.unit}`} stateKey={`chart:/monthly|${title}:${o.key}`} option={{
        xAxis: { type: 'category', data: MONTHS12 },
        yAxis: { type: 'value', name: o.unit, scale: o.unit === '°C' || o.unit === '%' },
        series: [
          ...shownYears.map(y => {
            const k = years.indexOf(y);
            return {
              name: y, type: 'line' as const, color: yearColor(k, years.length),
              lineStyle: { width: k === years.length - 1 ? 4 : 2 },
              data: MONTHS12.map((_, i) => val(y, i)),
            };
          }),
          { name: `歷年平均`, type: 'line' as const, data: avg, color: '#292524', symbol: 'none', lineStyle: { width: 3, type: 'dashed' as const }, z: 10 },
        ],
      }} />
    </Card>
  );
}
