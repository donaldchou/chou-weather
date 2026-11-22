// 驗算：用白嶺（換算到 1200m）與四稜資料計算指標，印出摘要
import fs from 'node:fs';
import { adjustTemp } from '../lib/data';
import { chillByWinter, gddByYear, toDaily, toMonthly } from '../lib/agri';

const idx = JSON.parse(fs.readFileSync('data-json/index.json', 'utf8'));
for (const [id, elev] of [['C0UA30', 1397], ['C0C800', 1167]] as const) {
  const cols = JSON.parse(fs.readFileSync(`data-json/${id}.json`, 'utf8')).cols;
  cols.t = adjustTemp(cols.t, elev, 1200);
  const daily = toDaily(cols, idx.hours);
  const monthly = toMonthly(daily);
  console.log(`\n== ${id}`);
  for (const w of chillByWinter(daily)) console.log(w.label, '需冷', w.total, 'h, 完整度', w.coverage.toFixed(2));
  for (const g of gddByYear(daily)) console.log(g.label, 'GDD', g.total);
  for (const m of monthly.filter(m => m.month >= '2025-01' && m.month <= '2025-12'))
    console.log(m.month, `均溫${m.tMean} 低${m.tAbsMin} 高${m.tAbsMax} 雨${m.rain} 濕${m.rhMean} 霜${m.frost} 高濕${m.wet} 噴藥${m.spray} 完整${m.coverage.toFixed(2)}`);
}
