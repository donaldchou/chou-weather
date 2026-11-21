'use client';
import ChartPage from '@/components/ChartPage';
import HourlyTab from '@/components/HourlyTab';

export default function HourlyPage() {
  return <ChartPage title="逐時資料" render={(idx, stations) => <HourlyTab idx={idx} stations={stations} />} />;
}
