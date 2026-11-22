// 資料讀取與時間軸工具
// 所有資料對齊同一條逐時時間軸：index 0 = 2010-01-01 01:00（台灣時間），代表 00:00~01:00 這一小時

export type Col = (number | null)[];
export type Cols = Record<string, Col>;

export interface StationMeta {
  id: string;
  source: 'cwa' | 'wra' | 'openmeteo' | 'composite';
  name: string;
  elevation: number;
  distKm: number;
  from: string;
  to: string;
  note: string;
  fields: string[];
  count: Record<string, number>;
}

export interface DataIndex {
  generatedAt: string;
  /** 資料庫最新一筆的時間（台灣時間 'YYYY-MM-DD HH:00'），有接上 ll3 時才有 */
  latest?: string;
  start: string;
  hours: number;
  site: { name: string; lat: number; lon: number; elevation: number };
  stations: StationMeta[];
}

export const T0 = Date.UTC(2010, 0, 1, 1);

/** index → 台灣時間（用 UTC 欄位表示） */
export const timeOf = (i: number) => new Date(T0 + i * 3600e3);
/** 台灣時間字串 'YYYY-MM-DDTHH' → index */
export const indexOf = (key: string) => Math.round((Date.parse(key.slice(0, 13) + ':00:00Z') - T0) / 3600e3);
/** 這一小時屬於哪一天（00:00 那筆屬於前一天） */
export const dayOf = (i: number) => new Date(T0 + i * 3600e3 - 3600e3).toISOString().slice(0, 10);
export const fmtHour = (i: number) => {
  const d = timeOf(i);
  return `${d.toISOString().slice(0, 10)} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
};

export const FIELD_LABEL: Record<string, { name: string; unit: string }> = {
  t: { name: '氣溫', unit: '°C' },
  rh: { name: '相對濕度', unit: '%' },
  rain: { name: '雨量', unit: 'mm' },
  ws: { name: '平均風速', unit: 'm/s' },
  gust: { name: '最大陣風', unit: 'm/s' },
  wd: { name: '風向', unit: '°' },
  p: { name: '測站氣壓', unit: 'hPa' },
  sun: { name: '日照時數', unit: 'h' },
  rad: { name: '日射量', unit: 'MJ/m²' },
  dew: { name: '露點溫度', unit: '°C' },
  cloud: { name: '雲量', unit: '%' },
  et0: { name: '參考蒸發散量 ET0', unit: 'mm' },
  vpd: { name: '飽和水氣壓差 VPD', unit: 'kPa' },
  soilT0: { name: '土溫 0–7cm', unit: '°C' },
  soilT28: { name: '土溫 28–100cm', unit: '°C' },
  soilM0: { name: '土壤含水 0–7cm', unit: '%' },
  soilM28: { name: '土壤含水 28–100cm', unit: '%' },
};

export const SOURCE_LABEL: Record<StationMeta['source'], string> = {
  cwa: '中央氣象署（實測）',
  wra: '經濟部水利署（實測雨量）',
  openmeteo: 'Open-Meteo（模式推估）',
  composite: '綜合（實測為主）',
};

// 資料全部來自 ll3 的 weather.mdb（Vercel 上不放資料）：
//   1. /data/index.json、/data/y/YYYY.json：ll3 每天從 weather.mdb 匯出的年度 JSON（proxy.ts 轉到 ll3 data.asp）
//      過去年份的檔案不會變，網址帶版本（檔案修改時間），瀏覽器會快取
//   2. /api/data/recent：直接讀 weather.mdb 最近幾天（cron-job 每 10 分鐘寫進去）
// 兩段合在一起給圖表用；同一小時以第 2 段（最新）為準。

/** 直接讀資料庫那段：從今年 JSON 產生時間往前多抓幾天 */
const RECENT_OVERLAP_DAYS = 2;
/** ll3 一次最多給 40 天 */
const RECENT_MAX_DAYS = 38;

type RecentStation = { time: string[] } & Record<string, Col | string[]>;
interface Recent { now: string; stations: Record<string, RecentStation> }
interface YearFile { year: number; start: string; hours: number; generatedAt: string; stations: Record<string, Record<string, string>> }
type IndexFile = DataIndex & { years: { year: number; v: number }[] };

let indexPromise: Promise<DataIndex> | null = null;
let years: IndexFile['years'] = [];
let recent: Recent | null = null;
const stationCache = new Map<string, Promise<Cols>>();
const yearCache = new Map<number, Promise<YearFile>>();

/** 台灣時間 'YYYY-MM-DD HH' */
const twHour = (ms: number) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 13).replace('T', ' ');

function loadYear(y: { year: number; v: number }): Promise<YearFile> {
  if (!yearCache.has(y.year)) {
    // 有版本號 → 用瀏覽器快取（內容變了版本號就會變）
    yearCache.set(y.year, fetch(`/data/y/${y.year}.json?v=${y.v}`, y.v ? {} : { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error(`${y.year} 年資料讀取失敗（${r.status}）`);
      return r.json();
    }));
  }
  return yearCache.get(y.year)!;
}

async function loadRecent(): Promise<Recent | null> {
  // 今年 JSON 的產生時間（檔案修改時間）往前 2 天起，直接讀資料庫
  const cur = years[years.length - 1];
  const base = cur?.v ? cur.v : Date.now();
  const from = Math.max(base - RECENT_OVERLAP_DAYS * 86400e3, Date.now() - RECENT_MAX_DAYS * 86400e3);
  const since = twHour(from).slice(0, 10) + ' 01';
  try {
    const r = await fetch(`/api/data/recent?since=${encodeURIComponent(since)}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.stations ? j : null;
  } catch {
    return null; // 讀不到時，至少還有年度 JSON 的資料（到每天 10:00 產生的那一刻）
  }
}

