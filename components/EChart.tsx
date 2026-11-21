'use client';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import * as echarts from 'echarts';
import { readSaved, subscribeSaved, writeSaved } from '@/lib/saved';
import { ChartKeyContext } from './chart-key';

type Option = echarts.EChartsOption;

/** 彈出視窗的標題與單位（例：橫軸是「10/1 起第幾天」時，換成日期） */
export interface TipFormat {
  tipTitle?: (axisValue: number | string) => string;
  tipUnit?: string;
}

interface TipParam {
  seriesIndex: number; seriesName: string; marker: string; value: unknown; axisValue: number | string; axisValueLabel: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 彈出視窗：滑鼠所在的那條線（柱、點）整列粗體 */
function tipHtml(ps: TipParam[], hovered: number | null, fmt: TipFormat) {
  if (!ps.length) return '';
  const title = fmt.tipTitle ? fmt.tipTitle(ps[0].axisValue) : ps[0].axisValueLabel;
  const rows = ps.map(p => {
    const raw = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
    const val = raw == null || raw === '' || raw === '-' ? '—' : `${raw}${fmt.tipUnit ?? ''}`;
    const on = p.seriesIndex === hovered;
    return `<div style="display:flex;justify-content:space-between;gap:16px;font-weight:${on ? 700 : 400}${on ? ';color:#111' : ''}">`
      + `<span>${p.marker}${esc(p.seriesName)}</span><span>${val}</span></div>`;
  });
  return `<div style="font-weight:600;margin-bottom:2px">${esc(String(title))}</div>${rows.join('')}`;
}

/** 所有圖表統一：滑鼠在圖上按住拖曳＝選取區間放大（滾輪不縮放）、圖例全開全關、放大全螢幕 */
function withDefaults(option: Option, hovered: { current: number | null }, fmt: TipFormat): Option {
  const hasAxis = option.xAxis != null;
  const grid = (option.grid ?? {}) as { bottom?: number | string };
  const tooltip = (option.tooltip ?? {}) as Record<string, unknown>;
  const series = (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []) as Record<string, unknown>[];
  return {
    textStyle: { fontFamily: 'inherit' },
    animation: false,
    legend: { top: 4, type: 'scroll' },
    ...option,
    tooltip: {
      trigger: 'axis', confine: true, ...tooltip,
      formatter: ((ps: TipParam | TipParam[]) => tipHtml(Array.isArray(ps) ? ps : [ps], hovered.current, fmt)) as never,
    },
    // 線條本身也能觸發滑鼠事件（才知道滑鼠在哪一條線上）
    series: series.map(s => (s.type === 'line' ? { triggerLineEvent: true, ...s } : s)) as Option['series'],
    grid: { left: 52, right: 52, top: 64, containLabel: false, ...grid, bottom: grid.bottom ?? 40 },
    ...(hasAxis
      ? {
          // 拖曳選取靠工具列的 dataZoom 功能（工具列本身不顯示，由程式一直開著選取模式）
          toolbox: { show: true, itemSize: 0, right: -100, feature: { dataZoom: { yAxisIndex: 'none', filterMode: 'none' } } },
          // 不加 inside 縮放：只要有 inside，ECharts 就會攔下滾輪（頁面捲不動）。縮放只靠拖曳選取，
          // 「最近 6 年」「重設縮放」作用在拖曳選取自動建立的縮放元件上
        }
      : {}),
  };
}

/** 開啟「拖曳選取區間」模式 */
const enableBrushZoom = (c: echarts.ECharts) =>
  c.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: true });

/* ---------------- 記住每張圖的設定（關掉的資料、縮放範圍），放大畫面與 F5 後都還在 ---------------- */
type ChartState = { off?: string[]; zoom?: [string | number, string | number] };

