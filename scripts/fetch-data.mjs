// 抓取 2022-01-01 起的逐時天氣資料，整理成 public/data/*.json
// 用法：node scripts/fetch-data.mjs [--only=C0C800,wra-21C070,openmeteo]
// 已抓過的月份會快取在 data-cache/，重跑只會補抓缺的與當月。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'data-cache');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const START = '2022-01-01';
const now = new Date(Date.now() + 8 * 3600e3); // 台灣時間
const TODAY = now.toISOString().slice(0, 10);
const THIS_MONTH = TODAY.slice(0, 7);

// 上巴陵（拉拉山水蜜桃產區）大約位置
export const SITE = { name: '上巴陵', lat: 24.6745, lon: 121.4146, elevation: 1200 };

export const STATIONS = [
  // 中央氣象署（CODiS 氣候觀測資料查詢服務）— 實測
  { id: 'C0C800', source: 'cwa', stnType: 'auto_C0', name: '四稜', elevation: 1167, distKm: 3, from: '2025-03-27', note: '離上巴陵最近、海拔最接近的氣象署測站（2025/3 起才有）' },
  { id: 'C0UB60', source: 'cwa', stnType: 'auto_C0', name: '明池', elevation: 1163, distKm: 7, from: '2025-03-27', note: '海拔相近，2025/3 起' },
  { id: 'C0UA30', source: 'cwa', stnType: 'auto_C0', name: '白嶺', elevation: 1397, distKm: 19, from: START, note: '2022 年起完整，海拔稍高' },
  { id: 'C0UA10', source: 'cwa', stnType: 'auto_C0', name: '鴛鴦湖', elevation: 1711, distKm: 9, from: START, note: '2022 年起完整，海拔高約 500m，氣溫偏低' },
  { id: 'C0C460', source: 'cwa', stnType: 'auto_C0', name: '復興', elevation: 482, distKm: 18, from: START, note: '復興區山下（角板山），氣溫偏高' },
  { id: 'C1C840', source: 'cwa', stnType: 'auto_C1', name: '大曼', elevation: 688, distKm: 1, from: '2026-10-28', note: '雨量站，2026/10 新設' },
  // 經濟部水利署 水文資訊網 — 實測雨量（年報整理後公開，目前到 2025 年底）
  { id: 'wra-21C070', wraNo: '21C070', source: 'wra', name: '巴陵（水利署）', elevation: 1220, distKm: 1, from: START, note: '北區水資源分署雨量站，海拔與上巴陵幾乎相同' },
  { id: 'wra-21C090', wraNo: '21C090', source: 'wra', name: '嘎拉賀（水利署）', elevation: 1260, distKm: 5, from: START, note: '北區水資源分署雨量站' },
  { id: 'wra-21C080', wraNo: '21C080', source: 'wra', name: '高義（水利署）', elevation: 620, distKm: 4, from: START, note: '北區水資源分署雨量站' },
  // Open-Meteo（ERA5 / ERA5-Land 再分析）— 模式推估，補土壤、日照、蒸發散
  { id: 'openmeteo', source: 'openmeteo', name: 'Open-Meteo 推估（上巴陵座標）', elevation: SITE.elevation, distKm: 0, from: START, note: '衛星＋模式重建資料，非實測；用來補土壤溫濕度、日射量、蒸發散' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(2000 * i);
    }
  }
}

