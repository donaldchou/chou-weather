'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

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

function useChart(option: Option, fmt: TipFormat) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const hovered = useRef<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current);
    chart.current = c;
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
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  const { tipTitle, tipUnit } = fmt;
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.setOption(withDefaults(option, hovered, { tipTitle, tipUnit }), true);
    if (option.xAxis != null) enableBrushZoom(c);
  }, [option, tipTitle, tipUnit]);

  return { ref, chart };
}

const seriesCount = (o: Option) => (Array.isArray(o.series) ? o.series.length : o.series ? 1 : 0);

const RECENT_YEARS = 6;
/** 「最近 6 年」怎麼做：每年一條線 → 只開最近 6 條；X 軸是 YYYY-MM 月份 → 縮放到最近 72 個月；都不是就不顯示按鈕 */
function recentMode(o: Option): { kind: 'series'; names: string[] } | { kind: 'axis'; startValue: number; endValue: number } | null {
  const names = (Array.isArray(o.series) ? o.series : []).map(s => String((s as { name?: string }).name ?? ''));
  if (names.length > RECENT_YEARS && names.every(n => /^\d{4}/.test(n))) return { kind: 'series', names: names.slice(-RECENT_YEARS) };
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

function FullScreen({ option, fmt, onClose }: { option: Option; fmt: TipFormat; onClose: () => void }) {
  const { ref, chart } = useChart(option, fmt);
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

export default function EChart({ option, height = 320, tipTitle, tipUnit }: { option: Option; height?: number } & TipFormat) {
  const [full, setFull] = useState(false);
  const { ref, chart } = useChart(option, { tipTitle, tipUnit });
  const close = useCallback(() => setFull(false), []);
  return (
    <div>
      <Toolbar chart={chart} option={option} full={false} onFull={() => setFull(true)} />
      <div ref={ref} style={{ width: '100%', height }} />
      {full && <FullScreen option={option} fmt={{ tipTitle, tipUnit }} onClose={close} />}
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
