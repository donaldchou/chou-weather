'use client';
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function EChart({ option, height = 320 }: { option: echarts.EChartsOption; height?: number }) {
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
    chart.current?.setOption(
      {
        textStyle: { fontFamily: 'inherit' },
        animation: false,
        grid: { left: 52, right: 52, top: 48, bottom: 40, containLabel: false },
        tooltip: { trigger: 'axis', confine: true },
        legend: { top: 4, type: 'scroll' },
        ...option,
      },
      true,
    );
  }, [option]);

  return <div ref={ref} style={{ width: '100%', height }} />;
}

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
  years: ['#9aa5b1', '#3a86ff', '#2bb673', '#f4a300', '#e4572e', '#8d6cab'],
};
