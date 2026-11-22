// 把 data-json/*.json 轉成 CSV + schema.ini，給 build-mdb.ps1 匯入 Access
// 用法：npx tsx scripts/export-csv.ts
import fs from 'node:fs';
import path from 'node:path';
import { buildComposite, compositeMeta, Cols, DataIndex, dayOf, SOURCE_LABEL, timeOf } from '../lib/data';
import { toDaily } from '../lib/agri';

const OUT = path.resolve('data-export');
fs.mkdirSync(OUT, { recursive: true });

const idx: DataIndex = JSON.parse(fs.readFileSync('data-json/index.json', 'utf8'));
const data: Record<string, Cols> = {};
for (const s of idx.stations) data[s.id] = JSON.parse(fs.readFileSync(`data-json/${s.id}.json`, 'utf8')).cols;
data.composite = buildComposite(idx, data);
const stations = [compositeMeta(idx), ...idx.stations];

const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
const v = (x: number | null | undefined) => (x == null ? '' : String(x));
// Access 的日期格式：yyyy-mm-dd hh:nn:ss
const ts = (i: number) => timeOf(i).toISOString().slice(0, 19).replace('T', ' ');

// ---- stations
fs.writeFileSync(path.join(OUT, 'stations.csv'),
  ['station_id,station_name,source_type,source_name,elevation_m,dist_km,data_from,data_to,field_list,remark',
    ...stations.map(s => [q(s.id), q(s.name), q(s.source), q(SOURCE_LABEL[s.source]), s.elevation, s.distKm, s.from, s.to,
      q(s.fields.join(' ')), q(s.note)].join(','))].join('\r\n'));

// ---- hourly（每站每小時一列，整列都空的不輸出）
export const HOURLY_FIELDS: [string, string][] = [
  ['t', 'temp_c'], ['rh', 'rh_pct'], ['rain', 'rain_mm'], ['ws', 'wind_ms'], ['gust', 'gust_ms'], ['wd', 'wind_dir'],
  ['p', 'pressure_hpa'], ['sun', 'sunshine_h'], ['rad', 'radiation_mj'], ['dew', 'dewpoint_c'], ['cloud', 'cloud_pct'],
  ['et0', 'et0_mm'], ['vpd', 'vpd_kpa'], ['soilT0', 'soil_t0_c'], ['soilT28', 'soil_t28_c'], ['soilM0', 'soil_m0_pct'], ['soilM28', 'soil_m28_pct'],
];
const hourly = fs.createWriteStream(path.join(OUT, 'hourly.csv'));
hourly.write(['station_id', 'obs_time', 'obs_date', 'obs_hour', ...HOURLY_FIELDS.map(f => f[1])].join(',') + '\r\n');
let nh = 0;
for (const s of stations) {
  const c = data[s.id];
  for (let i = 0; i < idx.hours; i++) {
    const vals = HOURLY_FIELDS.map(([f]) => c[f]?.[i]);
    if (vals.every(x => x == null)) continue;
    const h = timeOf(i).getUTCHours();
    hourly.write([s.id, ts(i), dayOf(i), h === 0 ? 24 : h, ...vals.map(v)].join(',') + '\r\n');
    nh++;
  }
}
hourly.end();

// ---- daily（逐日統計與農事指標）
const daily = ['station_id,obs_date,temp_mean,temp_max,temp_min,rh_mean,rain_mm,wind_mean,gust_max,sunshine_h,radiation_mj,et0_mm,chill_h,frost_h,wet_h,heat_h,spray_h,temp_hours,rain_hours'];
for (const s of stations) {
  for (const d of toDaily(data[s.id], idx.hours)) {
    if (!d.tCount && !d.rainCount && d.et0 == null) continue;
    const ag = d.tCount ? [d.chill, d.frost, d.wet, d.heat, d.spray] : ['', '', '', '', ''];
    daily.push([s.id, d.day, v(d.tMean), v(d.tMax), v(d.tMin), v(d.rhMean), v(d.rain), v(d.wsMean), v(d.gustMax),
      v(d.sun), v(d.rad), v(d.et0), ...ag, d.tCount, d.rainCount].join(','));
  }
}
fs.writeFileSync(path.join(OUT, 'daily.csv'), daily.join('\r\n'));

// ---- schema.ini（讓 Jet 文字驅動程式用正確型別讀 CSV）
const dbl = (n: number, name: string) => `Col${n}=${name} Double`;
fs.writeFileSync(path.join(OUT, 'schema.ini'), [
  '[stations.csv]', 'Format=CSVDelimited', 'ColNameHeader=True', 'CharacterSet=65001',
  'Col1=station_id Text', 'Col2=station_name Text', 'Col3=source_type Text', 'Col4=source_name Text', 'Col5=elevation_m Double',
  'Col6=dist_km Double', 'Col7=data_from Text', 'Col8=data_to Text', 'Col9=field_list Text', 'Col10=remark Memo', '',
  '[hourly.csv]', 'Format=CSVDelimited', 'ColNameHeader=True', 'CharacterSet=65001', 'DateTimeFormat=yyyy-mm-dd hh:nn:ss',
  'Col1=station_id Text', 'Col2=obs_time DateTime', 'Col3=obs_date Text', 'Col4=obs_hour Short',
  ...HOURLY_FIELDS.map((f, k) => dbl(k + 5, f[1])), '',
  '[daily.csv]', 'Format=CSVDelimited', 'ColNameHeader=True', 'CharacterSet=65001',
  'Col1=station_id Text', 'Col2=obs_date Text',
  ...['temp_mean', 'temp_max', 'temp_min', 'rh_mean', 'rain_mm', 'wind_mean', 'gust_max', 'sunshine_h', 'radiation_mj', 'et0_mm'].map((n, k) => dbl(k + 3, n)),
  ...['chill_h', 'frost_h', 'wet_h', 'heat_h', 'spray_h', 'temp_hours', 'rain_hours'].map((n, k) => `Col${k + 13}=${n} Short`), '',
].join('\r\n'));

console.log(`stations=${stations.length} hourly=${nh} daily=${daily.length - 1} → ${OUT}`);
