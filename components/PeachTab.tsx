'use client';
import { useMemo } from 'react';
import EChart, { yearColor } from './EChart';
import YearOverlayCard from './YearOverlayCard';
import { useStations } from './useStation';
import { useSaved } from '@/lib/saved';
import { DataIndex, srcFor, srcOf, srcTags, StationMeta } from '@/lib/data';
import { chillByWinter, gddByYear, Monthly, RULES, toDaily, toMonthly } from '@/lib/agri';
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
  const [sid, setSid] = useSaved('peach:station', 'composite', v => stations.some(s => s.id === v));
  const ids = sid === 'openmeteo' || sid === 'composite' ? [sid] : [sid, 'openmeteo'];
  const { data, loading } = useStations(ids);
  const cols = data[sid];
  const om = data.openmeteo ?? data[sid];

  const daily = useMemo(() => (cols ? toDaily(cols, idx.hours) : []), [cols, idx.hours]);
  const monthly = useMemo(() => toMonthly(daily), [daily]);
  const winters = useMemo(() => chillByWinter(daily), [daily]);
  const gdd = useMemo(() => gddByYear(daily), [daily]);
  const today = idx.generatedAt.slice(0, 10);
  const omMonthly = useMemo(() => (om ? toMonthly(toDaily(om, idx.hours)) : []), [om, idx.hours]);
  const years = [...new Set(monthly.map(m => m.month.slice(0, 4)))];
  const tempStations = stations.filter(s => s.fields.includes('t') || s.id === 'composite');
  const meta = stations.find(s => s.id === sid);
  const omMeta = stations.find(s => s.id === 'openmeteo');
  const srcT = srcFor(meta, ['t']);

  const omYears = [...new Set(omMonthly.map(m => m.month.slice(0, 4)))];
  const months12 = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

  // 水分收支：每一年一條線疊在 1~12 月上（月雨量，或 月雨量 − ET0）
  const [waterView, setWaterView] = useSaved<'rain' | 'balance'>('peach:water', 'rain', v => v === 'rain' || v === 'balance');
  const waterYears = [...new Set(monthly.map(m => m.month.slice(0, 4)))];
  const ymKey = (y: string, i: number) => `${y}-${String(i + 1).padStart(2, '0')}`;
  const waterByYear = (kind: 'rain' | 'balance') => waterYears.map((y, k) => ({
    name: y, type: 'line' as const, color: yearColor(k, waterYears.length),
    lineStyle: { width: k === waterYears.length - 1 ? 4 : 2 },
    data: Array.from({ length: 12 }, (_, i) => {
      const rain = monthly.find(x => x.month === ymKey(y, i))?.rain ?? null;
      if (kind === 'rain') return rain;
      const et0 = omMonthly.find(x => x.month === ymKey(y, i))?.et0 ?? null;
      return rain != null && et0 != null ? Math.round((rain - et0) * 10) / 10 : null;
    }),
  }));
  // ET0 各月份的歷年平均（只算完整的月份）
  const et0Avg = Array.from({ length: 12 }, (_, i) => {
    const vals = omMonthly.filter(m => +m.month.slice(5) === i + 1 && m.coverage > 0.9 && m.et0 != null).map(m => m.et0!);
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  });

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

          <YearOverlayCard title="📊 水蜜桃農事時數（各年比較）" saveKey="peach:metric" statePath="/"
            monthly={monthly} years={years} meta={meta} today={today}
            options={HOUR_METRICS.map(m => ({ key: m.key, label: m.rule.label, unit: '小時', fields: m.fields, winter: m.key === 'chill', desc: m.rule.desc }))} />

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

          <div className="space-y-5">
            <Card title="💧 水分收支：雨量 vs 蒸發散（各年比較）" src={srcTags([['雨量', srcOf(meta, 'rain')], ['ET0', srcOf(omMeta, 'et0')]])}
              hint={waterView === 'rain'
                ? '每一年一條線：月雨量（實測）。黑色虛線是參考蒸發散量 ET0 的歷年平均（Open-Meteo 推估）；雨量線低於虛線的月份，果園可能缺水、需注意灌溉。今年最後一個月只算到目前為止。'
                : '每一年一條線：月雨量 − 當月 ET0。高於 0＝雨水有剩，低於 0（紅線以下）＝蒸發比下雨多、可能缺水。今年最後一個月只算到目前為止。'}>
              <div className="flex flex-wrap gap-2 mb-3">
                {([['rain', '月雨量（與 ET0 平均比較）'], ['balance', '水分盈虧（雨量 − ET0）']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setWaterView(v)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${waterView === v ? 'bg-stone-800 text-white border-stone-800' : 'bg-white border-stone-300'}`}>{l}</button>
                ))}
              </div>
              <EChart height={380} tipUnit=" mm" stateKey={`chart:/|水分收支:${waterView}`} option={waterView === 'rain' ? {
                xAxis: { type: 'category', data: months12 },
                yAxis: { type: 'value', name: 'mm' },
                series: [
                  ...waterByYear('rain'),
                  { name: 'ET0 蒸發散（歷年平均）', type: 'line', data: et0Avg, color: '#292524', symbol: 'none', lineStyle: { width: 3, type: 'dashed' }, z: 10 },
                ],
              } : {
                xAxis: { type: 'category', data: months12 },
                yAxis: { type: 'value', name: 'mm' },
                // 0 的紅線每一年都畫（疊在同一位置），只要有任何一年顯示就看得到
                series: waterByYear('balance').map(s => ({
                  ...s, markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: '#dc2626', width: 2 }, label: { formatter: '0（雨量＝蒸發）', position: 'insideEndTop', color: '#dc2626' } },
                })),
              }} />
            </Card>
            <YearOverlayCard title="🟫 土壤溫度與含水量（各年比較）" saveKey="peach:soil" statePath="/"
              monthly={omMonthly} years={omYears} meta={omMeta} today={today}
              hint="Open-Meteo 衛星與模式推估（非實測），可看土壤乾濕的趨勢，數字僅供參考。"
              options={[
                { key: 'soilT0', label: '土溫 0–7cm', unit: '°C', fields: ['soilT0'] },
                { key: 'soilM0', label: '表土含水 0–7cm', unit: '%', fields: ['soilM0'] },
                { key: 'soilM28', label: '深層含水 28–100cm', unit: '%', fields: ['soilM28'] },
              ]} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <YearOverlayCard title="☀️ 每月日射量（各年比較）" saveKey="peach:rad" statePath="/"
              monthly={omMonthly} years={omYears} meta={omMeta} today={today}
              hint="日照充足有助果實著色與甜度。"
              options={[{ key: 'rad', label: '月日射量', unit: 'MJ/m²', fields: ['rad'] }]} />
            <YearOverlayCard title="🌤️ 每月日照時數（各年比較）" saveKey="peach:sun" statePath="/"
              monthly={omMonthly} years={omYears} meta={omMeta} today={today}
              hint="採收前日照少，糖度容易偏低。"
              options={[{ key: 'sun', label: '月日照時數', unit: '小時', fields: ['sun'] }]} />
          </div>
        </>
      )}
    </div>
  );
}
