'use client';
import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCodeGate } from '@/components/code-modal';
import { UnlockPanel } from '@/components/unlock-panel';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Table, Tabs, Td } from '@/components/admin-ui';
import { call, errMsg, useMe, type CodeResult } from '@/lib/client';
import { FIELD_LABEL } from '@/lib/data';
import { useSaved } from '@/lib/saved';

type Tab = 'users' | 'weather' | 'logs';

/* ---------------- 目前分頁，記在這台電腦的瀏覽器 ---------------- */
const TABS: Tab[] = ['users', 'weather', 'logs'];
const TAB_KEY = 'chou-weather-admin-tab';
const tabListeners = new Set<() => void>();
let memoryTab: Tab | null = null;
function readTab(): Tab {
  if (memoryTab) return memoryTab;
  try {
    const v = localStorage.getItem(TAB_KEY) as Tab;
    return TABS.includes(v) ? v : 'users';
  } catch {
    return 'users';
  }
}
function writeTab(v: Tab) {
  memoryTab = v;
  try { localStorage.setItem(TAB_KEY, v); } catch { /* 無法儲存時只在這次瀏覽有效 */ }
  tabListeners.forEach(l => l());
}
function useTab(): [Tab, (v: Tab) => void] {
  const tab = useSyncExternalStore(l => { tabListeners.add(l); return () => tabListeners.delete(l); }, readTab, () => 'users' as Tab);
  return [tab, writeTab];
}

/** 內容會讀「現在時間」（今天日期、解鎖倒數），包在 Suspense 裡改在瀏覽器畫，不在 build 時預先產生 */
export default function AdminPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-stone-500">載入中…</p>}>
      <AdminContent />
    </Suspense>
  );
}

function AdminContent() {
  const [tab, setTab] = useTab();
  return (
    <>
      <PageHeader title="後台管理" desc="管理登入帳號、檢視與修正 ll3 weather.mdb 的天氣資料、查看自動更新紀錄。只有管理者看得到這一頁。" />
      <UnlockPanel />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'users', label: '使用者管理' },
        { value: 'weather', label: '天氣資料' },
        { value: 'logs', label: '更新紀錄' },
      ]} />
      {tab === 'users' ? <UsersTab /> : tab === 'weather' ? <WeatherTab /> : <LogsTab />}
    </>
  );
}