export function loadIndex() {
  indexPromise ??= (async () => {
    const r = await fetch('/data/index.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`資料索引讀取失敗（${r.status}）`);
    const { years: ys, ...idx }: IndexFile = await r.json();
    years = ys;
    // 先開始下載各年份（和讀資料庫同時進行）
    ys.forEach(y => loadYear(y).catch(() => {})); // 錯誤留給真正用到時處理
    recent = await loadRecent();
    if (!recent) return idx;
    // 找出資料庫裡最新一筆有值的時間，把時間軸延長到那一天結束
    let last = -1;
    for (const st of idx.stations) {
      const r = recent.stations[st.id];
      if (!r) continue;
      let stLast = -1;
      r.time.forEach((k, j) => {
        if (Object.entries(r).some(([f, a]) => f !== 'time' && (a as Col)[j] != null)) stLast = Math.max(stLast, indexOf(k.replace(' ', 'T')));
      });
      if (stLast >= 0) {
        const d = dayOf(stLast);
        if (d > st.to) st.to = d;
        if (st.source !== 'openmeteo') last = Math.max(last, stLast);
      }
    }
    if (last < 0) return idx;
    const lastDay = dayOf(last);
    idx.hours = Math.max(idx.hours, indexOf(`${lastDay}T23`) + 2);
    idx.generatedAt = timeOf(last).toISOString().slice(0, 13) + ':00:00+08:00';
    idx.latest = fmtHour(last);
    return idx;
  })();
  return indexPromise;
}

export function loadStation(id: string): Promise<Cols> {
  if (id === COMPOSITE_ID) return loadComposite();
  if (!stationCache.has(id)) {
    stationCache.set(id, (async () => {
      const idx = await loadIndex();
      const yfs = await Promise.all(years.map(loadYear));
      const n = idx.hours;
      const cols: Cols = {};
      for (const yf of yfs) {
        const st = yf.stations[id];
        if (!st) continue;
        const off = indexOf(yf.start);
        for (const [f, csv] of Object.entries(st)) {
          const col = (cols[f] ??= new Array(n).fill(null));
          const a = csv.split(',');
          for (let k = 0; k < a.length; k++) {
            const g = off + k;
            if (a[k] !== '' && g >= 0 && g < n) col[g] = +a[k];
          }
        }
      }
      const r = recent?.stations[id];
      if (r) {
        const at = r.time.map(k => indexOf(k.replace(' ', 'T')));
        for (const [f, a] of Object.entries(r)) {
          if (f === 'time') continue;
          const col = (cols[f] ??= new Array(n).fill(null));
          (a as Col).forEach((v, k) => { if (v != null && at[k] >= 0 && at[k] < n) col[at[k]] = v; });
        }
      }
      return cols;
    })());
  }
  return stationCache.get(id)!;
}

// ---------------- 上巴陵綜合資料 ----------------
export const COMPOSITE_ID = 'composite';
export const LAPSE = 0.6; // 每升高 100m 氣溫約降 0.6°C

/** 各項目依序取用的測站（前面的有值就用前面的） */
export const COMPOSITE_ORDER: Record<string, string[]> = {
  t: ['C0C800', 'C0UB60', 'C0UA30', 'C0UA10', 'C0U710'],
  rh: ['C0C800', 'C0UB60', 'C0UA30', 'C0UA10', 'C0U710'],
  rain: ['C0C800', 'wra-21C070', 'wra-21C090', 'C1C840', 'wra-21C080', 'C0C460'],
  ws: ['C0C800', 'C0UB60', 'C0UA30'],
  gust: ['C0C800', 'C0UB60', 'C0UA30'],
  p: ['C0C800', 'C0UB60'],
  dew: ['openmeteo'],
  rad: ['openmeteo'],
  sun: ['openmeteo'],
  cloud: ['openmeteo'],
  et0: ['openmeteo'],
  vpd: ['openmeteo'],
  soilT0: ['openmeteo'],
  soilT28: ['openmeteo'],
  soilM0: ['openmeteo'],
  soilM28: ['openmeteo'],
};

/** 依 COMPOSITE_ORDER 組出上巴陵綜合資料（網頁與匯出 mdb 共用） */
export function buildComposite(idx: DataIndex, data: Record<string, Cols>): Cols {
  const meta = Object.fromEntries(idx.stations.map(s => [s.id, s]));
  const n = idx.hours;
  const out: Cols = {};
  for (const [f, order] of Object.entries(COMPOSITE_ORDER)) {
    const col: Col = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      for (const id of order) {
        const v = data[id]?.[f]?.[i];
        if (v != null) {
          // 氣溫依海拔換算到上巴陵
          col[i] = f === 't' ? Math.round((v + ((meta[id].elevation - idx.site.elevation) / 100) * LAPSE) * 10) / 10 : v;
          break;
        }
      }
    }
    out[f] = col;
  }
  return out;
}

