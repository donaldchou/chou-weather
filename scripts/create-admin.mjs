/**
 * 建立（或重設）管理者帳號，存到 ll3 weather.mdb 的 users 表。
 * 沒有註冊頁，第一個管理者用這支建立，其他人由後台新增。
 *
 *   用法（PowerShell）：
 *     $env:ADMIN_PASSWORD = "密碼"; node scripts/create-admin.mjs 你的@email.com; Remove-Item Env:ADMIN_PASSWORD
 *
 * - 讀 .env.local 的 LL3_API_KEY；密碼用 bcrypt 雜湊後才送到 ll3。
 * - 這個 email 已經有帳號就不覆寫；要重設密碼並設成管理者請加 --reset。
 * - 密碼用環境變數傳，不放在指令參數裡，避免留在指令歷史。
 */
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').replace(/^﻿/, '');
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const email = args.find(a => !a.startsWith('--'))?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
const URL_ = process.env.LL3_ADMIN_URL || 'https://www.ll3.com.tw/platform/chou-weather/admin_api.asp';

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('請給管理者 email：node scripts/create-admin.mjs you@example.com'); process.exit(1); }
if (password.length < 8) { console.error('請用環境變數 ADMIN_PASSWORD 傳入密碼（至少 8 個字元）'); process.exit(1); }
if (!process.env.LL3_API_KEY) { console.error('.env.local 沒有 LL3_API_KEY'); process.exit(1); }

async function ll3(action, params = {}) {
  const res = await fetch(URL_, { method: 'POST', body: new URLSearchParams({ key: process.env.LL3_API_KEY, action, ...params }) });
  const j = JSON.parse(await res.text());
  if (!j.ok) throw new Error(`${action}：${j.error}`);
  return j.data;
}

const password_hash = await bcrypt.hash(password, 12);
const existing = await ll3('user_by_email', { email });
if (existing && !reset) {
  console.log(`${email} 已經有帳號（身分：${existing.role}），沒有做任何修改。要重設密碼請加 --reset。`);
} else if (existing) {
  await ll3('user_update', { id: existing.id, password_hash, role: 'admin', active: '1' });
  console.log(`已重設 ${email} 的密碼，並設為管理者。`);
} else {
  const u = await ll3('user_create', { email, password_hash, role: 'admin', name: '' });
  console.log(`已建立管理者帳號 ${u.email}（id ${u.id}）。`);
}
