// ============================================================
// drive.js —— Google Drive 同步后端
// ------------------------------------------------------------
// 用 Google Identity Services（GIS）做浏览器内授权（token 流，无需后端、
// 无需密钥），用 Drive REST API 读写。scope=drive.file：App 只能访问
// 自己创建的文件，碰不到用户网盘里的其他内容（最隐私）。
//
// 策略：本地即时保存（localStorage 当缓存/备份）+ 后台防抖上传到 Drive。
// 这样记录零延迟、不丢数据，也不会因为「边填边存」而狂刷 Drive 接口。
// ============================================================
import { setBackend } from "./storage.js";

const CLIENT_ID = "380572138173-e4vive7th4ugu2nd8oqagu8ut8c4f5hb.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const LOCAL_PREFIX = "health_app_";
const USE_DRIVE_KEY = LOCAL_PREFIX + "use_drive";
// 需要同步的数据集（语言偏好不在内，保持各设备/各人独立）
const COLLECTIONS = ["templates", "strength_sessions", "weight", "diet"];
// App 在用户网盘里自建的专属文件夹，所有数据文件都放里面（不污染顶层）
const APP_FOLDER_NAME = "健康记录App数据";

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let appFolderId = null;      // 专属文件夹的 id（本会话缓存）
const fileIds = {};          // key -> Drive 文件 id（本会话缓存）
let statusListener = null;   // UI 状态回调

export function setStatusListener(fn) { statusListener = fn; }
function setStatus(s) { driveState.status = s; if (statusListener) statusListener(driveState); }

export const driveState = { connected: false, status: "local" };
//  status: local | connecting | syncing | synced | error

// —— 加载 GIS 脚本（仅在需要时）——
function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("无法加载 Google 登录脚本"));
    document.head.appendChild(s);
  });
}

async function ensureTokenClient() {
  await loadGis();
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE, callback: () => {},
    });
  }
}

// 取 access token；prompt='' 静默，prompt='consent' 弹授权窗
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(resp);
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000 - 60000;
      resolve(resp);
    };
    tokenClient.error_callback = (err) => reject(err);
    try { tokenClient.requestAccessToken({ prompt }); } catch (e) { reject(e); }
  });
}

async function ensureFreshToken() {
  if (accessToken && Date.now() < tokenExpiry) return;
  await ensureTokenClient();
  await requestToken(""); // 静默续期
}

// —— Drive REST 封装 ——
async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) { accessToken = null; throw { code: 401 }; }
  return res;
}
// 确保专属文件夹存在（已存在则复用，否则创建），返回其 id
async function ensureAppFolder() {
  if (appFolderId) return appFolderId;
  const q = encodeURIComponent(
    `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`);
  const found = (await res.json()).files?.[0]?.id;
  if (found) { appFolderId = found; return appFolderId; }
  const res2 = await api("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  appFolderId = (await res2.json()).id;
  return appFolderId;
}

// 找同名文件（不限所在文件夹），这样能「收编」之前误建在顶层的旧文件
async function findFileAnywhere(name) {
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const res = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,parents)`);
  return (await res.json()).files?.[0] || null;
}
// 把文件移进专属文件夹（改父文件夹）
async function moveToFolder(fileId, currentParents) {
  const remove = (currentParents || []).join(",");
  const qs = `addParents=${appFolderId}` + (remove ? `&removeParents=${remove}` : "");
  await api(`https://www.googleapis.com/drive/v3/files/${fileId}?${qs}&fields=id`, { method: "PATCH" });
}
// 解析某数据集的文件 id：先用缓存；否则全盘找同名文件，并顺手收编进专属文件夹
async function resolveFileId(key) {
  await ensureAppFolder();
  if (fileIds[key]) return fileIds[key];
  const f = await findFileAnywhere(key + ".json");
  if (!f) return null;
  fileIds[key] = f.id;
  if (!f.parents || !f.parents.includes(appFolderId)) await moveToFolder(f.id, f.parents);
  return f.id;
}
async function downloadFile(id) {
  const res = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return res.ok ? res.json() : null;
}
async function createFile(name, contentObj) {
  const metadata = { name, mimeType: "application/json", parents: [appFolderId] };
  const boundary = "----health" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(contentObj) +
    `\r\n--${boundary}--`;
  const res = await api(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }
  );
  return (await res.json()).id;
}
async function updateFile(id, contentObj) {
  await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contentObj),
  });
}