/** 新增、重設密碼前先確認驗證碼（只檢查、不修改資料） */
async function verifyCode(action: 'create' | 'update' | 'delete', code: string): Promise<CodeResult> {
  try {
    await call('/api/verify-code', { method: 'POST', body: JSON.stringify({ action, code }) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

const fmtTime = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '—');

/* ================= 使用者管理 ================= */
type User = { id: string; email: string; name: string; role: 'admin' | 'user'; active: boolean; lastLoginAt: string | null; createdAt: string | null };

function UsersTab() {
  const me = useMe();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState<{ code: string } | null>(null);
  const [resetting, setResetting] = useState<{ user: User; code: string } | null>(null);
  const [nameKey, setNameKey] = useState(0);
  const gate = useCodeGate();

  useEffect(() => {
    call<User[]>('/api/admin/users').then(setUsers, e => setError(errMsg(e)));
  }, []);

  async function patch(u: User, body: Partial<User> & { password?: string }, code: string): Promise<CodeResult> {
    try {
      const saved = await call<User>(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body), code });
      setUsers(list => list?.map(x => (x.id === saved.id ? saved : x)) ?? null);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  }

  const askPatch = (u: User, body: Partial<User>, what: string) => gate.ask({
    title: '修改使用者', confirmLabel: '確認修改',
    message: <>修改 <b>{u.email}</b> 的{what}需要驗證碼。</>,
    submit: code => patch(u, body, code),
    onCancel: () => setNameKey(k => k + 1),
  });

  const askAdd = () => gate.ask({
    title: '新增使用者', confirmLabel: '下一步', message: '新增使用者需要驗證碼。',
    submit: async code => {
      const res = await verifyCode('create', code);
      if (res.ok) setAdding({ code });
      return res;
    },
  });

  const askReset = (u: User) => gate.ask({
    title: '重設密碼', confirmLabel: '下一步', message: <>重設 <b>{u.email}</b> 的密碼需要驗證碼。</>,
    submit: async code => {
      const res = await verifyCode('update', code);
      if (res.ok) setResetting({ user: u, code });
      return res;
    },
  });

  const askDelete = (u: User) => gate.ask({
    title: '刪除使用者', confirmLabel: '確認刪除', danger: true,
    message: <>即將刪除使用者 <b>{u.email}</b>，無法復原。</>,
    submit: async code => {
      try {
        await call(`/api/admin/users/${u.id}`, { method: 'DELETE', code });
        setUsers(list => list?.filter(x => x.id !== u.id) ?? null);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: errMsg(e) };
      }
    },
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">管理者可以進入後台、修改資料；一般使用者登入後只能看天氣圖表。沒有註冊頁，帳號都從這裡建立。帳號存在 ll3 的 weather.mdb（users 表），密碼只存加密後的雜湊。</p>
        <Button onClick={askAdd}><Plus size={16} /> 新增使用者</Button>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <Table head={['Email', '名稱', '身分', '狀態', '最後登入', '建立時間', '']}>
        {users?.map(u => {
          const self = u.id === me?.id;
          return (
            <tr key={u.id} className="hover:bg-stone-50">
              <Td className="font-medium text-stone-900">{u.email} {self && <Badge tone="green">我</Badge>}</Td>
              <Td>
                <Input key={`${u.name}-${nameKey}`} defaultValue={u.name} placeholder="（未填）" className="min-w-28"
                  onBlur={e => e.target.value !== u.name && askPatch(u, { name: e.target.value }, '名稱')} />
              </Td>
              <Td>
                <Select value={u.role} disabled={self} className="min-w-32" title={self ? '不能變更自己的身分' : undefined}
                  onChange={e => askPatch(u, { role: e.target.value as User['role'] }, '身分')}>
                  <option value="admin">管理者</option>
                  <option value="user">一般使用者</option>
                </Select>
              </Td>
              <Td>
                <label className={`flex items-center gap-2 whitespace-nowrap ${self ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={u.active} disabled={self} className="h-4 w-4 accent-emerald-600"
                    onChange={e => askPatch(u, { active: e.target.checked }, e.target.checked ? '狀態（啟用）' : '狀態（停用）')} />
                  {u.active ? '啟用' : <span className="text-red-600">停用</span>}
                </label>
              </Td>
              <Td className="whitespace-nowrap text-stone-500">{fmtTime(u.lastLoginAt)}</Td>
              <Td className="whitespace-nowrap text-stone-500">{fmtTime(u.createdAt)}</Td>
              <Td className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" onClick={() => askReset(u)}><KeyRound size={14} /> 重設密碼</Button>
                {!self && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => askDelete(u)} title="刪除"><Trash2 size={14} /></Button>}
              </Td>
            </tr>
          );
        })}
        {users === null && !error && <tr><Td colSpan={7} className="py-8 text-center text-stone-400">載入中…</Td></tr>}
      </Table>
      {gate.dialog}
      {adding && <AddUserModal code={adding.code} onClose={() => setAdding(null)} onAdded={u => setUsers(list => [...(list ?? []), u])} />}
      {resetting && (
        <PasswordModal user={resetting.user} onClose={() => setResetting(null)} onSave={p => patch(resetting.user, { password: p }, resetting.code)} />
      )}
    </>
  );
}

function AddUserModal({ code, onClose, onAdded }: { code: string; onClose: () => void; onAdded: (u: User) => void }) {
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user' as User['role'] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onAdded(await call<User>('/api/admin/users', { method: 'POST', body: JSON.stringify(form), code }));
      onClose();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="新增使用者" footer={<>
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="add-user" disabled={busy}>{busy ? '建立中…' : '建立'}</Button>
    </>}>
      <form id="add-user" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" className="sm:col-span-2">
          <Input type="email" required autoFocus value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="名稱"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：阿明" /></Field>
        <Field label="身分">
          <Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as User['role'] })}>
            <option value="user">一般使用者（只能看）</option>
            <option value="admin">管理者</option>
          </Select>
        </Field>
        <Field label="密碼（至少 8 個字元）" className="sm:col-span-2">
          <Input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>
    </Modal>
  );
}

function PasswordModal({ user, onClose, onSave }: { user: User; onClose: () => void; onSave: (p: string) => Promise<CodeResult> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await onSave(password);
    if (res.ok) return onClose();
    alert(`修改失敗：${res.error}`);
    setBusy(false);
  }
  return (
    <Modal open onClose={onClose} title={`重設密碼：${user.email}`} footer={<>
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="reset-password" disabled={busy}>{busy ? '儲存中…' : '儲存新密碼'}</Button>
    </>}>
      <form id="reset-password" onSubmit={submit}>
        <Field label="新密碼（至少 8 個字元）">
          <Input type="password" required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/* ================= 天氣資料 ================= */
type Station = {
  station_id: string; station_name: string; source_type: string; elevation_m: number;
  data_from: string; data_to: string; field_list: string; hourly_count: number;
};
type HourRow = { time: string } & Record<string, number | null>;
type DayRow = { date: string } & Record<string, number | null>;

const HOURLY_FIELDS = ['t', 'rh', 'rain', 'ws', 'gust', 'wd', 'p', 'sun', 'rad', 'dew', 'cloud', 'et0', 'vpd', 'soilT0', 'soilT28', 'soilM0', 'soilM28'];
const DAILY_COLS: [string, string][] = [
  ['temp_mean', '均溫'], ['temp_max', '最高溫'], ['temp_min', '最低溫'], ['rh_mean', '濕度'], ['rain_mm', '雨量'], ['wind_mean', '風速'],
  ['gust_max', '陣風'], ['sunshine_h', '日照'], ['radiation_mj', '日射'], ['et0_mm', 'ET0'],
  ['chill_h', '需冷'], ['frost_h', '霜害'], ['wet_h', '高濕'], ['heat_h', '高溫'], ['spray_h', '可噴藥'], ['temp_hours', '氣溫筆數'], ['rain_hours', '雨量筆數'],
];
const label = (f: string) => FIELD_LABEL[f] ? `${FIELD_LABEL[f].name}` : f;
const unit = (f: string) => FIELD_LABEL[f]?.unit ?? '';
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const shiftDay = (d: string, n: number) => new Date(Date.parse(d) + n * 86400e3).toISOString().slice(0, 10);

function WeatherTab() {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [error, setError] = useState('');
  const [sid, setSid] = useSaved('admin:weather:station', 'composite');
  const [mode, setMode] = useSaved<'hourly' | 'daily'>('admin:weather:mode', 'hourly');
  const [day, setDay] = useSaved('admin:weather:day', today());
  const [days, setDays] = useSaved('admin:weather:days', 1);
  const [month, setMonth] = useSaved('admin:weather:month', today().slice(0, 7));
  const [rows, setRows] = useState<{ key: string; data?: (HourRow | DayRow)[]; error?: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<{ time: string; values: Record<string, string>; isNew: boolean } | null>(null);
  const gate = useCodeGate();

  useEffect(() => {
    call<Station[]>('/api/admin/weather?type=stations').then(setStations, e => setError(errMsg(e)));
  }, []);

  const from = mode === 'hourly' ? shiftDay(day, -(days - 1)) : `${month}-01`;
  // 逐日：整個月（下個月第 0 天＝這個月最後一天）
  const to = mode === 'hourly' ? day : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const key = `${mode}|${sid}|${from}|${to}|${version}`;
  useEffect(() => {
    let alive = true;
    call<(HourRow | DayRow)[]>(`/api/admin/weather?type=${mode}&station=${encodeURIComponent(sid)}&from=${from}&to=${to}`).then(
      data => alive && setRows({ key, data }),
      e => alive && setRows({ key, error: errMsg(e) }),
    );
    return () => { alive = false; };
  }, [key, mode, sid, from, to]);
  const loading = rows?.key !== key;

  const st = stations?.find(s => s.station_id === sid);
  const fields = st ? HOURLY_FIELDS.filter(f => st.field_list.split(' ').includes(f)) : HOURLY_FIELDS.slice(0, 7);
  const reload = () => setVersion(v => v + 1);

  const openEdit = (r: HourRow | null) => setEditing({
    time: r ? r.time : `${day} 01`,
    isNew: !r,
    values: Object.fromEntries(fields.map(f => [f, r && r[f] != null ? String(r[f]) : ''])),
  });

  function save(code: string): Promise<CodeResult> {
    const e = editing!;
    const values = Object.fromEntries(fields.map(f => [f, e.values[f].trim() === '' ? null : Number(e.values[f])]));
    return call('/api/admin/weather', { method: 'PUT', body: JSON.stringify({ station: sid, time: e.time, values }), code }).then(
      () => { setEditing(null); reload(); return { ok: true } as CodeResult; },
      err => ({ ok: false, error: errMsg(err) }),
    );
  }

  const askSave = () => {
    const e = editing!;
    if (!/^\d{4}-\d\d-\d\d \d\d$/.test(e.time)) return alert('時間格式要是 YYYY-MM-DD HH，例如 2026-11-21 08');
    const bad = fields.find(f => e.values[f].trim() !== '' && isNaN(Number(e.values[f])));
    if (bad) return alert(`${label(bad)} 要填數字`);
    gate.ask({
      title: e.isNew ? '新增逐時資料' : '修改逐時資料', confirmLabel: '確認儲存',
      message: <>{e.isNew ? '新增' : '修改'} <b>{st?.station_name ?? sid}</b> {e.time}:00 的資料需要驗證碼。儲存後會自動重算上巴陵綜合與當天的逐日統計。</>,
      submit: save,
    });
  };

  const askDelete = (r: HourRow) => gate.ask({
    title: '刪除逐時資料', confirmLabel: '確認刪除', danger: true,
    message: <>即將刪除 <b>{st?.station_name ?? sid}</b> {r.time}:00 的整筆資料，無法復原（下次自動更新可能會再補回來）。</>,
    submit: code => call('/api/admin/weather', { method: 'DELETE', body: JSON.stringify({ station: sid, time: r.time }), code }).then(
      () => { reload(); return { ok: true } as CodeResult; },
      err => ({ ok: false, error: errMsg(err) }),
    ),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
      <section className="h-fit rounded-xl border border-stone-200 bg-white p-2 shadow-sm">
        {error && <p className="p-2 text-sm text-red-600">{error}</p>}
        {!stations && !error && <p className="p-3 text-sm text-stone-400">載入測站中…</p>}
        <nav className="flex flex-col">
          {stations?.map(s => (
            <button key={s.station_id} onClick={() => setSid(s.station_id)}
              className={`rounded-lg px-3 py-2 text-left text-sm ${s.station_id === sid ? 'bg-emerald-700 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{s.station_name}</span>
                <span className={`tabular-nums text-xs ${s.station_id === sid ? 'text-emerald-100' : 'text-stone-400'}`}>{s.hourly_count.toLocaleString()}</span>
              </div>
              <div className={`text-xs ${s.station_id === sid ? 'text-emerald-100' : 'text-stone-400'}`}>{s.station_id}　{s.data_from} ~ {s.data_to}</div>
            </button>
          ))}
        </nav>
      </section>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex overflow-hidden rounded-lg border border-stone-300">
            {(['hourly', 'daily'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-2 text-sm ${mode === m ? 'bg-emerald-700 text-white' : 'bg-white text-stone-700 hover:bg-stone-50'}`}>
                {m === 'hourly' ? '逐時' : '逐日統計'}
              </button>
            ))}
          </div>
          {mode === 'hourly' ? (
            <>
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" onClick={() => setDay(shiftDay(day, -days))} title="往前"><ChevronLeft size={16} /></Button>
                <Input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className="!w-auto" />
                <Button variant="secondary" size="sm" onClick={() => setDay(shiftDay(day, days))} title="往後"><ChevronRight size={16} /></Button>
              </div>
              <Select value={days} onChange={e => setDays(+e.target.value)} className="!w-auto">
                {[1, 2, 3, 7, 14, 31].map(n => <option key={n} value={n}>{n === 1 ? '這一天' : `往前 ${n} 天`}</option>)}
              </Select>
              <Button variant="secondary" onClick={() => openEdit(null)}><Plus size={15} /> 新增一小時</Button>
            </>
          ) : (
            <Input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="!w-auto" />
          )}
          <Button variant="ghost" onClick={reload} title="重新讀取"><RefreshCw size={15} /></Button>
        </div>
        <p className="mb-3 text-xs text-stone-500">
          {mode === 'hourly'
            ? '時間是該小時「結束」的時間（例：08:00 代表 07:00~08:00）；24:00 記為隔天 00:00。修改或刪除後，ll3 會自動重算上巴陵綜合與當天的逐日統計。注意：網站圖表讀的是 Vercel 上的資料檔，要重新產生資料檔才會看到修改。'
            : '逐日統計由逐時資料自動計算，不能直接修改；要修正請改逐時資料。'}
        </p>
        {rows?.error && !loading && <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{rows.error}</p>}
        {mode === 'hourly' ? (
          <Table head={['時間', ...fields.map(f => <span key={f}>{label(f)}<span className="ml-0.5 text-xs font-normal text-stone-400">{unit(f)}</span></span>), '']}>
            {!loading && (rows?.data as HourRow[] | undefined)?.map(r => (
              <tr key={r.time} className="hover:bg-stone-50">
                <Td className="whitespace-nowrap font-mono text-xs">{r.time}:00</Td>
                {fields.map(f => <Td key={f} className="text-right tabular-nums">{r[f] ?? <span className="text-stone-300">—</span>}</Td>)}
                <Td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="修改"><Pencil size={14} /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => askDelete(r)} title="刪除"><Trash2 size={14} /></Button>
                </Td>
              </tr>
            ))}
            {(loading || !rows?.data?.length) && (
              <tr><Td colSpan={fields.length + 2} className="py-8 text-center text-stone-400">{loading ? '載入中…' : '這段時間沒有資料'}</Td></tr>
            )}
          </Table>
        ) : (
          <Table head={['日期', ...DAILY_COLS.map(c => c[1])]}>
            {!loading && (rows?.data as DayRow[] | undefined)?.map(r => (
              <tr key={r.date} className="hover:bg-stone-50">
                <Td className="whitespace-nowrap font-mono text-xs">{r.date}</Td>
                {DAILY_COLS.map(([c]) => <Td key={c} className="text-right tabular-nums">{r[c] ?? <span className="text-stone-300">—</span>}</Td>)}
              </tr>
            ))}
            {(loading || !rows?.data?.length) && (
              <tr><Td colSpan={DAILY_COLS.length + 1} className="py-8 text-center text-stone-400">{loading ? '載入中…' : '這個月沒有資料'}</Td></tr>
            )}
          </Table>
        )}
      </div>

      {editing && (
        <Modal open wide onClose={() => setEditing(null)} title={`${editing.isNew ? '新增' : '修改'}：${st?.station_name ?? sid}`} footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
          <Button onClick={askSave}>儲存</Button>
        </>}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="時間（YYYY-MM-DD HH）" hint="該小時結束的時間" className="sm:col-span-3">
              <Input value={editing.time} disabled={!editing.isNew} onChange={e => setEditing({ ...editing, time: e.target.value })} className="font-mono" />
            </Field>
            {fields.map(f => (
              <Field key={f} label={`${label(f)}${unit(f) ? `（${unit(f)}）` : ''}`}>
                <Input inputMode="decimal" value={editing.values[f]} placeholder="空白＝沒有資料"
                  onChange={e => setEditing({ ...editing, values: { ...editing.values, [f]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Modal>
      )}
      {gate.dialog}
    </div>
  );
}

/* ================= 更新紀錄 ================= */
type Log = { id: number; time: string; kind: string; ok: boolean; message: string };
const KIND_LABEL: Record<string, string> = { realtime: '即時中繼', daily: '每日校正', admin: '後台修改' };
const PAGE_SIZE = 50;

function LogsTab() {
  const [kind, setKind] = useSaved('admin:logs:kind', '');
  const [ok, setOk] = useSaved('admin:logs:ok', '');
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [res, setRes] = useState<{ key: string; data?: { total: number; items: Log[] }; error?: string } | null>(null);
  const key = `${kind}|${ok}|${page}|${version}`;

  useEffect(() => {
    let alive = true;
    call<{ total: number; items: Log[] }>(`/api/admin/logs?kind=${kind}&ok=${ok}&page=${page}&size=${PAGE_SIZE}`).then(
      data => alive && setRes({ key, data }),
      e => alive && setRes({ key, error: errMsg(e) }),
    );
    return () => { alive = false; };
  }, [key, kind, ok, page]);
  const loading = res?.key !== key;
  const pages = res?.data ? Math.max(1, Math.ceil(res.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={kind} onChange={e => { setKind(e.target.value); setPage(1); }} className="!w-auto">
          <option value="">全部類型</option>
          <option value="realtime">即時中繼（每 10 分鐘）</option>
          <option value="daily">每日校正（每天 10:00）</option>
          <option value="admin">後台修改</option>
        </Select>
        <Select value={ok} onChange={e => { setOk(e.target.value); setPage(1); }} className="!w-auto">
          <option value="">成功與失敗</option>
          <option value="1">只看成功</option>
          <option value="0">只看失敗</option>
        </Select>
        <Button variant="ghost" onClick={() => setVersion(v => v + 1)} title="重新讀取"><RefreshCw size={15} /></Button>
        {res?.data && <span className="text-sm text-stone-500">共 {res.data.total.toLocaleString()} 筆</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></Button>
          <span className="text-sm tabular-nums text-stone-600">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></Button>
        </div>
      </div>
      {res?.error && !loading && <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{res.error}</p>}
      <Table head={['時間', '類型', '結果', '內容']}>
        {!loading && res?.data?.items.map(l => (
          <tr key={l.id} className="align-top hover:bg-stone-50">
            <Td className="whitespace-nowrap font-mono text-xs">{fmtTime(l.time)}</Td>
            <Td className="whitespace-nowrap"><Badge tone={l.kind === 'daily' ? 'blue' : l.kind === 'admin' ? 'amber' : 'stone'}>{KIND_LABEL[l.kind] ?? l.kind}</Badge></Td>
            <Td>{l.ok ? <Badge tone="green">成功</Badge> : <Badge tone="red">失敗</Badge>}</Td>
            <Td className={`text-xs ${l.ok ? 'text-stone-700' : 'text-red-700'}`}>{l.message}</Td>
          </tr>
        ))}
        {(loading || !res?.data?.items.length) && (
          <tr><Td colSpan={4} className="py-8 text-center text-stone-400">{loading ? '載入中…' : '沒有紀錄'}</Td></tr>
        )}
      </Table>
    </>
  );
}
