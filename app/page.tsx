'use client';
import ChartPage from '@/components/ChartPage';
import PeachTab from '@/components/PeachTab';

export default function Home() {
  return <ChartPage title="水蜜桃農事指標" render={(idx, stations) => <PeachTab idx={idx} stations={stations} />} />;
}
