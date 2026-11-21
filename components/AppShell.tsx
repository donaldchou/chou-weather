'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import {
  BookOpen, CalendarDays, ChevronDown, ChevronsLeft, ChevronsRight, Clock, CloudSun, LogOut, Menu, ShieldCheck, Sprout, UserRound, X,
} from 'lucide-react';
import { logout, useMe } from '@/lib/client';
import { PlatformLinks } from './PlatformLinks';

/** 左側選單（同 chou-platform 的機制） */
const NAV = [
  {
    group: '天氣圖表',
    items: [
      { href: '/', label: '水蜜桃農事指標', icon: Sprout },
      { href: '/monthly', label: '每月統計與年度比較', icon: CalendarDays },
      { href: '/hourly', label: '逐時資料', icon: Clock },
      { href: '/sources', label: '資料來源與下載', icon: BookOpen },
    ],
  },
];

/** 只有管理者看得到的選單 */
const ADMIN_NAV = { group: '系統', items: [{ href: '/admin', label: '後台管理', icon: ShieldCheck }] };

/** 不套用側邊選單的頁面 */
const BARE_PAGES = ['/login'];

/* ---------------- 記在這台電腦瀏覽器的設定（側邊選單收合、分組收合） ---------------- */
function localSetting(key: string, fallback: string) {
  const listeners = new Set<() => void>();
  let memory: string | null = null;
  const read = () => {
    if (memory !== null) return memory;
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const write = (v: string) => {
    memory = v;
    try { localStorage.setItem(key, v); } catch { /* 無痕模式等無法儲存時，只在這次瀏覽有效 */ }
    listeners.forEach(l => l());
  };
  const use = () => useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, read, () => fallback);
  return { use, write };
}
const collapsedSetting = localSetting('chou-weather-sidebar-collapsed', '0');
const groupsSetting = localSetting('chou-weather-nav-closed-groups', '[]');

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE_PAGES.includes(pathname)) return <>{children}</>;
  return <Shell pathname={pathname}>{children}</Shell>;
}

function Shell({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const collapsed = collapsedSetting.use() === '1';
  const setCollapsed = (v: boolean) => collapsedSetting.write(v ? '1' : '0');
  const rawGroups = groupsSetting.use();
  let closedGroups: Set<string>;
  try { closedGroups = new Set(JSON.parse(rawGroups) as string[]); } catch { closedGroups = new Set(); }
  const toggleGroup = (g: string) => {
    const next = new Set(closedGroups);
    if (next.has(g)) next.delete(g); else next.add(g);
    groupsSetting.write(JSON.stringify([...next]));
  };

  const me = useMe();
  const groups = me?.role === 'admin' ? [...NAV, ADMIN_NAV] : NAV;
  const roleLabel = me ? (me.role === 'admin' ? '管理者' : '一般使用者') : '';
  const allClosed = groups.every(g => closedGroups.has(g.group));
  const toggleAll = () => groupsSetting.write(JSON.stringify(allClosed ? [] : groups.map(g => g.group)));

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));

  const nav = (mini: boolean) => (
    <nav className="flex h-full flex-col">
      <div className={`flex items-center gap-2 py-5 ${mini ? 'justify-center px-2' : 'px-5'}`}>
        {/* 點圖示：全部分組展開／收合（只剩圖示的窄選單沒有分組，改成展開選單） */}
        <button
          type="button"
          onClick={() => (mini ? setCollapsed(false) : toggleAll())}
          title={mini ? '展開選單' : allClosed ? '全部展開' : '全部收合'}
          aria-label={mini ? '展開選單' : allClosed ? '全部展開' : '全部收合'}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-500"
        >
          <CloudSun size={22} />
        </button>
        {!mini && (
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight text-white">上巴陵天氣</div>
            <div className="text-sm text-emerald-200/80">水蜜桃農事天氣</div>
          </div>
        )}
      </div>
      <div className={`flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-4 ${mini ? 'px-2' : 'px-3'}`}
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#047857 transparent' }}>
        {groups.map(g => {
          const groupOpen = mini || !closedGroups.has(g.group);
          const hasActive = g.items.some(it => isActive(it.href));
          return (
            <div key={g.group}>
              {mini ? (
                <div className="mx-2 mb-2 border-t border-emerald-800" />
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(g.group)}
                  aria-expanded={groupOpen}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 pb-1 pt-0.5 text-sm font-semibold tracking-wider hover:text-emerald-100 ${
                    !groupOpen && hasActive ? 'text-emerald-100' : 'text-emerald-300/70'}`}
                >
                  <span>{g.group}</span>
                  <span className="flex items-center gap-1.5">
                    {!groupOpen && <span className="text-xs font-normal">{g.items.length}</span>}
                    <ChevronDown size={16} className={`transition-transform ${groupOpen ? '' : '-rotate-90'}`} />
                  </span>
                </button>
              )}
              {groupOpen && g.items.map(it => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  title={mini ? it.label : undefined}
                  aria-label={mini ? it.label : undefined}
                  className={`flex items-center gap-3 rounded-lg py-2.5 text-base transition-colors ${mini ? 'justify-center px-0' : 'px-3'} ${
                    isActive(it.href) ? 'bg-emerald-700 font-medium text-white' : 'text-emerald-50/85 hover:bg-emerald-800/70'}`}
                >
                  <it.icon size={20} className="shrink-0" />
                  {!mini && <span className="truncate">{it.label}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <div className="space-y-1 border-t border-emerald-800 p-3">
        <PlatformLinks current="chou-weather" mini={mini} captionClass="text-emerald-300/70" />
        <div className={`flex items-center gap-2 text-base text-emerald-100 ${mini ? 'justify-center' : 'px-2'}`}
          title={me ? `${me.email}（${roleLabel}）` : undefined}>
          <UserRound size={18} className="shrink-0" />
          {!mini && (
            <div className="min-w-0">
              <div className="truncate">{me?.name || me?.email || '…'}</div>
              <div className="text-sm text-emerald-300/80">{roleLabel}</div>
            </div>
          )}
        </div>
        <button
          onClick={() => void logout()}
          title={mini ? '登出' : undefined}
          aria-label="登出"
          className={`flex w-full cursor-pointer items-center gap-3 rounded-lg py-2 text-base text-emerald-50/85 hover:bg-emerald-800/70 ${mini ? 'justify-center px-0' : 'px-3'}`}
        >
          <LogOut size={18} className="shrink-0" /> {!mini && '登出'}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-stone-100">
      {/* 桌機：浮動、圓角的選單，可收合成只剩圖示 */}
      <aside className={`fixed inset-y-3 left-3 z-30 hidden rounded-2xl bg-emerald-950 shadow-xl transition-[width] duration-200 lg:block print:hidden ${collapsed ? 'w-18' : 'w-64'}`}>
        {nav(collapsed)}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3.5 top-7 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-md hover:text-emerald-700"
          aria-label={collapsed ? '展開選單' : '收合選單'}
          title={collapsed ? '展開選單' : '收合選單'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </aside>

      {/* 手機：抽屜 */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-emerald-950">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-6 text-emerald-100" aria-label="關閉選單"><X size={22} /></button>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-24' : 'lg:pl-70'} print:pl-0`}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-3 py-3 backdrop-blur lg:hidden print:hidden">
          <button onClick={() => setOpen(true)} aria-label="開啟選單" className="text-stone-700"><Menu size={24} /></button>
          <span className="text-lg font-semibold text-stone-800">上巴陵天氣</span>
        </header>
        <main className="px-3 py-4 sm:px-4 lg:py-5 lg:pr-5">{children}</main>
      </div>
    </div>
  );
}
