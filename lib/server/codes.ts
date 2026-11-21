import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { HttpError } from './api';
import { UNLOCK_COOKIE, verifyUnlock } from './session';

/**
 * 後台的新增／修改／刪除都要驗證碼（環境變數 ADMIN_CODE，同 chou-platform 的做法）。
 * 前端放在 header x-verify-code（encodeURIComponent），或在後台「驗證碼解鎖」後的時數內免輸入。
 */
export type CodeAction = 'create' | 'update' | 'delete';
export const CODE_HEADER = 'x-verify-code';
const ACTION_LABEL: Record<CodeAction, string> = { create: '新增', update: '修改', delete: '刪除' };

function sameCode(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function expectedCode() {
  const code = process.env.ADMIN_CODE;
  if (!code) throw new HttpError(500, '伺服器尚未設定 ADMIN_CODE');
  return code;
}

/** 驗證碼正確、或在解鎖時數內才放行，否則 403 */
export async function assertCode(headers: Headers, userId: string, action: CodeAction) {
  if ((await verifyUnlock((await cookies()).get(UNLOCK_COOKIE)?.value, userId)) !== null) return;
  let code = '';
  try {
    code = decodeURIComponent(headers.get(CODE_HEADER) ?? '');
  } catch {
    // 格式錯誤就當作沒輸入
  }
  if (!sameCode(code, expectedCode())) throw new HttpError(403, `驗證碼錯誤，無法${ACTION_LABEL[action]}`);
}

/** 只比對驗證碼（解鎖、預先檢查用） */
export function assertCodeValue(code: string, action: CodeAction | 'unlock') {
  if (!sameCode(code, expectedCode())) throw new HttpError(403, `驗證碼錯誤，無法${action === 'unlock' ? '解鎖' : ACTION_LABEL[action]}`);
}
