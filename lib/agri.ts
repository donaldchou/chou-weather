// 統計與水蜜桃農事指標
import { Col, Cols, dayOf, timeOf } from './data';

export const RULES = {
  chill: { lo: 0, hi: 7.2, label: '需冷時數', desc: '氣溫 0~7.2°C 的小時數（低需冷模式）。水蜜桃要累積足夠低溫才會整齊萌芽開花。' },
  frost: { max: 2, label: '霜害風險時數', desc: '氣溫 ≤ 2°C。開花、幼果期（約 2~4 月）遇到容易凍傷花器與幼果。' },
  wet: { rh: 90, tLo: 15, tHi: 28, label: '高濕病害時數', desc: '濕度 ≥ 90% 且氣溫 15~28°C。縮葉病、褐腐病、細菌性穿孔病等容易發生。' },
  heat: { min: 30, label: '高溫時數', desc: '氣溫 ≥ 30°C。果實日燒、品質下降的風險。' },
  spray: { wsMax: 3, rhMax: 90, tLo: 5, tHi: 30, hFrom: 6, hTo: 18, label: '適合噴藥時數', desc: '白天 6~18 點、這一小時與下一小時都沒下雨、風速 < 3 m/s、濕度 < 90%、氣溫 5~30°C。' },
  gdd: { base: 10, label: '生長度日 GDD', desc: '每日 (最高溫+最低溫)/2 − 10°C 的累積，越大代表果實發育越快、越早熟。' },
};

const isNum = (v: unknown): v is number => typeof v === 'number';

export interface Daily {
  day: string;
  tMean: number | null; tMax: number | null; tMin: number | null;
  rhMean: number | null; rain: number | null;
  wsMean: number | null; gustMax: number | null;
  sun: number | null; rad: number | null; et0: number | null;
  soilT0: number | null; soilM0: number | null; soilM28: number | null; vpd: number | null;
  chill: number; frost: number; wet: number; heat: number; spray: number;
  tCount: number; rainCount: number; rhCount: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => (a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null);
const sum = (a: number[], digits = 1) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) * 10 ** digits) / 10 ** digits : null);

/** 逐時 → 逐日 */
export function toDaily(cols: Cols, n: number): Daily[] {
  const out: Daily[] = [];
  const g = (f: string, i: number) => cols[f]?.[i] ?? null;
  let i = 0;
  while (i < n) {
    const day = dayOf(i);
    const acc: Record<string, number[]> = {};
    const push = (k: string, v: number | null) => { if (isNum(v)) (acc[k] ??= []).push(v); };
    let chill = 0, frost = 0, wet = 0, heat = 0, spray = 0;
    for (; i < n && dayOf(i) === day; i++) {
      const t = g('t', i), rh = g('rh', i), rain = g('rain', i), ws = g('ws', i);
      push('t', t); push('rh', rh); push('rain', rain); push('ws', ws); push('gust', g('gust', i));
      push('sun', g('sun', i)); push('rad', g('rad', i)); push('et0', g('et0', i));
      push('soilT0', g('soilT0', i)); push('soilM0', g('soilM0', i)); push('soilM28', g('soilM28', i)); push('vpd', g('vpd', i));
      if (isNum(t)) {
        if (t >= RULES.chill.lo && t <= RULES.chill.hi) chill++;
        if (t <= RULES.frost.max) frost++;
        if (t >= RULES.heat.min) heat++;
        if (isNum(rh) && rh >= RULES.wet.rh && t >= RULES.wet.tLo && t <= RULES.wet.tHi) wet++;
        const h = timeOf(i).getUTCHours();
        const next = g('rain', i + 1);
        if (h > RULES.spray.hFrom && h <= RULES.spray.hTo && rain === 0 && (next == null || next === 0)
          && (!isNum(ws) || ws < RULES.spray.wsMax) && isNum(rh) && rh < RULES.spray.rhMax
          && t >= RULES.spray.tLo && t <= RULES.spray.tHi) spray++;
      }
    }
    const t = acc.t ?? [];
    out.push({
      day,
      tMean: mean(t), tMax: t.length ? Math.max(...t) : null, tMin: t.length ? Math.min(...t) : null,
      rhMean: mean(acc.rh ?? []), rain: sum(acc.rain ?? []),
      wsMean: mean(acc.ws ?? []), gustMax: acc.gust?.length ? Math.max(...acc.gust) : null,
      sun: sum(acc.sun ?? []), rad: sum(acc.rad ?? []), et0: sum(acc.et0 ?? []),
      soilT0: mean(acc.soilT0 ?? []), soilM0: mean(acc.soilM0 ?? []), soilM28: mean(acc.soilM28 ?? []),
      vpd: acc.vpd ? Math.round((acc.vpd.reduce((s, x) => s + x, 0) / acc.vpd.length) * 100) / 100 : null,
      chill, frost, wet, heat, spray,
      tCount: t.length, rainCount: acc.rain?.length ?? 0, rhCount: acc.rh?.length ?? 0,
    });
  }
  return out;
}

