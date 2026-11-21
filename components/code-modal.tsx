'use client';
import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { isUnlocked, type CodeResult } from '@/lib/client';
import { Button, Field, Input, Modal } from './admin-ui';

interface CodeAsk {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  /** 解鎖期間也要顯示確認（不用輸入驗證碼） */
  confirm?: boolean;
  message: React.ReactNode;
  /** 檢查驗證碼並執行動作；成功時對話框會自動關閉 */
  submit: (code: string) => Promise<CodeResult>;
  onCancel?: () => void;
}

/** 需要驗證碼才能做的動作：ask(...) 跳出對話框，把 dialog 放進畫面裡（同 chou-platform） */
export function useCodeGate() {
  const [ask, setAsk] = useState<CodeAsk | null>(null);
  const dialog = ask && (
    <CodeModal
      title={ask.title}
      confirmLabel={ask.confirmLabel}
      danger={ask.danger}
      confirm={ask.confirm}
      onClose={() => { ask.onCancel?.(); setAsk(null); }}
      onSubmit={async code => {
        const res = await ask.submit(code);
        if (res.ok) setAsk(null);
        return res;
      }}
    >
      {ask.message}
    </CodeModal>
  );
  return { ask: setAsk, dialog };
}

function CodeModal({ title, confirmLabel, danger = false, confirm = false, onSubmit, onClose, children }: {
  title: string; confirmLabel: string; danger?: boolean; confirm?: boolean;
  onSubmit: (code: string) => Promise<CodeResult>; onClose: () => void; children: React.ReactNode;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 解鎖期間：一般操作直接送出；刪除（或指定 confirm）仍顯示確認但不用輸入。失敗才改回輸入。
  const [skip, setSkip] = useState(isUnlocked);
  const auto = skip && !danger && !confirm;

  const onSubmitRef = useRef(onSubmit);
  const started = useRef(false);
  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    void onSubmitRef.current('').then(res => {
      if (res.ok) return;
      setSkip(false);
      setError(res.error);
    });
  }, [auto]);

  if (auto) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!skip && !code.trim()) return setError('請輸入驗證碼');
    setBusy(true);
    setError('');
    const res = await onSubmit(skip ? '' : code.trim());
    setBusy(false);
    if (!res.ok) { setSkip(false); setError(res.error); setCode(''); }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={<>
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button variant={danger ? 'danger' : 'primary'} type="submit" form="code-form" disabled={busy}>
          {busy ? (skip ? '處理中…' : '驗證中…') : confirmLabel}
        </Button>
      </>}
    >
      <form id="code-form" onSubmit={submit} className="space-y-4">
        <div className={`flex gap-3 rounded-lg p-3 text-sm ${danger ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
          <ShieldAlert size={20} className="shrink-0" />
          <div>{children}</div>
        </div>
        {skip ? (
          <p className="text-sm text-emerald-700">驗證碼已在後台解鎖，這次不需輸入。</p>
        ) : (
          <Field label="請輸入驗證碼" hint={error && <span className="font-medium text-red-600">{error}</span>}>
            <Input type="password" autoFocus autoComplete="off" value={code} onChange={e => { setCode(e.target.value); setError(''); }} />
          </Field>
        )}
      </form>
    </Modal>
  );
}
