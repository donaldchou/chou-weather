// 中繼站：cron-job.org 每小時呼叫 → 抓氣象署即時觀測 → 推送到 ll3 ingest.asp 寫入 weather.mdb
// （ll3 是 Windows 2012 R2，加密套件太舊，連不上氣象署開放資料平台，所以由這裡代抓）
//
// 環境變數（Vercel → Settings → Environment Variables）：
//   CWA_API_KEY     氣象署開放資料授權碼
//   RELAY_KEY       cron-job 呼叫本 API 時帶的金鑰（?key=...）
//   LL3_INGEST_URL  https://www.ll3.com.tw/platform/chou-weather/ingest.asp
//   LL3_API_KEY     與 ll3 config.asp 的 API_KEY 相同

const WEATHER_STATIONS = ['C0C800', 'C0UB60', 'C0UA30', 'C0UA10', 'C0C460'];
const RAIN_STATIONS = [...WEATHER_STATIONS, 'C1C840'];

type Obs = { StationId: string; ObsTime: { DateTime: string }; WeatherElement?: Record<string, unknown>; RainfallElement?: Record<string, { Precipitation?: string }> };

/** 氣象署用 -99、-999 等表示缺測 */
const num = (v: unknown) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) && n > -90 ? String(n) : '';
};

/** '2026-11-21T01:00:00+08:00' → '2026-11-21 01'；不是整點就回傳 null */
const hourKey = (s: string) => (/T\d\d:00:00/.test(s) ? `${s.slice(0, 10)} ${s.slice(11, 13)}` : null);

async function cwa(dataset: string, ids: string[], key: string) {
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${dataset}?Authorization=${encodeURIComponent(key)}&StationId=${ids.join(',')}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${dataset} HTTP ${res.status}`);
  const j = await res.json();
  return (j?.records?.Station ?? []) as Obs[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const env = process.env;
  if (!env.RELAY_KEY || searchParams.get('key') !== env.RELAY_KEY) return Response.json({ ok: false, message: 'forbidden' }, { status: 403 });
  if (!env.CWA_API_KEY || !env.LL3_INGEST_URL || !env.LL3_API_KEY) return Response.json({ ok: false, message: '環境變數沒設定完整' }, { status: 500 });

  const lines: string[] = [];
  const skipped: string[] = [];
  try {
    const [weather, rain] = await Promise.all([
      cwa('O-A0001-001', WEATHER_STATIONS, env.CWA_API_KEY),
      cwa('O-A0002-001', RAIN_STATIONS, env.CWA_API_KEY),
    ]);
    for (const s of weather) {
      const k = hourKey(s.ObsTime.DateTime);
      if (!k) { skipped.push(`${s.StationId} ${s.ObsTime.DateTime}`); continue; }
      const w = s.WeatherElement as Record<string, string & Record<string, string>> | undefined;
      if (!w) continue;
      const v = [
        `t=${num(w.AirTemperature)}`, `rh=${num(w.RelativeHumidity)}`, `ws=${num(w.WindSpeed)}`,
        `wd=${num(w.WindDirection)}`, `p=${num(w.AirPressure)}`, `gust=${num((w.GustInfo as unknown as Record<string, string>)?.PeakGustSpeed)}`,
      ];
      lines.push(`${s.StationId}|${k}|${v.join(',')}`);
    }
    // 雨量：O-A0002 每 10 分鐘更新，只有整點那一筆的「過去 1 小時雨量」才是該小時的時雨量
    for (const s of rain) {
      const k = hourKey(s.ObsTime.DateTime);
      if (!k) { skipped.push(`${s.StationId} 雨量 ${s.ObsTime.DateTime}`); continue; }
      lines.push(`${s.StationId}|${k}|rain=${num(s.RainfallElement?.Past1hr?.Precipitation)}`);
    }
  } catch (e) {
    return Response.json({ ok: false, message: `抓氣象署資料失敗：${(e as Error).message}` }, { status: 502 });
  }

  const res = await fetch(env.LL3_INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key: env.LL3_API_KEY, data: lines.join('\n') }),
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
  });
  const ll3 = await res.text();
  return Response.json({ ok: res.ok, lines: lines.length, skipped, ll3 }, { status: res.ok ? 200 : 502 });
}
