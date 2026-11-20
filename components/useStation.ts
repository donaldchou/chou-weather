'use client';
import { useEffect, useState } from 'react';
import { Cols, loadStation } from '@/lib/data';

/** 載入一個或多個測站的逐時資料 */
export function useStations(ids: string[]) {
  const key = ids.join(',');
  const [state, setState] = useState<{ key: string; data: Record<string, Cols> }>({ key: '', data: {} });
  useEffect(() => {
    let alive = true;
    Promise.all(key.split(',').map(async id => [id, await loadStation(id)] as const)).then(entries => {
      if (alive) setState({ key, data: Object.fromEntries(entries) });
    });
    return () => { alive = false; };
  }, [key]);
  // 切換測站時，舊資料先留著，直到新資料載入完成
  return { data: state.data, loading: state.key !== key };
}
