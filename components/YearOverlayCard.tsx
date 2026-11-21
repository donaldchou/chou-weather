'use client';
import EChart, { yearColor } from './EChart';
import { Card } from './ui';
import { srcFor, StationMeta } from '@/lib/data';
import { Monthly, WINTER_MONTHS, WINTER_MONTH_LABELS } from '@/lib/agri';
import { useSaved } from '@/lib/saved';

/**
 * 各年疊在一起比較：每一年一條線（x 軸 1～12 月），黑色虛線是歷年平均。
 * winter：依冬天分組（x 軸 10 月～隔年 3 月，例：「2025~2026 冬」＝2025 年 10～12 月＋2026 年 1～3 月）。
 * 多個項目時用按鈕切換（記住選擇）；只有一個項目就不顯示按鈕。
 */
export type OverlayOpt = {
  key: keyof Monthly; label: string; unit: string; fields: string[];
  rain?: boolean; // 用雨量資料的完整度判斷（否則用氣溫資料的完整度）
  winter?: boolean; // 依冬天分組
  desc?: string; // 選到這個項目時，說明文字後面加上這段
};

const MONTHS12 = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const r1 = (v: number) => Math.round(v * 10) / 10;

export default function YearOverlayCard({ title, hint, saveKey, statePath, options, monthly, years, year = 'all', meta, today }: {
  title: string; hint?: string; saveKey: string; statePath: string; options: OverlayOpt[];
  monthly: Monthly[]; years: string[]; year?: string; meta: StationMeta | undefined; today: string;
}) {
  const [key, setKey] = useSaved<keyof Monthly>(saveKey, options[0].key, v => options.some(o => o.key === v));
  const o = options.find(x => x.key === key) ?? options[0];
  // 資料完整度：雨量看雨量資料；用到濕度的項目（平均濕度、高濕、噴藥）同時看濕度資料，
  // 否則沒有濕度資料的年份（例：2018 年以前）會被算成 0
  const cov = (m: Monthly) => (o.rain ? m.rainCoverage : o.fields.includes('rh') ? Math.min(m.coverage, m.rhCoverage) : m.coverage);
  const byMonth = new Map(monthly.map(m => [m.month, m]));
  const pick = (ym: string) => {
    const m = byMonth.get(ym);
    return m && cov(m) > 0.3 ? (m[o.key] as number | null) : null;
  };
  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

  // 每一條線：一般是每年（1～12 月），冬天模式是每個冬天（10～3 月）
  const months = o.winter ? WINTER_MONTHS : MONTHS12.map((_, i) => i + 1);
  const keyOf = (y: number, m: number) => ym(o.winter && m < 10 ? y + 1 : y, m);
  let lines: { name: string; start: number; data: (number | null)[] }[];
  if (o.winter) {
    const ys = [+years[0] - 1, ...years.map(Number)];
    lines = ys
      .map(y => {
        const data = months.map(m => pick(keyOf(y, m)));
        const ongoing = keyOf(y, 3) >= today.slice(0, 7);
        const total = data.reduce<number>((s, v) => s + (v ?? 0), 0);
        const name = `${y}~${y + 1} 冬${ongoing ? '（進行中）' : ''}${o.unit === '小時' ? `（${Math.round(total)}h）` : ''}`;
        return { name, start: y, data };
      })
      .filter(l => l.data.some(v => v != null));
  } else {
    lines = years.map(y => ({ name: y, start: +y, data: months.map(m => pick(ym(+y, m))) }));
  }
  // 上方「年份」選單選了某一年：一般模式只看那一年；冬天模式看跨到那一年的兩個冬天
  const shown = year === 'all' ? lines : lines.filter(l => (o.winter ? l.start === +year || l.start === +year - 1 : l.start === +year));

  // 歷年平均：只用資料完整（> 70%）的月份
  const avg = months.map(m => {
    const vals = monthly
      .filter(x => +x.month.slice(5) === m && cov(x) > 0.7)
      .map(x => x[o.key])
      .filter((v): v is number => typeof v === 'number');
    return vals.length ? r1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  });

  const n = lines.length;
  const intro = o.winter
    ? '每個冬天一條線疊在 10 月～隔年 3 月上（例：「2025~2026 冬」＝2025 年 10～12 月＋2026 年 1～3 月），圖例括號是整個冬天的合計；'
    : '每一年一條線疊在 1～12 月上，同一個月份上下比較；';
  return (
    <Card title={title} src={srcFor(meta, o.fields)}
      hint={`${intro}黑色虛線是歷年平均。${o.desc ?? ''}${hint ?? ''}今年最後一個月只算到目前為止。`}>
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {options.map(x => (
            <button key={x.key} onClick={() => setKey(x.key)}
              className={`px-3 py-1.5 rounded-full text-sm border ${x.key === o.key ? 'bg-stone-800 text-white border-stone-800' : 'bg-white border-stone-300'}`}>{x.label}</button>
          ))}
        </div>
      )}
      <EChart height={380} tipUnit={` ${o.unit}`} stateKey={`chart:${statePath}|${title}:${o.key}`} option={{
        xAxis: { type: 'category', data: o.winter ? WINTER_MONTH_LABELS : MONTHS12 },
        yAxis: { type: 'value', name: o.unit, scale: o.unit === '°C' || o.unit === '%' },
        series: [
          ...shown.map(l => {
            const k = lines.indexOf(l);
            return {
              name: l.name, type: 'line' as const, color: yearColor(k, n),
              lineStyle: { width: k === n - 1 ? 4 : 2 }, data: l.data,
            };
          }),
          { name: '歷年平均', type: 'line' as const, data: avg, color: '#292524', symbol: 'none', lineStyle: { width: 3, type: 'dashed' as const }, z: 10 },
        ],
      }} />
    </Card>
  );
}
