'use client';
import { useMemo, useState } from 'react';
import EChart, { C, yearColor } from './EChart';
import { useStations } from './useStation';
import { DataIndex, srcFor, srcOf, srcTags, StationMeta } from '@/lib/data';
import { chillByWinter, chillWinterMonths, gddByYear, Monthly, RULES, toDaily, toMonthly, WINTER_MONTH_LABELS } from '@/lib/agri';
import { Card, Loading, Select } from './ui';

const HOUR_METRICS: { key: keyof Monthly; rule: { label: string; desc: string }; fields: string[] }[] = [
  { key: 'frost', rule: RULES.frost, fields: ['t'] },
  { key: 'wet', rule: RULES.wet, fields: ['rh', 't'] },
  { key: 'spray', rule: RULES.spray, fields: ['t', 'rh', 'rain', 'ws'] },
  { key: 'heat', rule: RULES.heat, fields: ['t'] },
  { key: 'chill', rule: RULES.chill, fields: ['t'] },
];

const dateLabel = (base: string, offset: number) => {
  const d = new Date(Date.parse(base) + offset * 86400e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
// 彈出視窗標題：橫軸是「起算日後第幾天」，換成日期
const chillTitle = (v: number | string) => dateLabel('2023-10-01', +v);
const gddTitle = (v: number | string) => dateLabel('2023-01-01', +v);

export default function PeachTab({ idx, stations }: { idx: DataIndex; stations: StationMeta[] }) {
  const [sid, setSid] = useState('composite');
  const [hm, setHm] = useState<keyof Monthly>('frost');
  const ids = sid === 'openmeteo' || sid === 'composite' ? [sid] : [sid, 'openmeteo'];
  const { data, loading } = useStations(ids);
  const cols = data[sid];
  const om = data.openmeteo ?? data[sid];

  const daily = useMemo(() => (cols ? toDaily(cols, idx.hours) : []), [cols, idx.hours]);
  const monthly = useMemo(() => toMonthly(daily), [daily]);
  const winters = useMemo(() => chillByWinter(daily), [daily]);
  const gdd = useMemo(() => gddByYear(daily), [daily]);
  const chillWinters = useMemo(() => chillWinterMonths(monthly, idx.generatedAt.slice(0, 10)), [monthly, idx.generatedAt]);
  const omMonthly = useMemo(() => (om ? toMonthly(toDaily(om, idx.hours)) : []), [om, idx.hours]);
  const years = [...new Set(monthly.map(m => m.month.slice(0, 4)))];
  const mDef = HOUR_METRICS.find(m => m.key === hm)!;
  const tempStations = stations.filter(s => s.fields.includes('t') || s.id === 'composite');
  const meta = stations.find(s => s.id === sid);
  const omMeta = stations.find(s => s.id === 'openmeteo');
  const srcT = srcFor(meta, ['t']);

  // 日射量、日照：每一年一條線，疊在 1~12 月上比較
  const omYears = [...new Set(omMonthly.map(m => m.month.slice(0, 4)))];
  const byYear = (key: 'rad' | 'sun') => omYears.map((y, k) => ({
    name: y, type: 'line' as const, color: yearColor(k, omYears.length),
    lineStyle: { width: k === omYears.length - 1 ? 4 : 2 },
    data: Array.from({ length: 12 }, (_, i) => {
      const m = omMonthly.find(x => x.month === `${y}-${String(i + 1).padStart(2, '0')}`);
      return m && m.coverage > 0.3 ? m[key] : null;
    }),
  }));
  const months12 = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Select label="計算用的測站" value={sid} onChange={setSid} options={tempStations.map(s => ({ value: s.id, label: `${s.name}（${s.elevation}m）` }))} />
          <p className="text-sm text-stone-500 flex-1 min-w-60">
            建議用「上巴陵綜合」：氣溫已依海拔換算到上巴陵（每 100m 約差 0.6°C；實測驗證白嶺比四稜低 1.35°C，理論值 1.38°C）。
            以下指標的門檻是一般水蜜桃栽培的參考值，實際請依你的品種與經驗調整。
          </p>
        </div>
      </Card>

      {loading || !cols ? <Loading /> : (
        <>
          <Card title="❄️ 需冷量累積（每個冬天）" src={srcT}hint={`${RULES.chill.desc} 從每年 10/1 開始累積，曲線越高代表冬天越冷、低溫越足夠。`}>
            <EChart height={380} tipTitle={chillTitle} tipUnit=" 小時" option={{
              xAxis: { type: 'value', min: 0, max: 182, interval: 30, axisLabel: { formatter: (v: number) => dateLabel('2023-10-01', v) } },
              yAxis: { type: 'value', name: '累積小時' },
              tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
              series: winters.map((w, k) => ({
                name: `${w.label}（${w.total}h${w.coverage < 0.9 ? '，資料不完整' : ''}）`, type: 'line', symbol: 'none', data: w.points,
                color: yearColor(k, winters.length), lineStyle: { width: k === winters.length - 1 ? 4 : 2 },
              })),
            }} />
          </Card>

          <Card
            title={hm === 'chill' ? '📊 每個冬天的需冷時數（10 月～隔年 3 月）' : `📊 每月 ${mDef.rule.label}`}
            src={srcFor(meta, mDef.fields)}
            hint={hm === 'chill'
              ? `${mDef.rule.desc} 依冬天分組：例如「2025~2026 冬」是 2025 年 10～12 月加上 2026 年 1～3 月，圖例括號是整個冬天的合計。`
              : mDef.rule.desc}>
            <div className="flex flex-wrap gap-2 mb-3">
              {HOUR_METRICS.map(m => (
                <button key={m.key} onClick={() => setHm(m.key)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${hm === m.key ? 'bg-stone-800 text-white border-stone-800' : 'bg-white border-stone-300'}`}>{m.rule.label}</button>
              ))}
            </div>
            {hm === 'chill' ? (
              <EChart height={340} tipUnit=" 小時" option={{
                xAxis: { type: 'category', data: WINTER_MONTH_LABELS },
                yAxis: { type: 'value', name: '小時' },
                series: chillWinters.map((w, k) => ({
                  name: `${w.label}（${w.total}h）`, type: 'bar', color: yearColor(k, chillWinters.length), data: w.values,
                })),
              }} />
            ) : (
            <EChart height={340} option={{
              xAxis: { type: 'category', data: Array.from({ length: 12 }, (_, i) => `${i + 1}月`) },
              yAxis: { type: 'value', name: '小時' },
              series: years.map((y, k) => ({
                name: y, type: 'bar', color: yearColor(k, years.length),
                data: Array.from({ length: 12 }, (_, i) => {
                  const m = monthly.find(x => x.month === `${y}-${String(i + 1).padStart(2, '0')}`);
                  return m && m.coverage > 0.3 ? (m[hm] as number) : null;
                }),
              })),
            }} />
            )}
          </Card>

          <Card title="🌡️ 生長度日累積（每年 1/1 起）" src={srcT}hint={`${RULES.gdd.desc} 同一天比較各年的高低，可以預估今年開花、採收會提早還是延後。`}>
            <EChart height={360} tipTitle={gddTitle} option={{
              xAxis: { type: 'value', min: 0, max: 365, interval: 31, axisLabel: { formatter: (v: number) => dateLabel('2023-01-01', v) } },
              yAxis: { type: 'value', name: '°C·日' },
              series: gdd.map((g, k) => ({
                name: g.label, type: 'line', symbol: 'none', data: g.points,
                color: yearColor(k, gdd.length), lineStyle: { width: k === gdd.length - 1 ? 4 : 2 },
              })),
            }} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="💧 水分收支：雨量 vs 蒸發散" src={srcTags([['雨量', srcOf(meta, 'rain')], ['ET0', srcOf(omMeta, 'et0')]])}hint="柱：月雨量（實測）；線：參考蒸發散量 ET0（Open-Meteo 推估）。雨量低於 ET0 的月份，果園可能缺水、需注意灌溉。">
              <EChart option={{
                xAxis: { type: 'category', data: monthly.map(m => m.month) },
                yAxis: { type: 'value', name: 'mm' },
                series: [
                  { name: '月雨量', type: 'bar', data: monthly.map(m => m.rain), color: C.rain },
                  { name: 'ET0 蒸發散', type: 'line', data: omMonthly.map(m => m.et0), color: C.sun, lineStyle: { width: 3 } },
                ],
              }} />
            </Card>
            <Card title="🟫 土壤溫度與含水量" src={srcFor(omMeta, ['soilT0', 'soilM0'])}hint="Open-Meteo 衛星與模式推估（非實測），可看土壤乾濕的趨勢，數字僅供參考。">
              <EChart option={{
                xAxis: { type: 'category', data: omMonthly.map(m => m.month) },
                yAxis: [{ type: 'value', name: '°C', scale: true }, { type: 'value', name: '含水 %', scale: true, splitLine: { show: false } }],
                series: [
                  { name: '土溫 0–7cm', type: 'line', data: omMonthly.map(m => m.soilT0), color: C.soil, symbol: 'none' },
                  { name: '表土含水 0–7cm', type: 'line', yAxisIndex: 1, data: omMonthly.map(m => m.soilM0), color: C.rain, symbol: 'none' },
                  { name: '深層含水 28–100cm', type: 'line', yAxisIndex: 1, data: omMonthly.map(m => m.soilM28), color: '#1d4e89', symbol: 'none', lineStyle: { type: 'dashed' } },
                ],
              }} />
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="☀️ 每月日射量（各年比較）" src={srcFor(omMeta, ['rad'])}
              hint="每一年一條線，同一個月份上下比較。日照充足有助果實著色與甜度。今年最後一個月只算到目前為止。">
              <EChart height={340} tipUnit=" MJ/m²" option={{
                xAxis: { type: 'category', data: months12 },
                yAxis: { type: 'value', name: 'MJ/m²' },
                series: byYear('rad'),
              }} />
            </Card>
            <Card title="🌤️ 每月日照時數（各年比較）" src={srcFor(omMeta, ['sun'])}
              hint="每一年一條線，同一個月份上下比較。採收前日照少，糖度容易偏低。今年最後一個月只算到目前為止。">
              <EChart height={340} tipUnit=" 小時" option={{
                xAxis: { type: 'category', data: months12 },
                yAxis: { type: 'value', name: '小時' },
                series: byYear('sun'),
              }} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
