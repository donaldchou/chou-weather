'use client';
import { useEffect, useState } from 'react';
import { Lock, LockOpen, Minus, Plus } from 'lucide-react';
import { lock, unlock, useUnlock } from '@/lib/client';
import { Button, Input } from './admin-ui';

// 和後端 UNLOCK_HOURS（lib/server/session.ts）一致
const HOURS_MIN = 1;
const HOURS_MAX = 12;

function useRemaining(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

const hms = (s: number) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ''}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** 後台的驗證碼解鎖：輸入一次驗證碼，選定的時數內（1–12 小時）新增／修改／刪除都不用再輸入 */
export function UnlockPanel() {
  const until = useUnlock();
  const left = useRemaining(until);
  const [hours, setHours] = useState(HOURS_MIN);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const unlocked = !!until && left > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError('請輸入驗證碼');
    setBusy(true);
    setError('');
    const res = await unlock(code.trim(), hours);
    setBusy(false);
    setCode('');
    if (!res.ok) setError(res.error);
  }

  return (
    <div className={`mb-5 rounded-xl border p-4 ${unlocked ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {unlocked ? <LockOpen size={22} className="text-emerald-700" /> : <Lock size={22} className="text-amber-700" />}
          <div>
            <div className="font-semibold text-stone-800">驗證碼解鎖</div>
            <div className="text-sm text-stone-600">
              {unlocked
                ? <>已解鎖，後台的新增／修改／刪除都不用輸入驗證碼，<b className="tabular-nums">{hms(left)}</b> 後失效。</>
                : `輸入一次驗證碼，${hours} 小時內後台的新增／修改／刪除都不用再輸入。`}
            </div>
          </div>
        </div>
        {unlocked ? (
          <Button variant="secondary" onClick={() => void lock()}>立即鎖定</Button>
        ) : (
          <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
            <div className="flex h-[38px] items-center rounded-lg border border-stone-300 bg-white" role="group" aria-label="解鎖時數">
              <button type="button" aria-label="減少 1 小時" disabled={hours <= HOURS_MIN} onClick={() => setHours(h => Math.max(HOURS_MIN, h - 1))}
                className="flex h-full w-9 items-center justify-center rounded-l-lg text-stone-600 hover:bg-stone-100 disabled:text-stone-300">
                <Minus size={16} />
              </button>
              <span className="min-w-16 select-none text-center text-sm font-semibold tabular-nums text-stone-800">{hours} 小時</span>
              <button type="button" aria-label="增加 1 小時" disabled={hours >= HOURS_MAX} onClick={() => setHours(h => Math.min(HOURS_MAX, h + 1))}
                className="flex h-full w-9 items-center justify-center rounded-r-lg text-stone-600 hover:bg-stone-100 disabled:text-stone-300">
                <Plus size={16} />
              </button>
            </div>
            <div>
              <Input type="password" autoComplete="off" placeholder="請輸入驗證碼" value={code} onChange={e => { setCode(e.target.value); setError(''); }} />
              {error && <div className="mt-1 text-xs font-medium text-red-600">{error}</div>}
            </div>
            <Button type="submit" disabled={busy}>{busy ? '驗證中…' : `解鎖 ${hours} 小時`}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