/** 圖例名稱去掉括號裡會變動的部分（例：「2025~2026 冬（335h）」→「2025~2026 冬」），資料更新後還對得上 */
const baseName = (name: string) => name.replace(/\s*[（(].*$/, '').trim();
const seriesNames = (o: Option) =>
  (Array.isArray(o.series) ? o.series : o.series ? [o.series] : []).map(s => String((s as { name?: string }).name ?? ''));
const xData = (o: Option) => ((Array.isArray(o.xAxis) ? o.xAxis[0] : o.xAxis) as { data?: unknown[] } | undefined)?.data;

function loadState(key: string | null): ChartState {
  if (!key) return {};
  try { return JSON.parse(readSaved(key) ?? '{}') as ChartState; } catch { return {}; }
}

/** 把記住的設定套到圖上 */
function applyState(c: echarts.ECharts, option: Option, s: ChartState) {
  const names = seriesNames(option);
  const off = new Set(s.off ?? []);
  c.setOption({ legend: { selected: Object.fromEntries(names.map(n => [n, !off.has(baseName(n))])) } });
  if (option.xAxis == null) return;
  if (!s.zoom) {
    c.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    return;
  }
  const data = xData(option);
  // 類別軸存的是標籤（例：2021-05），資料變多後位置會變，所以換回目前的位置
  const pos = (v: string | number) => (data ? data.findIndex(d => String(d) === String(v)) : Number(v));
  const a = pos(s.zoom[0]), b = pos(s.zoom[1]);
  if (a >= 0 && b >= 0) c.dispatchAction({ type: 'dataZoom', startValue: a, endValue: b });
}

/** 從圖上讀出目前的設定 */
function readState(c: echarts.ECharts, option: Option): ChartState {
  const o = c.getOption() as { legend?: { selected?: Record<string, boolean> }[] };
  const sel = o.legend?.[0]?.selected ?? {};
  const off = [...new Set(seriesNames(option).filter(n => sel[n] === false).map(baseName))];
  const s: ChartState = {};
  if (off.length) s.off = off;
  // 拖曳選取建立的縮放元件，範圍不會出現在 getOption()，要直接問元件本身
  type DzModel = { getPercentRange(): number[]; getValueRange(): number[] };
  const model = (c as unknown as { getModel(): { getComponent(t: string, i: number): DzModel | undefined } }).getModel();
  for (let i = 0; i < 10; i++) {
    const dz = model.getComponent('dataZoom', i);
    if (!dz) break;
    const [p0, p1] = dz.getPercentRange();
    if (p0 <= 0.001 && p1 >= 99.999) continue;
    const [v0, v1] = dz.getValueRange();
    const data = xData(option);
    const v = (x: number) => (data ? String(data[Math.round(x)]) : x);
    s.zoom = [v(v0), v(v1)];
    break;
  }
  return s;
}

function useChart(option: Option, fmt: TipFormat, stateKey: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const hovered = useRef<number | null>(null);
  const applying = useRef(false);
  const optionRef = useRef(option);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current);
    chart.current = c;
    // 使用者改了資料開關或縮放 → 記下來（套用記住的設定時不要再存一次）
    const save = () => {
      if (applying.current || !stateKey) return;
      const s = readState(c, optionRef.current);
      writeSaved(stateKey, Object.keys(s).length ? JSON.stringify(s) : null);
    };
    for (const ev of ['legendselectchanged', 'legendselected', 'legendunselected', 'legendselectall', 'legendinverseselect', 'datazoom']) c.on(ev, save);
    // 另一張同名的圖（放大畫面／原畫面）改了設定 → 這張也跟著變
    const unsub = stateKey ? subscribeSaved(stateKey, () => {
      const cur = JSON.stringify(readState(c, optionRef.current));
      const want = loadState(stateKey);
      if (cur === JSON.stringify(want)) return;
      applying.current = true;
      applyState(c, optionRef.current, want);
      applying.current = false;
    }) : () => {};
    let pos: [number, number] | null = null;
    c.getZr().on('mousemove', e => { pos = [e.offsetX, e.offsetY]; });
    // 滑鼠移到某條線上／離開時，重畫彈出視窗（先 hideTip 才會重新產生內容）
    const setHovered = (i: number | null) => {
      if (hovered.current === i) return;
      hovered.current = i;
      if (!pos) return;
      c.dispatchAction({ type: 'hideTip' });
      c.dispatchAction({ type: 'showTip', x: pos[0], y: pos[1] });
    };
    c.on('mouseover', e => { if (e.componentType === 'series') setHovered(e.seriesIndex ?? null); });
    c.on('mouseout', e => { if (e.componentType === 'series') setHovered(null); });
    c.getZr().on('globalout', () => { pos = null; hovered.current = null; });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => { unsub(); ro.disconnect(); c.dispose(); chart.current = null; };
  }, [stateKey]);

  const { tipTitle, tipUnit } = fmt;
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    optionRef.current = option;
    applying.current = true;
    c.setOption(withDefaults(option, hovered, { tipTitle, tipUnit }), true);
    if (option.xAxis != null) enableBrushZoom(c);
    applyState(c, option, loadState(stateKey));
    applying.current = false;
  }, [option, tipTitle, tipUnit, stateKey]);

  return { ref, chart };
}

const seriesCount = (o: Option) => (Array.isArray(o.series) ? o.series.length : o.series ? 1 : 0);

const RECENT_YEARS = 6;
/** 「最近 6 年」怎麼做：每年一條線 → 只開最近 6 條；X 軸是 YYYY-MM 月份 → 縮放到最近 72 個月；都不是就不顯示按鈕 */
function recentMode(o: Option): { kind: 'series'; names: string[] } | { kind: 'axis'; startValue: number; endValue: number } | null {
  const names = (Array.isArray(o.series) ? o.series : []).map(s => String((s as { name?: string }).name ?? ''));
  // 每年一條線（名稱開頭是年份）；其他參考線（例：ET0 歷年平均）一直保留顯示
  const yearNames = names.filter(n => /^\d{4}/.test(n));
  if (yearNames.length > RECENT_YEARS && yearNames.length >= names.length - 2) {
    return { kind: 'series', names: [...yearNames.slice(-RECENT_YEARS), ...names.filter(n => !/^\d{4}/.test(n))] };
  }
  const x = (Array.isArray(o.xAxis) ? o.xAxis[0] : o.xAxis) as { data?: unknown[] } | undefined;
  const data = x?.data ?? [];
  if (data.length > RECENT_YEARS * 12 && data.every(v => /^\d{4}-\d\d$/.test(String(v)))) {
    return { kind: 'axis', startValue: data.length - RECENT_YEARS * 12, endValue: data.length - 1 };
  }
  return null;
}