// —— 防抖上传队列 ——
const pending = {};
const timers = {};
function schedulePush(key, value) {
  pending[key] = value;
  setStatus("syncing");
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => flushKey(key), 1500);
}
async function flushKey(key) {
  if (!(key in pending)) return;
  const value = pending[key];
  delete pending[key];
  try {
    await ensureFreshToken();
    const id = await resolveFileId(key);
    if (id) { await updateFile(id, value); }
    else { fileIds[key] = await createFile(key + ".json", value); }
    if (Object.keys(pending).length === 0) setStatus("synced");
  } catch (e) {
    pending[key] = value; // 失败重新入队，下次保存或续期后再试
    setStatus("error");
  }
}
export async function flushAll() {
  await Promise.all(Object.keys(pending).map(flushKey));
}
window.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
window.addEventListener("beforeunload", () => { flushAll(); });

// —— 后端实现（与 storage.js 的 LocalBackend 接口一致）——
const driveBackend = {
  async load(key) {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  },
  async save(key, value) {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value)); // 即时本地保存
    schedulePush(key, value);                                        // 后台同步到 Drive
  },
};

// —— 首次/每次连接时：把 Drive 与本地对齐 ——
// Drive 有文件 → 拉下来覆盖本地缓存（Drive 为准，支持跨设备）；
// Drive 没有该文件 → 用本地数据在 Drive 新建（首次迁移上传）。
async function syncAll() {
  await ensureAppFolder(); // 先确保专属文件夹存在
  for (const key of COLLECTIONS) {
    const id = await resolveFileId(key); // 会顺便把顶层的旧文件收编进文件夹
    if (id) {
      const content = await downloadFile(id);
      if (content != null) localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(content));
    } else {
      const raw = localStorage.getItem(LOCAL_PREFIX + key);
      const val = raw ? JSON.parse(raw) : [];
      fileIds[key] = await createFile(key + ".json", val);
    }
  }
}

/** 用户点「连接 Google Drive」时调用（interactive=true 会弹授权窗）。 */
export async function connectDrive(interactive = true) {
  setStatus("connecting");
  await ensureTokenClient();
  await requestToken(interactive ? "consent" : "");
  await syncAll();
  setBackend(driveBackend);
  driveState.connected = true;
  localStorage.setItem(USE_DRIVE_KEY, "1");
  setStatus("synced");
}

/** App 启动时：若用户之前已连接，静默恢复 Drive 模式。失败则留在本地。 */
export async function maybeRestoreDrive() {
  if (localStorage.getItem(USE_DRIVE_KEY) !== "1") return false;
  try {
    await connectDrive(false); // 静默
    return true;
  } catch (e) {
    driveState.connected = false;
    setStatus("error"); // 需要用户手动重新连接
    return false;
  }
}

/** 断开（停止同步，回到本地）。不删除任何已上传的数据。 */
export function disconnectDrive() {
  localStorage.removeItem(USE_DRIVE_KEY);
  driveState.connected = false;
  accessToken = null;
  // 切回本地后端
  import("./storage.js").then(({ setBackend }) => setBackend(localBackendFallback));
  setStatus("local");
}
// 断开后用的本地后端（与 storage.js 默认实现一致）
const localBackendFallback = {
  async load(key) { const r = localStorage.getItem(LOCAL_PREFIX + key); return r ? JSON.parse(r) : null; },
  async save(key, value) { localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value)); },
};
