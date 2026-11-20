'use client';
import { useMemo, useState } from 'react';
import EChart, { C } from './EChart';
import { useStations } from './useStation';
import { adjustTemp, DataIndex, fmtHour, indexOf, StationMeta, timeOf } from '@/lib/data';
import { RULES } from '@/lib/agri';
import { Badge, Card, Loading, Select } from './ui';

const PALETTE = ['#e4572e', '#3a86ff', '#2bb673', '#f4a300', '#8d6cab', '#17becf', '#9aa5b1', '#d62728', '#8b5e3c', '#e377c2'];

export default function HourlyTab({ idx, stations }: { idx: DataIndex; stations: StationMeta[] }) {
  const lastDay = idx.generatedAt.slice(0, 10);
  const [ids, setIds] = useState<string[]>(['composite', 'C0C800', 'C0UA30']);
  const [days, setDays] = useState('7');
  const [end, setEnd] = useState(lastDay);
  const [adjust, setAdjust] = useState(true);
  const { data, loading } = useStations(ids);

  const endIdx = Math.min(idx.hours - 1, indexOf(`${end}T23`) + 1);
  const startIdx = Math.max(0, endIdx - +days * 24 + 1);
  const xs = useMemo(() => Array.from({ length: endIdx - startIdx + 1 }, (_, k) => fmtHour(startIdx + k)), [startIdx, endIdx]);

  const series = (field: string) =>
    ids.filter(id => data[id]?.[field]).map(id => {
      const meta = stations.find(s => s.id === id)!;
      let col = data[id][field].slice(startIdx, endIdx + 1);
      if (field === 't' && adjust && id !== 'composite') col = adjustTemp(col, meta.elevation, idx.site.elevation);
      return { id, name: meta.name, col, color: PALETTE[stations.findIndex(s => s.id === id) % PALETTE.length] };
    });

  // 第一個測站的「適合噴藥」時段，用綠底標示
  const sprayAreas = useMemo(() => {
    const first = data[ids[0]];
    if (!first?.t) return [];
    const areas: [{ xAxis: string }, { xAxis: string }][] = [];
    let open = -1;
    for (let i = startIdx; i <= endIdx + 1; i++) {
      const t = first.t[i], rh = first.rh?.[i], rain = first.rain?.[i], next = first.rain?.[i + 1], ws = first.ws?.[i];
      const h = timeOf(i).getUTCHours();
      const ok = i <= endIdx && t != null && rh != null && rain === 0 && (next == null || next === 0)
        && h > RULES.spray.hFrom && h <= RULES.spray.hTo && rh < RULES.spray.rhMax && (ws == null || ws < RULES.spray.wsMax)
        && t >= RULES.spray.tLo && t <= RULES.spray.tHi;
      if (ok && open < 0) open = i;
      if (!ok && open >= 0) { areas.push([{ xAxis: fmtHour(open) }, { xAxis: fmtHour(i - 1) }]); open = -1; }
    }
    return areas;
  }, [data, ids, startIdx, endIdx]);

  const toggle = (id: string) => setIds(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id]));
  const zoom = [{ type: 'inside' as const }, { type: 'slider' as const, height: 18, bottom: 6 }];

  const temp = series('t'), rh = series('rh'), rain = series('rain'), ws = series('ws');
  const firstName = stations.find(s => s.id === ids[0])?.name;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col text-sm text-stone-600 gap-1">
            結束日期
            <input type="date" value={end} min="2022-01-02" max={lastDay} onChange={e => e.target.value && setEnd(e.target.value)}
              className="border border-stone-300 rounded-lg px-3 py-2 text-base" />
          </label>
          <Select label="顯示天數" value={days} onChange={setDays} options={[1, 3, 7, 14, 30, 60, 90].map(d => ({ value: String(d), label: `${d} 天` }))} />
          <div className="flex gap-2">
            {[['今天', 0], ['一週前', 7], ['一個月前', 30], ['去年同期', 365]].map(([l, back]) => (
              <button key={l as string} onClick={() => setEnd(new Date(Date.parse(lastDay) - (back as number) * 86400e3).toISOString().slice(0, 10))}
                className="px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-sm">{l}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} className="w-4 h-4" />
            氣溫依海拔換算到上巴陵（{idx.site.elevation}m）
          </label>
        </div>
        <div className="mt-4">
          <div className="text-sm text-stone-600 mb-2">要比較的測站（可複選，第一個勾的測站會標示適合噴藥時段）</div>
          <div className="flex flex-wrap gap-2">
            {stations.map((s, k) => (
              <button key={s.id} onClick={() => toggle(s.id)}
                className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-1.5 ${ids.includes(s.id) ? 'border-stone-700 bg-stone-800 text-white' : 'border-stone-300 bg-white text-stone-700'}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETTE[k % PALETTE.length] }} />
                {s.name}<span className="opacity-60">{s.elevation}m</span>
                <Badge kind={s.source} />
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? <Loading /> : (
        <>
          <Card title="逐時氣溫" hint={`綠色底色＝${firstName}「適合噴藥」的時段（${RULES.spray.desc}）`}>
            <EChart height={360} option={{
              xAxis: { type: 'category', data: xs, axisLabel: { formatter: (v: string) => v.slice(5) } },
              yAxis: { type: 'value', name: '°C', scale: true },
              dataZoom: zoom, grid: { bottom: 60 },
              series: temp.map((s, k) => ({
                name: s.name, type: 'line', data: s.col, color: s.color, symbol: 'none', connectNulls: false,
                lineStyle: { width: s.id === 'composite' ? 3 : 1.5 },
                ...(k === 0 ? { markArea: { silent: true, itemStyle: { color: 'rgba(43,182,115,0.13)' }, data: sprayAreas } } : {}),
              })),
            }} />
          </Card>
          <Card title="逐時雨量" hint="每小時雨量（mm）">
            <EChart option={{
              xAxis: { type: 'category', data: xs, axisLabel: { formatter: (v: string) => v.slice(5) } },
              yAxis: { type: 'value', name: 'mm' },
              dataZoom: zoom, grid: { bottom: 60 },
              series: rain.map(s => ({ name: s.name, type: 'bar', data: s.col, color: s.color, barGap: 0 })),
            }} />
          </Card>
          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="逐時相對濕度" hint="≥ 90% 長時間持續，病害風險高">
              <EChart option={{
                xAxis: { type: 'category', data: xs, axisLabel: { formatter: (v: string) => v.slice(5) } },
                yAxis: { type: 'value', name: '%', max: 100, min: (v: { min: number }) => Math.max(0, Math.floor(v.min / 10) * 10) },
                dataZoom: [{ type: 'inside' }],
                series: rh.map(s => ({
                  name: s.name, type: 'line', data: s.col, color: s.color, symbol: 'none',
                  markLine: { silent: true, symbol: 'none', data: [{ yAxis: 90 }], lineStyle: { color: C.rh, type: 'dashed' }, label: { formatter: '90%' } },
                })),
              }} />
            </Card>
            <Card title="逐時平均風速" hint="噴藥建議 < 3 m/s">
              <EChart option={{
                xAxis: { type: 'category', data: xs, axisLabel: { formatter: (v: string) => v.slice(5) } },
                yAxis: { type: 'value', name: 'm/s' },
                dataZoom: [{ type: 'inside' }],
                series: ws.map(s => ({
                  name: s.name, type: 'line', data: s.col, color: s.color, symbol: 'none',
                  markLine: { silent: true, symbol: 'none', data: [{ yAxis: 3 }], lineStyle: { color: C.wind, type: 'dashed' }, label: { formatter: '3 m/s' } },
                })),
              }} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