export const compositeSourceIds = (idx: DataIndex) =>
  [...new Set(Object.values(COMPOSITE_ORDER).flat())].filter(id => idx.stations.some(s => s.id === id));

let compositePromise: Promise<Cols> | null = null;
function loadComposite(): Promise<Cols> {
  compositePromise ??= (async () => {
    const idx = await loadIndex();
    const ids = compositeSourceIds(idx);
    const data = Object.fromEntries(await Promise.all(ids.map(async id => [id, await loadStation(id)] as const)));
    return buildComposite(idx, data);
  })();
  return compositePromise;
}

export function compositeMeta(idx: DataIndex): StationMeta {
  return {
    id: COMPOSITE_ID,
    source: 'composite',
    name: '上巴陵綜合（建議）',
    elevation: idx.site.elevation,
    distKm: 0,
    from: idx.start.slice(0, 10),
    to: idx.generatedAt.slice(0, 10),
    note: '氣溫/濕度：四稜→明池→白嶺→鴛鴦湖→太平山（2018 年以前，氣溫依海拔換算）；風：四稜→明池→白嶺；雨量：四稜→水利署巴陵→嘎拉賀→大曼→高義→復興；土壤/日射/蒸發散：Open-Meteo',
    fields: Object.keys(COMPOSITE_ORDER),
    count: {},
  };
}

// ---------------- 實際量測值／估算值 ----------------
export type SrcKind = 'measured' | 'estimated';
export interface SrcItem { kind: SrcKind; label?: string; note: string }

const NOTE_OM = 'Open-Meteo 衛星＋模式推估，不是測站量到的';
const NOTE_LAPSE = '附近測站量到的氣溫，依海拔換算到上巴陵';

/** 某測站某項目是實測還是估算（adjusted＝氣溫有依海拔換算） */
export function srcOf(st: StationMeta | undefined, field: string, adjusted = false): Omit<SrcItem, 'label'> {
  if (!st || st.source === 'openmeteo') return { kind: 'estimated', note: NOTE_OM };
  if (st.source === 'composite') {
    if (COMPOSITE_ORDER[field]?.[0] === 'openmeteo') return { kind: 'estimated', note: NOTE_OM };
    if (field === 't') return { kind: 'estimated', note: NOTE_LAPSE };
    return { kind: 'measured', note: '附近測站量到的數值（依序取最近、有資料的測站）' };
  }
  if (field === 't' && adjusted) return { kind: 'estimated', note: `${st.name}量到的氣溫，依海拔換算到上巴陵` };
  return { kind: 'measured', note: `${st.name}${st.source === 'wra' ? '（水利署）' : '（氣象署）'}量到的數值` };
}

/** 一個區塊用到好幾個項目：全部同一種就只標一個，不同就分開標 */
export function srcTags(parts: [label: string, src: Omit<SrcItem, 'label'>][]): SrcItem[] {
  if (!parts.length) return [];
  const same = parts.every(p => p[1].kind === parts[0][1].kind);
  if (same) return [{ kind: parts[0][1].kind, note: [...new Set(parts.map(p => `${p[0]}：${p[1].note}`))].join('\n') }];
  return parts.map(([label, s]) => ({ label, ...s }));
}

/** 單一測站、好幾個項目 */
export const srcFor = (st: StationMeta | undefined, fields: string[]) =>
  srcTags(fields.map(f => [FIELD_LABEL[f]?.name ?? f, srcOf(st, f)]));

/** 依海拔換算氣溫 */
export function adjustTemp(col: Col, fromElev: number, toElev: number): Col {
  const d = ((fromElev - toElev) / 100) * LAPSE;
  return col.map(v => (v == null ? null : Math.round((v + d) * 10) / 10));
}
