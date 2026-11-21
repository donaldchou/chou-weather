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

let indexPromise: Promise<DataIndex> | null = null;
const stationCache = new Map<string, Promise<Cols>>();

export function loadIndex() {
  indexPromise ??= fetch('/data/index.json', { cache: 'no-store' }).then(r => r.json());
  return indexPromise;
}

export function loadStation(id: string): Promise<Cols> {
  if (id === COMPOSITE_ID) return loadComposite();
  if (!stationCache.has(id)) {
    stationCache.set(id, fetch(`/data/${id}.json`, { cache: 'no-store' }).then(r => r.json()).then(j => j.cols as Cols));
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

/** 依海拔換算氣溫 */
export function adjustTemp(col: Col, fromElev: number, toElev: number): Col {
  const d = ((fromElev - toElev) / 100) * LAPSE;
  return col.map(v => (v == null ? null : Math.round((v + d) * 10) / 10));
}