function months(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const lastDay = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();

// 全部資料對齊到同一條時間軸：2022-01-01 01:00 ~ 今天 23:00（台灣時間，整點，代表前一小時）
const T0 = Date.UTC(2022, 0, 1, 1) ; // 以「台灣時間當 UTC」計算，避免時區轉換
const hourIndex = key => Math.round((Date.parse(key.slice(0, 13) + ':00:00Z') - T0) / 3600e3);
const N_HOURS = hourIndex(TODAY + 'T23') + 1;

const r1 = v => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

// ---------- 中央氣象署 CODiS ----------
async function cwaMonth(st, ym) {
  const file = path.join(CACHE, st.id, `${ym}.json`);
  if (fs.existsSync(file) && ym !== THIS_MONTH) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const end = ym === THIS_MONTH ? TODAY : `${ym}-${lastDay(ym)}`;
  const body = new URLSearchParams({
    date: `${ym}-01T00:00:00.000+08:00`, type: 'report_date', stn_ID: st.id, stn_type: st.stnType,
    start: `${ym}-01T00:00:00`, end: `${end}T23:59:59`, more: '', item: '',
  });
  const txt = await fetchRetry('https://codis.cwa.gov.tw/api/station', { method: 'POST', body });
  const j = JSON.parse(txt);
  const rows = (j.data?.[0]?.dts ?? []).map(d => ({
    // 每天最後一筆是 23:59:59（代表 24:00），轉成隔天 00 點
    k: /T23:59/.test(d.DataTime)
      ? new Date(Date.parse(d.DataTime.slice(0, 10) + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10) + 'T00'
      : d.DataTime.slice(0, 13),
    t: d.AirTemperature?.Instantaneous ?? null,
    rh: d.RelativeHumidity?.Instantaneous ?? null,
    rain: d.Precipitation?.Accumulation ?? null,
    ws: d.WindSpeed?.Mean ?? null,
    gust: d.PeakGust?.Maximum ?? null,
    wd: d.WindDirection?.Mean ?? null,
    p: d.StationPressure?.Instantaneous ?? null,
    sun: d.SunshineDuration?.Total ?? null,
    rad: d.GlobalSolarRadiation?.Accumulation ?? null,
  }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows));
  await sleep(300);
  return rows;
}

// CODiS 對缺測/故障會給 -99.x 之類的值，或明顯不合理的數字
const clean = {
  t: v => (v == null || v < -20 || v > 45 ? null : v),
  rh: v => (v == null || v < 1 || v > 100 ? null : v),
  rain: v => (v == null || v < 0 || v > 300 ? null : v),
  ws: v => (v == null || v < 0 || v > 80 ? null : v),
  gust: v => (v == null || v < 0 || v > 100 ? null : v),
  wd: v => (v == null || v < 0 || v > 360 ? null : v),
  p: v => (v == null || v < 500 || v > 1100 ? null : v),
  sun: v => (v == null || v < 0 || v > 1.01 ? null : v),
  rad: v => (v == null || v < 0 || v > 5 ? null : v),
};

async function buildCwa(st) {
  const fields = ['t', 'rh', 'rain', 'ws', 'gust', 'wd', 'p', 'sun', 'rad'];
  const cols = Object.fromEntries(fields.map(f => [f, new Array(N_HOURS).fill(null)]));
  for (const ym of months(st.from, TODAY)) {
    process.stdout.write(`  ${st.name} ${ym}\r`);
    const rows = await cwaMonth(st, ym);
    let prevK = '';
    for (const r of rows) {
      // 舊快取裡 24:00 被存成重複的 23 點 → 第二筆視為隔天 00 點
      const i = hourIndex(r.k) + (r.k === prevK ? 1 : 0);
      prevK = r.k;
      if (i < 0 || i >= N_HOURS) continue;
      for (const f of fields) cols[f][i] = clean[f](r[f]);
    }
  }
  return cols;
}

// ---------- 經濟部水利署 水文資訊網 ----------
async function buildWra(st) {
  const file = path.join(CACHE, st.id, 'hourly.json');
  let txt;
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 7 * 86400e3;
  if (fresh) txt = fs.readFileSync(file, 'utf8');
  else {
    txt = await fetchRetry('https://gweb.wra.gov.tw/HydroInfo/Comm/GetStRaHourList', {
      method: 'POST', body: new URLSearchParams({ ST_NO: st.wraNo }),
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, txt);
  }
  const j = JSON.parse(txt);
  // 只會列出「有雨」的小時；年報涵蓋期間內沒列出的小時視為 0 mm
  let lastMs = 0;
  const rain = new Array(N_HOURS).fill(null);
  const hits = [];
  for (const r of j) {
    const ms = +r.YYMMDD.match(/-?\d+/)[0];
    lastMs = Math.max(lastMs, ms);
    const local = new Date(ms + 8 * 3600e3).toISOString().slice(0, 13);
    hits.push([hourIndex(local), r.HAVG]);
  }
  // 年報涵蓋到最後一筆所在年份的 12/31（00:00 那筆屬於前一天，所以先減 1 小時）
  const lastYear = new Date(lastMs + 8 * 3600e3 - 3600e3).getUTCFullYear();
  const coverEnd = Math.min(N_HOURS - 1, hourIndex(`${lastYear + 1}-01-01T00`));
  for (let i = 0; i <= coverEnd; i++) rain[i] = 0;
  for (const [i, v] of hits) if (i >= 0 && i <= coverEnd) rain[i] = v == null || v < 0 ? null : r1(v);
  // 整個月一小時雨都沒有 → 幾乎可以確定是儀器停擺，整月當作缺測
  const missing = [];
  for (const ym of months(START, `${lastYear}-12`)) {
    const a = hourIndex(`${ym}-01T01`), b = Math.min(coverEnd, hourIndex(`${ym}-${lastDay(ym)}T23`) + 1);
    let any = false;
    for (let i = a; i <= b; i++) if (rain[i] > 0) { any = true; break; }
    if (!any) { for (let i = a; i <= b; i++) rain[i] = null; missing.push(ym); }
  }
  if (missing.length) console.log(`  缺測月份：${missing.join(' ')}`);
  st.to = `${lastYear}-12-31`;
  st.missing = missing;
  return { rain };
}

// ---------- Open-Meteo 歷史再分析 ----------
const OM_VARS = {
  t: 'temperature_2m', rh: 'relative_humidity_2m', dew: 'dew_point_2m', rain: 'precipitation',
  ws: 'wind_speed_10m', cloud: 'cloud_cover', rad: 'shortwave_radiation', sun: 'sunshine_duration',
  et0: 'et0_fao_evapotranspiration', vpd: 'vapour_pressure_deficit',
  soilT0: 'soil_temperature_0_to_7cm', soilT28: 'soil_temperature_28_to_100cm',
  soilM0: 'soil_moisture_0_to_7cm', soilM28: 'soil_moisture_28_to_100cm',
};
async function buildOpenMeteo(st) {
  const cols = Object.fromEntries(Object.keys(OM_VARS).map(f => [f, new Array(N_HOURS).fill(null)]));
  const years = [];
  for (let y = 2022; y <= +TODAY.slice(0, 4); y++) years.push(y);
  for (const y of years) {
    const file = path.join(CACHE, st.id, `${y}.json`);
    let j;
    const isCurrent = y === +TODAY.slice(0, 4);
    if (fs.existsSync(file) && !isCurrent) j = JSON.parse(fs.readFileSync(file, 'utf8'));
    else {
      // 歷史再分析資料約延遲 5 天，當年度只抓到 7 天前
      const end = isCurrent ? new Date(now.getTime() - 7 * 86400e3).toISOString().slice(0, 10) : `${y}-12-31`;
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${SITE.lat}&longitude=${SITE.lon}&elevation=${SITE.elevation}` +
        `&start_date=${y}-01-01&end_date=${end}&hourly=${Object.values(OM_VARS).join(',')}&timezone=Asia%2FTaipei&wind_speed_unit=ms`;
      j = JSON.parse(await fetchRetry(url));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(j));
      await sleep(1000);
    }
    const h = j.hourly;
    h.time.forEach((tm, idx) => {
      // Open-Meteo 的時間是該小時開始；氣象署是該小時結束 → 往後挪 1 小時對齊
      const i = hourIndex(tm) + 1;
      if (i < 0 || i >= N_HOURS) return;
      for (const [f, v] of Object.entries(OM_VARS)) {
        let val = h[v][idx];
        if (val == null) continue;
        if (f === 'sun') val = val / 3600; // 秒 → 小時
        if (f === 'rad') val = (val * 3600) / 1e6; // W/m² → MJ/m²（與氣象署相同單位）
        if (f.startsWith('soilM')) val = Math.round(val * 1000) / 10; // m³/m³ → %
        cols[f][i] = f === 'rad' || f === 'sun' || f === 'et0' || f === 'vpd' ? Math.round(val * 100) / 100 : r1(val);
      }
    });
  }
  return cols;
}

// ---------- main ----------
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const index = { generatedAt: new Date().toISOString(), start: '2022-01-01T01', hours: N_HOURS, site: SITE, stations: [] };
const prevIndexFile = path.join(OUT, 'index.json');
const prev = fs.existsSync(prevIndexFile) ? JSON.parse(fs.readFileSync(prevIndexFile, 'utf8')) : null;

for (const st of STATIONS) {
  if (only && !only.includes(st.id)) {
    const p = prev?.stations.find(s => s.id === st.id);
    if (p) index.stations.push(p);
    continue;
  }
  console.log(`抓取 ${st.name} (${st.id}) ...`);
  let cols;
  try {
    if (st.source === 'cwa') cols = await buildCwa(st);
    else if (st.source === 'wra') cols = await buildWra(st);
    else cols = await buildOpenMeteo(st);
  } catch (e) {
    console.error(`  ✗ ${st.name} 失敗：${e.message}`);
    const p = prev?.stations.find(s => s.id === st.id);
    if (p) index.stations.push(p);
    continue;
  }
  // 去掉整欄都是空的項目
  for (const f of Object.keys(cols)) if (!cols[f].some(v => v != null)) delete cols[f];
  const count = Object.fromEntries(Object.entries(cols).map(([f, a]) => [f, a.filter(v => v != null).length]));
  fs.writeFileSync(path.join(OUT, `${st.id}.json`), JSON.stringify({ id: st.id, start: index.start, cols }));
  const { stnType, wraNo, ...meta } = st;
  index.stations.push({ ...meta, to: st.to ?? TODAY, fields: Object.keys(cols), count });
  console.log(`  ✓ ${st.name}：${Object.entries(count).map(([f, n]) => `${f}=${n}`).join(' ')}`);
}
fs.writeFileSync(prevIndexFile, JSON.stringify(index, null, 1));
console.log('完成，輸出到 public/data/');
