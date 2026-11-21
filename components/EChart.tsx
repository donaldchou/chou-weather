'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

type Option = echarts.EChartsOption;

/** 所有圖表統一：X 軸可縮放（滑鼠滾輪／兩指／下方拉桿）、圖例全開全關、放大全螢幕 */
function withDefaults(option: Option, full: boolean): Option {
  const hasAxis = option.xAxis != null;
  const grid = (option.grid ?? {}) as { bottom?: number | string };
  return {
    textStyle: { fontFamily: 'inherit' },
    animation: false,
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 4, type: 'scroll' },
    ...option,
    grid: { left: 52, right: 52, top: 64, containLabel: false, ...grid, bottom: hasAxis ? 64 : (grid.bottom ?? 40) },
    ...(hasAxis
      ? {
          dataZoom: [
            { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
            { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: full ? 24 : 18, bottom: 8 },
          ],
        }
      : {}),
  };
}

function useChart(option: Option, full: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current);
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.current?.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    chart.current?.setOption(withDefaults(option, full), true);
  }, [option, full]);

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
    <div className="flex flex-wrap justify-end gap-1.5 mb-1">
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

function FullScreen({ option, onClose }: { option: Option; onClose: () => void }) {
  const { ref, chart } = useChart(option, true);
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
      <p className="text-xs text-stone-400 text-center mt-1">滑鼠滾輪或兩指縮放、拖曳移動；下方拉桿可選範圍；按 Esc 或「關閉」回到原畫面</p>
    </div>
  );
}

export default function EChart({ option, height = 320 }: { option: Option; height?: number }) {
  const [full, setFull] = useState(false);
  const { ref, chart } = useChart(option, false);
  const close = useCallback(() => setFull(false), []);
  return (
    <div>
      <Toolbar chart={chart} option={option} full={false} onFull={() => setFull(true)} />
      <div ref={ref} style={{ width: '100%', height }} />
      {full && <FullScreen option={option} onClose={close} />}
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
