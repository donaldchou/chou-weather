'use client';
import ChartPage from '@/components/ChartPage';
import OverviewTab from '@/components/OverviewTab';

export default function MonthlyPage() {
  return <ChartPage title="每月統計與年度比較" render={(idx, stations) => <OverviewTab idx={idx} stations={stations} />} />;
}
