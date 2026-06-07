// ============================================================
// supabase.js —— Supabase 后端：登录 + 数据同步
// ------------------------------------------------------------
// 替换原来的 Google Drive 方案：
//  · 用 Supabase Auth 做账号登录（登录一次长期保持，解决「无感同步」）。
//  · 数据存在 user_data 表（每行 = 某用户的某集合，data 是整个数组）。
//  · RLS 保证每个人只能读写自己的数据（为多用户隐私隔离打基础）。
//  · 本地优先：先写 localStorage（秒存、离线也能记），再后台同步到云。
// anon key 是给浏览器用的公开钥匙，配合 RLS 才安全，公开无妨。
// ============================================================
import { setBackend } from "./storage.js";

const SUPABASE_URL = "https://nhbguzxoelcvwovuhkps.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oYmd1enhvZWxjdndvdnVoa3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDMyMjYsImV4cCI6MjA5NjQxOTIyNn0.GlePZthbTeY4hReU-YC8AlRimzFxleUFebTKHdf-NxM";
const PROJECT_REF = "nhbguzxoelcvwovuhkps";
const LOCAL_PREFIX = "health_app_";
const COLLECTIONS = ["templates", "strength_sessions", "weight", "diet"];

let sb = null;
let currentUser = null;
let statusListener = null;

export const authState = { user: null, status: "loggedout" };
// status: loggedout | syncing | synced | error
export function setStatusListener(fn) { statusListener = fn; }
function setStatus(s) { authState.status = s; if (statusListener) statusListener(authState); }

export function getUserEmail() { return currentUser?.email || ""; }

// 本地是否已有登录会话（supabase-js 会把会话存在 localStorage）
export function hasStoredSession() {
  return !!localStorage.getItem(`sb-${PROJECT_REF}-auth-token`);
}

// —— 加载 supabase-js 并建客户端 ——
async function getClient() {
  if (sb) return sb;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}

// —— 本地后端（离线/未连云时用，纯 localStorage）——
const localBackend = {
  async load(key) { const r = localStorage.getItem(LOCAL_PREFIX + key); return r ? JSON.parse(r) : null; },
  async save(key, value) { localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value)); },
};
export function useLocalFallback() { setBackend(localBackend); }

// —— 云端后端（本地即时 + 后台同步）——
const supaBackend = {
  async load(key) { const r = localStorage.getItem(LOCAL_PREFIX + key); return r ? JSON.parse(r) : null; },
  async save(key, value) {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value)); // 即时本地
    schedulePush(key, value);                                        // 后台同步云端
  },
};

const pending = {}; const timers = {};
function schedulePush(key, value) {
  pending[key] = value; setStatus("syncing");
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => flushKey(key), 1200);
}
async function flushKey(key) {
  if (!(key in pending)) return;
  const value = pending[key]; delete pending[key];
  try {
    const c = await getClient();
    if (!currentUser) throw new Error("未登录");
    const { error } = await c.from("user_data").upsert(
      { user_id: currentUser.id, collection: key, data: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,collection" }
    );
    if (error) throw error;
    if (Object.keys(pending).length === 0) setStatus("synced");
  } catch (e) {
    pending[key] = value; // 失败重新入队，下次保存或恢复网络后再试
    setStatus("error");
  }
}
export async function flushAll() { await Promise.all(Object.keys(pending).map(flushKey)); }
window.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
window.addEventListener("beforeunload", () => { flushAll(); });

// —— 登录 / 注册 / 退出 ——
export async function signUp(email, password) {
  const c = await getClient();
  const { error } = await c.auth.signUp({ email, password });
  if (error) throw error;
}
export async function signIn(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user; authState.user = currentUser;
}
export async function signOut() {
  try { const c = await getClient(); await c.auth.signOut(); } catch (e) {}
  // 清掉本地数据缓存，避免同一台设备换人登录时串数据
  COLLECTIONS.forEach((k) => localStorage.removeItem(LOCAL_PREFIX + k));
  currentUser = null; authState.user = null; setStatus("loggedout");
}

// —— 登录后初始化：确认会话、拉取数据、切到云后端 ——
export async function initAfterLogin() {
  setStatus("syncing");
  const c = await getClient();
  const { data: { session } } = await c.auth.getSession();
  currentUser = session?.user || null;
  authState.user = currentUser;
  if (!currentUser) throw new Error("会话无效");
  await pullAndMaybeMigrate();
  setBackend(supaBackend);
  setStatus("synced");
}

// 拉取云端数据到本地；首次从 Drive 迁移时把本地旧数据上传一次
async function pullAndMaybeMigrate() {
  const c = await getClient();
  const { data, error } = await c.from("user_data").select("collection,data").eq("user_id", currentUser.id);
  if (error) throw error;
  const byCol = {};
  (data || []).forEach((r) => (byCol[r.collection] = r.data));
  // 仅当这台设备来自旧的 Drive 方案（带 use_drive 标记）才把本地数据迁移上云，
  // 防止别人在你设备上登录时把你的数据上传到他账号。
  const fromDrive = localStorage.getItem(LOCAL_PREFIX + "use_drive") === "1";
  for (const key of COLLECTIONS) {
    if (byCol[key] != null) {
      localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(byCol[key])); // 云端有 → 覆盖本地
    } else if (fromDrive) {
      const r = localStorage.getItem(LOCAL_PREFIX + key);
      const val = r ? JSON.parse(r) : [];
      await c.from("user_data").upsert(
        { user_id: currentUser.id, collection: key, data: val },
        { onConflict: "user_id,collection" }
      ); // 迁移：本地旧数据上传
    } else {
      localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify([])); // 新用户/新设备 → 从零
    }
  }
  if (fromDrive) localStorage.removeItem(LOCAL_PREFIX + "use_drive"); // 迁移完成，去掉标记
}