export interface Monthly {
  month: string;
  tMean: number | null; tMaxMean: number | null; tMinMean: number | null; tAbsMax: number | null; tAbsMin: number | null;
  rhMean: number | null; rain: number | null; rainDays: number; rainCoverage: number;
  wsMean: number | null; gustMax: number | null;
  sun: number | null; rad: number | null; et0: number | null; soilT0: number | null; soilM0: number | null; soilM28: number | null;
  chill: number; frost: number; wet: number; heat: number; spray: number; gdd: number;
  coverage: number; // 氣溫資料完整度 0~1
  rhCoverage: number; // 濕度資料完整度 0~1（高濕、噴藥、平均濕度要看這個）
}

/** 逐日 → 逐月 */
export function toMonthly(daily: Daily[]): Monthly[] {
  const groups = new Map<string, Daily[]>();
  for (const d of daily) {
    const m = d.day.slice(0, 7);
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m)!.push(d);
  }
  const pick = (ds: Daily[], k: keyof Daily) => ds.map(d => d[k]).filter(isNum) as number[];
  return [...groups.entries()].map(([month, ds]) => {
    const full = ds.filter(d => d.tCount >= 20);
    const rainDs = ds.filter(d => d.rainCount >= 20);
    const tMax = pick(full, 'tMax'), tMin = pick(full, 'tMin');
    return {
      month,
      tMean: mean(pick(full, 'tMean')), tMaxMean: mean(tMax), tMinMean: mean(tMin),
      tAbsMax: tMax.length ? Math.max(...tMax) : null, tAbsMin: tMin.length ? Math.min(...tMin) : null,
      rhMean: mean(pick(full, 'rhMean')),
      rain: rainDs.length ? sum(pick(rainDs, 'rain')) : null,
      rainDays: rainDs.filter(d => (d.rain ?? 0) >= 1).length,
      rainCoverage: rainDs.length / ds.length,
      wsMean: mean(pick(ds, 'wsMean')), gustMax: pick(ds, 'gustMax').length ? Math.max(...pick(ds, 'gustMax')) : null,
      sun: sum(pick(ds, 'sun')), rad: sum(pick(ds, 'rad')), et0: sum(pick(ds, 'et0')),
      soilT0: mean(pick(ds, 'soilT0')), soilM0: mean(pick(ds, 'soilM0')), soilM28: mean(pick(ds, 'soilM28')),
      chill: ds.reduce((s, d) => s + d.chill, 0), frost: ds.reduce((s, d) => s + d.frost, 0),
      wet: ds.reduce((s, d) => s + d.wet, 0), heat: ds.reduce((s, d) => s + d.heat, 0),
      spray: ds.reduce((s, d) => s + d.spray, 0),
      gdd: r1(full.reduce((s, d) => s + Math.max(0, ((d.tMax! + d.tMin!) / 2) - RULES.gdd.base), 0)),
      coverage: ds.reduce((s, d) => s + d.tCount, 0) / (ds.length * 24),
      rhCoverage: ds.reduce((s, d) => s + d.rhCount, 0) / (ds.length * 24),
    };
  });
}