function Toolbar({ chart, option, full, onFull }: {
  chart: React.RefObject<echarts.ECharts | null>; option: Option; full: boolean; onFull: () => void;
}) {
  const multi = seriesCount(option) > 1;
  const recent = recentMode(option);
  const showRecent = () => {
    const c = chart.current;
    if (!c || !recent) return;
    if (recent.kind === 'series') {
      c.dispatchAction({ type: 'legendAllSelect' });
      c.dispatchAction({ type: 'legendInverseSelect' });
      for (const name of recent.names) c.dispatchAction({ type: 'legendSelect', name });
    } else {
      c.dispatchAction({ type: 'dataZoom', startValue: recent.startValue, endValue: recent.endValue });
    }
  };
  const btn = 'px-2.5 py-1 rounded-md border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-xs sm:text-sm whitespace-nowrap';
  return (
    <div className="flex flex-wrap justify-end items-center gap-1.5 mb-1">
      {option.xAxis != null && <span className="text-xs text-stone-400 mr-auto">在圖上按住拖曳，可選取區間放大</span>}
      {recent && <button className={btn} onClick={showRecent}>最近 {RECENT_YEARS} 年</button>}
      {multi && <>
        <button className={btn} onClick={() => chart.current?.dispatchAction({ type: 'legendAllSelect' })}>資料全開</button>
        <button className={btn} onClick={() => {
          chart.current?.dispatchAction({ type: 'legendAllSelect' });
          chart.current?.dispatchAction({ type: 'legendInverseSelect' });
        }}>資料全關</button>
      </>}
      {option.xAxis != null && (
        <button className={btn} onClick={() => chart.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })}>重設縮放</button>
      )}
      <button className={btn} onClick={onFull}>{full ? '✕ 關閉' : '⛶ 放大'}</button>
    </div>
  );
}

function FullScreen({ option, fmt, stateKey, onClose }: { option: Option; fmt: TipFormat; stateKey: string | null; onClose: () => void }) {
  const { ref, chart } = useChart(option, fmt, stateKey);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col p-3 sm:p-5">
      <Toolbar chart={chart} option={option} full onFull={onClose} />
      <div ref={ref} className="flex-1 min-h-0 w-full" />
      <p className="text-xs text-stone-400 text-center mt-1">在圖上按住滑鼠左右拖曳＝選取區間放大；按「重設縮放」看全部；按 Esc 或「關閉」回到原畫面</p>
    </div>
  );
}

/** stateKey：記住設定用的名稱；沒給就用「頁面路徑＋區塊標題」 */
export default function EChart({ option, height = 320, tipTitle, tipUnit, stateKey }: { option: Option; height?: number; stateKey?: string } & TipFormat) {
  const [full, setFull] = useState(false);
  const pathname = usePathname();
  const cardTitle = useContext(ChartKeyContext);
  const key = stateKey ?? (cardTitle ? `chart:${pathname}|${cardTitle}` : null);
  const { ref, chart } = useChart(option, { tipTitle, tipUnit }, key);
  const close = useCallback(() => setFull(false), []);
  return (
    <div>
      <Toolbar chart={chart} option={option} full={false} onFull={() => setFull(true)} />
      <div ref={ref} style={{ width: '100%', height }} />
      {full && <FullScreen option={option} fmt={{ tipTitle, tipUnit }} stateKey={key} onClose={close} />}
    </div>
  );
}

/** 各年份顏色：最新一年固定紅色，往前依序換色（最多 18 種不重複） */
const YEAR_PALETTE = [
  '#e4572e', '#3a86ff', '#2bb673', '#f4a300', '#8d6cab', '#17becf', '#d62728', '#8b5e3c', '#e377c2', '#bcbd22',
  '#1d4e89', '#9aa5b1', '#6a994e', '#c08497', '#5e548e', '#ff8c42', '#2f4858', '#a3a380',
];
export const yearColor = (k: number, n: number) => YEAR_PALETTE[(n - 1 - k) % YEAR_PALETTE.length];

/** 常用顏色 */
export const C = {
  temp: '#e4572e',
  tMax: '#f08a5d',
  tMin: '#3a86ff',
  rain: '#2a9df4',
  rh: '#2bb673',
  wind: '#8d6cab',
  sun: '#f4a300',
  soil: '#8b5e3c',
  grey: '#9aa5b1',
};
