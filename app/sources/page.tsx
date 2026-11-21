'use client';
import ChartPage from '@/components/ChartPage';
import SourcesTab from '@/components/SourcesTab';

export default function SourcesPage() {
  return <ChartPage title="資料來源與下載" render={(idx, stations) => <SourcesTab idx={idx} stations={stations} />} />;
}