/** 每個冬天（10/1 ~ 隔年 3/31）的需冷時數累積曲線 */
export function chillByWinter(daily: Daily[]) {
  const winters: { label: string; points: [number, number][]; total: number; coverage: number }[] = [];
  const years = [...new Set(daily.map(d => +d.day.slice(0, 4)))];
  for (const y of years) {
    const start = `${y}-10-01`, end = `${y + 1}-03-31`;
    const ds = daily.filter(d => d.day >= start && d.day <= end);
    if (ds.length < 10) continue;
    let cum = 0;
    const t0 = Date.parse(start);
    const points: [number, number][] = ds.map(d => { cum += d.chill; return [Math.round((Date.parse(d.day) - t0) / 86400e3), cum]; });
    const ongoing = ds.length < 182 && ds.at(-1)!.day < end;
    winters.push({
      label: `${y}~${y + 1} 冬${ongoing ? '（進行中）' : ''}`, points, total: cum,
      coverage: ongoing ? 1 : Math.min(1, ds.filter(d => d.tCount >= 20).length / 182),
    });
  }
  return winters;
}

/** 冬天的月份順序：10 月～隔年 3 月 */
export const WINTER_MONTHS = [10, 11, 12, 1, 2, 3];
export const WINTER_MONTH_LABELS = WINTER_MONTHS.map(m => `${m}月`);

/**
 * 每個冬天（10 月～隔年 3 月）各月的需冷時數，給「依冬天」的柱狀圖用。
 * 完整度 30% 以下的月份給 null（不畫）；只要有月份缺資料就標「資料不完整」，還沒過完的冬天標「進行中」。
 */
export function chillWinterMonths(monthly: Monthly[], today: string) {
  const byMonth = new Map(monthly.map(m => [m.month, m]));
  const years = [...new Set(monthly.map(m => +m.month.slice(0, 4)))];
  const out: { label: string; values: (number | null)[]; total: number }[] = [];
  for (const y of [years[0] - 1, ...years]) {
    const keys = WINTER_MONTHS.map(m => `${m >= 10 ? y : y + 1}-${String(m).padStart(2, '0')}`);
    const ms = keys.map(k => byMonth.get(k));
    if (!ms.some(m => m && m.coverage > 0.3)) continue;
    const values = ms.map(m => (m && m.coverage > 0.3 ? m.chill : null));
    const ongoing = keys[5] >= today.slice(0, 7);
    const partial = !ongoing && ms.some(m => !m || m.coverage < 0.9);
    out.push({
      label: `${y}~${y + 1} 冬${ongoing ? '（進行中）' : partial ? '（資料不完整）' : ''}`,
      values,
      total: values.reduce<number>((s, v) => s + (v ?? 0), 0),
    });
  }
  return out;
}

/** 每年 1/1 起的生長度日累積 */
export function gddByYear(daily: Daily[]) {
  const years = [...new Set(daily.map(d => d.day.slice(0, 4)))];
  return years.map(y => {
    let cum = 0;
    const t0 = Date.parse(`${y}-01-01`);
    const points: [number, number][] = daily
      .filter(d => d.day.startsWith(y))
      .map(d => {
        if (isNum(d.tMax) && isNum(d.tMin) && d.tCount >= 20) cum += Math.max(0, (d.tMax + d.tMin) / 2 - RULES.gdd.base);
        return [Math.round((Date.parse(d.day) - t0) / 86400e3), Math.round(cum)];
      });
    return { label: `${y} 年`, points, total: Math.round(cum) };
  });
}

/** 同月份跨年平均（長期平均） */
export function climatology(monthly: Monthly[], key: keyof Monthly) {
  const out: (number | null)[] = [];
  for (let m = 1; m <= 12; m++) {
    const vals = monthly.filter(x => +x.month.slice(5) === m && x.coverage > 0.7).map(x => x[key]).filter(isNum) as number[];
    out.push(vals.length ? r1(vals.reduce((s, v) => s + v, 0) / vals.length) : null);
  }
  return out;
}

export const hasData = (c: Col | undefined) => !!c && c.some(v => v != null);
