// ============================================================
// main.js —— App 主逻辑：界面渲染 + 交互流程
// 严格按项目文档第 2/3/4/5 节的流程实现。界面文字经 i18n 翻译（日/中）。
// ============================================================
import { Store } from "./storage.js";
import {
  newTemplate, newTemplateExercise, newSet, newSessionExercise, newSession,
  WEIGHT_FIELDS, newWeightEntry, newDietEntry, SET_TYPES,
} from "./models.js";
import { t, getLang, setLang, localeTag } from "./i18n.js";
import * as Auth from "./supabase.js";
import { maybeSeedHandbook, maybeMigrateHandbook } from "./seed.js";
import { INTRO, GROUPS, getExerciseDetail } from "./handbook.js";

// App 版本号（每次部署 bump，方便排查手机上到底加载了哪个版本）
const APP_VERSION = "v28";

// ---------- 小工具 ----------
const $ = (sel, root = document) => root.querySelector(sel);
const appEl = $("#app");
const titleEl = $("#title");
const backBtn = $("#backBtn");
const rightEl = $("#appbarRight");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

// —— SVG 图标（iOS 线条风）——
const ICONS = {
  dumbbell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8v8M3.5 10v4M17.5 8v8M20.5 10v4M6.5 12h11"/></svg>`,
  scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15l3.5-3.6"/></svg>`,
  meal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v6a3 3 0 0 0 3 3M10 3v18M16 3c-1.3 1.6-2 3.9-2 6 0 1.7.8 2.8 2 3.2V21"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>`,
  chevR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="#c4c4c8" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM19 17H6a2 2 0 0 0-2 2"/></svg>`,
};

// 顶栏右侧的语言切换（首页和登录页共用）
function renderLangSwitch() {
  rightEl.innerHTML = `<span class="lang-switch">
    <button data-l="ja" class="${getLang() === "ja" ? "on" : ""}">${t("lang_ja")}</button>
    <button data-l="zh" class="${getLang() === "zh" ? "on" : ""}">${t("lang_zh")}</button>
  </span>`;
  rightEl.querySelectorAll("button").forEach((b) => {
    b.onclick = () => { setLang(b.dataset.l); render(); };
  });
}
function iconTile(name, color) {
  return `<span class="icontile" style="background:${color}">${ICONS[name]}</span>`;
}

let toastTimer;
function toast(msg) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

// ---------- 极简路由（界面栈，支持返回）----------
// 栈里存「标题键」而非翻译好的标题，这样切换语言后标题也会跟着变。
const stack = [];
function navigate(renderFn, titleKey) {
  stack.push({ renderFn, titleKey });
  render();
}
function back() {
  if (stack.length > 1) { stack.pop(); render(); }
}
function reset(renderFn, titleKey) {
  stack.length = 0;
  navigate(renderFn, titleKey);
}
async function render() {
  const top = stack[stack.length - 1];
  titleEl.textContent = t(top.titleKey);
  document.title = t("app_title");
  backBtn.hidden = stack.length <= 1;
  rightEl.innerHTML = "";
  appEl.innerHTML = `<div class="empty">${t("loading")}</div>`;
  await top.renderFn(appEl);
  appEl.scrollTop = 0;
  window.scrollTo(0, 0);
}
backBtn.addEventListener("click", back);

// 组类型显示名（内部值 normal/warmup -> 当前语言）
function setTypeLabel(v) { return t("set_type_" + v); }

// —— 登录页 ——
async function LoginScreen(root) {
  renderLangSwitch();
  let mode = "login"; // login | signup
  function paint() {
    root.innerHTML = `
      <div class="card">
        <h2>${t("login_title")}</h2>
        <label class="field"><span class="lbl">${t("username")}</span>
          <input id="username" type="text" autocomplete="username" placeholder="${t("username_ph")}" /></label>
        <label class="field"><span class="lbl">${t("password")}</span>
          <input id="password" type="password" autocomplete="current-password" placeholder="${t("password_ph")}" /></label>
        <button class="btn" id="submit">${mode === "login" ? t("login_btn") : t("signup_btn")}</button>
        <button class="btn ghost" id="toggle" style="margin-top:10px">${mode === "login" ? t("login_or_signup") : t("have_account")}</button>
        <div class="muted" id="loginMsg" style="font-size:13px;margin-top:12px;min-height:18px"></div>
      </div>`;
    $("#submit", root).onclick = submit;
    $("#toggle", root).onclick = () => { mode = mode === "login" ? "signup" : "login"; paint(); };
  }
  async function submit() {
    const username = $("#username", root).value.trim();
    const pw = $("#password", root).value;
    const msg = $("#loginMsg", root);
    if (!username || !pw) { msg.textContent = t("fill_email_pw"); return; }
    if (pw.length < 6) { msg.textContent = t("pw_too_short"); return; }
    const btn = $("#submit", root); btn.disabled = true; msg.textContent = "…";
    try {
      if (mode === "signup") await Auth.signUp(username, pw);
      await Auth.signIn(username, pw);
      await Auth.initAfterLogin();
      await maybeSeedHandbook(); // 仅聶星辰账号会导入手册模板，其余账号无操作
      await maybeMigrateHandbook(); // 仅聶星辰：把已导入的旧模板内容更新到新版
      routeAfterLogin();
    } catch (e) {
      msg.style.color = "var(--red)";
      msg.textContent = (mode === "signup" ? t("signup_failed") : t("login_failed")) + (e?.message ? "：" + e.message : "");
      btn.disabled = false;
    }
  }
  paint();
}

// 登录成功后按角色分流（管理员 Joe → 管理界面，其余 → 普通首页）
function routeAfterLogin() {
  if (Auth.isAdmin()) reset(AdminScreen, "title_admin");
  else reset(HomeScreen, "title_home");
}

// —— 首页底部的账户区 ——
// 正常同步时不显示任何同步字样（不让朋友意识到数据在上云），只显示用户名；
// 同步出故障时才显示「有故障，请与 Joe 联系」。
function syncStatusText() {
  return Auth.authState.status === "error" ? t("sync_error_user") : "";
}
function accountGroupHtml() {
  const txt = syncStatusText();
  return `
    <div class="group">
      <div class="row" style="cursor:default">
        ${iconTile("user", "var(--brand)")}
        <span class="row-text"><span class="row-title">${esc(Auth.getUsername())}</span>
          <span class="row-sub" id="syncSub" style="color:var(--red)">${txt}</span></span>
      </div>
      <button class="row" id="logout">
        ${iconTile("logout", "#8e8e93")}
        <span class="row-text"><span class="row-title">${t("logout")}</span></span>
        <span class="row-chev">${ICONS.chevR}</span>
      </button>
    </div>
    <div class="ver-line">${t("ver_line", { v: APP_VERSION, n: tplCountLocal() })} · ${Auth.authState.mode}</div>
    ${Auth.authState.mode === "local" ? `<div class="ver-line" style="color:var(--red)">离线原因: ${esc(localStorage.getItem("health_app_init_err") || "?")}</div>` : ""}`;
}
// 本地模板数量（同步读，仅用于账户区诊断显示）
function tplCountLocal() {
  try { return (JSON.parse(localStorage.getItem("health_app_templates") || "[]") || []).length; }
  catch (e) { return "?"; }
}
function wireAccountGroup(root) {
  const btn = $("#logout", root);
  if (btn) btn.onclick = async () => {
    if (!confirm(t("logout_confirm"))) return;
    await Auth.signOut();
    reset(LoginScreen, "title_login");
  };
}

// —— 管理员界面（仅 Joe 登录进入；与普通用户界面完全隔离）——
async function AdminScreen(root) {
  renderLangSwitch();
  root.innerHTML = `<div class="empty">${t("loading")}</div>`;
  let ov;
  try { ov = await Auth.adminFetchOverview(); }
  catch (e) { root.innerHTML = `<div class="empty">${t("admin_load_error")}</div>`; return; }
  let allowed = [];
  try { allowed = await Auth.adminListAllowed(); } catch (e) {}

  const today = todayStr();
  const users = Object.entries(ov.profiles).map(([uid, p]) => ({
    uid, username: p.username || "(?)", last_login: p.last_login || "",
  }));
  const todays = users
    .filter((u) => u.last_login.slice(0, 10) === today)
    .sort((a, b) => b.last_login.localeCompare(a.last_login));

  const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const cardFor = (u) => {
    const sess = (ov.sessions[u.uid] || []).filter((s) => (s.timestamp || "").slice(0, 10) === today && s.status === "done");
    let trained;
    if (sess.length === 0) trained = `<div class="meta">${t("admin_no_training")}</div>`;
    else trained = sess.map((s) => {
      const done = s.exercises.filter((e) => e.status === "completed");
      const names = done.map((e) => esc(e.exercise_name)).join("、");
      return `<div class="meta"><b>${esc(s.workout_day_template)}</b> · ${t("completed_n_of_m", { done: done.length, total: s.exercises.length })}${names ? "：" + names : ""}</div>`;
    }).join("");
    return `<div class="card">
      <div class="name" style="font-size:17px;font-weight:600">${esc(u.username)} <span class="tag">${t("admin_login_at", { time: hhmm(u.last_login) })}</span></div>
      <div style="margin-top:6px">${trained}</div>
    </div>`;
  };

  const allowedListHtml = (arr) => arr.length
    ? arr.map((n) => `<div class="listitem" style="margin:0 0 8px"><div class="grow"><div class="name">${esc(n)}</div></div><button class="btn danger small" data-rm="${esc(n)}">✕</button></div>`).join("")
    : `<div class="muted" style="font-size:13px">${t("invite_empty")}</div>`;

  root.innerHTML = `
    <div class="section-title">${t("admin_title")} · ${t("admin_today_count", { n: todays.length })}（${t("admin_all_users", { n: users.length })}）</div>
    ${todays.length ? todays.map(cardFor).join("") : `<div class="empty">${t("admin_no_login")}</div>`}

    <div class="section-title">${t("invite_section")}</div>
    <div class="card">
      <p class="muted" style="font-size:13px;margin-top:0">${t("invite_hint")}</p>
      <div class="inline" style="margin-bottom:12px">
        <input id="inviteName" placeholder="${t("invite_ph")}" />
        <button class="btn small" id="inviteBtn" style="flex:0 0 auto">${t("invite_btn")}</button>
      </div>
      <div id="allowedList">${allowedListHtml(allowed)}</div>
    </div>

    <div class="btn-row"><button class="btn secondary" id="refresh">${t("admin_refresh")}</button></div>
    <button class="btn danger small" id="alogout" style="width:100%;margin-top:12px">${t("logout")}</button>
  `;

  async function reloadAllowed() {
    try { allowed = await Auth.adminListAllowed(); } catch (e) {}
    $("#allowedList", root).innerHTML = allowedListHtml(allowed);
  }
  $("#inviteBtn", root).onclick = async () => {
    const name = $("#inviteName", root).value.trim();
    if (!name) return;
    try { await Auth.adminAddAllowed(name); toast(t("invite_added", { name })); $("#inviteName", root).value = ""; await reloadAllowed(); }
    catch (e) { toast(t("invite_fail")); }
  };
  $("#allowedList", root).addEventListener("click", async (e) => {
    const n = e.target.dataset.rm;
    if (n == null) return;
    if (!confirm(t("invite_remove_confirm", { name: n }))) return;
    try { await Auth.adminRemoveAllowed(n); await reloadAllowed(); } catch (err) {}
  });
  $("#refresh", root).onclick = () => render();
  $("#alogout", root).onclick = async () => {
    if (!confirm(t("logout_confirm"))) return;
    await Auth.signOut();
    reset(LoginScreen, "title_login");
  };
}

// ============================================================
// 首页 / 今日概览（文档第 2 节）
// ============================================================
// ---------- 首页月历 ----------
// 视图月份（模块级，切换上/下月时保留）；null = 当前月
let calView = null;

function pad2(n) { return String(n).padStart(2, "0"); }
function ymdKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

// —— 训练日边界：以凌晨 3 点为界（27 点制）——
// 把时间往前推 3 小时再取日期：凌晨 0~3 点算「前一天」的训练日。
const TRAIN_CUTOFF_MS = 3 * 3600 * 1000;
function trainingDateKey(ts) {
  const d = new Date(new Date(ts).getTime() - TRAIN_CUTOFF_MS);
  return ymdKey(d.getFullYear(), d.getMonth(), d.getDate());
}
// 这次训练里「实际记录并保存过数据」= 有一组填了重量/次数，或游泳填了米数/时长
function sessionHasData(s) {
  if (s.swim && (s.swim.meters || s.swim.minutes)) return true;
  return (s.exercises || []).some((e) => (e.sets || []).some((st) =>
    (st.weight !== "" && st.weight != null) || (st.reps !== "" && st.reps != null)));
}
// 收尾：把已过「训练日窗口（次日凌晨3点）」的进行中会话处理掉——
//   有数据 → 标记为完成（当作练完，不管有没有点"完成本次训练"）；
//   纯空的 → 当作误点/演示，删除。返回处理后的会话数组。
async function reconcileSessions(sessions) {
  const nowKey = trainingDateKey(Date.now());
  let changed = false;
  const kept = [];
  for (const s of sessions) {
    if (s.status === "in_progress" && trainingDateKey(s.timestamp) !== nowKey) {
      if (sessionHasData(s)) { s.status = "done"; kept.push(s); changed = true; }
      else changed = true; // 丢弃空会话
    } else {
      kept.push(s);
    }
  }
  if (changed) await Store.saveCollection("strength_sessions", kept);
  return kept;
}

// 从记录里建：每天体重、每天训练的 A/B(/C)
function buildDayMaps(weights, sessions) {
  const wt = {};      // ymd -> "96.1"（当天最后一条）
  for (const w of weights) {
    if (!w.timestamp) continue;
    if (w.weight === "" || w.weight == null) continue;
    wt[w.timestamp.slice(0, 10)] = String(w.weight);
  }
  // 盖章：只算「记录并保存过数据」的训练；归属到训练日（凌晨3点为界）
  const letter = {};  // trainingDateKey -> 'A' | 'B' | 'C'
  for (const s of sessions) {
    if (!s.timestamp || !sessionHasData(s)) continue;
    const m = (s.workout_day_template || "").match(/Day\s*([A-Za-z])/);
    if (m) letter[trainingDateKey(s.timestamp)] = m[1].toUpperCase();
  }
  return { wt, letter };
}

// 印章：外圈 + 大写字母；A=红 B=蓝（其余=绿，暂给 C 用，日后 C 移除）。
// 淡墨 + 断墨效果：feTurbulence 生成噪声当作 alpha 蒙版，抠掉一部分 → 像没吸饱墨的章。
const STAMP_COLORS = { A: "#c1272d", B: "#1c5bb0", C: "#2e7d46", D: "#1c1c1e" }; // A红 B蓝 C绿 D黑
function stampSvg(letter, dayNum) {
  const color = STAMP_COLORS[letter] || "#8e5aa8";
  const rot = ((dayNum * 37) % 21) - 10;      // -10~10 度，每天略不同
  const seed = (dayNum * 13) % 100;
  const fid = `stmp${letter}${dayNum}`;
  return `<svg class="cal-stamp" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="${seed}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 11 -4.7" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in"/>
    </filter></defs>
    <g filter="url(#${fid})" transform="rotate(${rot} 22 22)" fill="none" stroke="${color}" opacity="0.5">
      <circle cx="22" cy="22" r="16" stroke-width="2.4"/>
      <text x="22" y="29.5" text-anchor="middle" font-size="21" font-weight="800" fill="${color}" stroke="none"
        font-family="-apple-system,Arial,sans-serif">${letter}</text>
    </g>
  </svg>`;
}

function calWeekHeads() {
  return getLang() === "ja"
    ? ["日", "月", "火", "水", "木", "金", "土"]
    : ["日", "一", "二", "三", "四", "五", "六"];
}

function calendarCardHtml(weights, sessions) {
  const now = new Date();
  const view = calView || { y: now.getFullYear(), m: now.getMonth() };
  calView = view;
  const { wt, letter } = buildDayMaps(weights, sessions);
  const startDow = new Date(view.y, view.m, 1).getDay();          // 0=周日
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const todayKey = ymdKey(now.getFullYear(), now.getMonth(), now.getDate());

  const heads = calWeekHeads().map((h) => `<div class="cal-h">${h}</div>`).join("");
  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = ymdKey(view.y, view.m, d);
    const w = wt[key], L = letter[key];
    cells += `<div class="cal-cell${L ? " cal-clickable" : ""}"${L ? ` data-report="${key}"` : ""}>
      <div class="cal-num${key === todayKey ? " today" : ""}">${d}</div>
      ${w != null ? `<div class="cal-wt">${esc(w)}<span class="cal-kg">kg</span></div>` : ""}
      ${L ? stampSvg(L, d) : ""}
    </div>`;
  }
  const title = new Date(view.y, view.m, 1).toLocaleDateString(localeTag(), { year: "numeric", month: "long" });
  return `<div class="card cal-card">
    <div class="cal-head">
      <button class="cal-nav" id="calPrev" aria-label="prev">‹</button>
      <div class="cal-title">${title}</div>
      <button class="cal-nav" id="calNext" aria-label="next">›</button>
    </div>
    <div class="cal-grid cal-heads">${heads}</div>
    <div class="cal-grid cal-days">${cells}</div>
  </div>`;
}

async function HomeScreen(root) {
  const [rawSessions, weights] = await Promise.all([
    Store.getCollection("strength_sessions"),
    Store.getCollection("weight"),
  ]);
  // 先收尾过期的进行中会话（次日凌晨3点后自动完成/清理空会话）
  const sessions = await reconcileSessions(rawSessions);
  // "继续未完成的训练"只在【本训练日内、且已记录并保存过数据】时出现
  const inProgress = sessions.find((s) => s.status === "in_progress" && sessionHasData(s));

  const row = (id, icon, color, title, sub) => `
    <button class="row" id="${id}">${iconTile(icon, color)}
      <span class="row-text"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>
      <span class="row-chev">${ICONS.chevR}</span></button>`;

  root.innerHTML = `
    ${calendarCardHtml(weights, sessions)}

    ${inProgress ? `<div class="group">${row("resume", "dumbbell", "var(--brand)", t("resume_title"), t("resume_sub", { name: esc(inProgress.workout_day_template) }))}</div>` : ""}

    <div class="section-title">${t("section_record")}</div>
    <div class="group">
      ${row("toStrength", "dumbbell", "var(--amber)", t("home_strength"), t("home_strength_sub"))}
      ${row("toWeight", "scale", "var(--brand)", t("home_weight"), t("home_weight_sub"))}
      ${row("toDiet", "meal", "var(--green)", t("home_diet"), t("home_diet_sub"))}
    </div>

    <div class="section-title">${t("section_history")}</div>
    <div class="group">
      ${row("toHistory", "chart", "var(--purple)", t("home_history"), t("home_history_sub"))}
    </div>

    <div class="section-title">${t("account_section")}</div>
    ${accountGroupHtml()}
  `;

  renderLangSwitch();

  // 月历上/下月切换
  $("#calPrev", root).onclick = () => {
    const v = calView;
    calView = v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 };
    render();
  };
  $("#calNext", root).onclick = () => {
    const v = calView;
    calView = v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 };
    render();
  };
  // 点日历上盖章的日子 → 看当天完整训练内容
  root.querySelectorAll(".cal-clickable").forEach((el) => {
    el.onclick = () => navigate((r) => DayReportScreen(r, el.dataset.report), "title_day_report");
  });

  $("#toStrength", root).onclick = () => navigate(StrengthPickScreen, "title_pick");
  $("#toWeight", root).onclick = () => navigate(WeightScreen, "title_weight");
  $("#toDiet", root).onclick = () => navigate(DietScreen, "title_diet");
  $("#toHistory", root).onclick = () => navigate(HistoryScreen, "title_history");
  if (inProgress) $("#resume", root).onclick = () => openSession(inProgress.id);
  wireAccountGroup(root);
}

// ============================================================
// 力量训练（文档第 3 节）
// ============================================================

// —— 选择今天练哪个训练日模板 ——
async function StrengthPickScreen(root) {
  const templates = await Store.getCollection("templates");
  rightEl.innerHTML = `<button class="appbar-action" id="manage">${t("manage_templates")}</button>`;
  $("#manage").onclick = () => navigate(TemplateListScreen, "title_templates");

  if (templates.length === 0) {
    root.innerHTML = `
      <div class="card center">
        <p class="muted">${t("no_templates_p")}</p>
        <button class="btn" id="create">${t("create_first")}</button>
      </div>`;
    $("#create", root).onclick = () => navigate((r) => TemplateEditScreen(r, null), "title_new_template");
    return;
  }

  root.innerHTML = `
    <div class="listitem hb-entry" id="hbEntry">
      ${iconTile("book", "#ff9500")}
      <div class="grow"><div class="name">${t("handbook_entry")}</div></div><span class="chev muted">›</span>
    </div>
    <div class="muted" style="margin:0 4px 12px">${t("pick_prompt")}</div>` +
    templates.map((tpl) => `
      <div class="listitem" data-id="${tpl.id}">
        <div class="grow"><div class="name">${esc(tpl.name)}</div>
          <div class="meta">${t("n_exercises", { n: tpl.exercises.length })} · ${esc(tpl.exercises.map(e => e.exercise_name).slice(0, 3).join("、"))}${tpl.exercises.length > 3 ? "…" : ""}</div>
        </div><span class="chev muted">›</span>
      </div>`).join("");

  $("#hbEntry", root).onclick = () => navigate(HandbookScreen, "title_handbook");
  root.querySelectorAll(".listitem[data-id]").forEach((el) => {
    el.onclick = () => {
      const tpl = templates.find((x) => x.id === el.dataset.id);
      if (tpl && tpl.kind === "swim") navigate((r) => SwimmingScreen(r, tpl.name), "title_swim");
      else startSession(el.dataset.id);
    };
  });
}

// —— 游泳记录：只填米数 + 用时，保存即完成 ——
async function SwimmingScreen(root, templateName) {
  root.innerHTML = `
    <div class="card">
      <h2>${esc(templateName)}</h2>
      <label class="field"><span class="lbl">${t("swim_meters")}</span>
        <input id="swimM" type="number" inputmode="numeric" min="0" placeholder="${t("swim_meters_ph")}" /></label>
      <label class="field"><span class="lbl">${t("swim_minutes")}</span>
        <input id="swimMin" type="number" inputmode="numeric" min="0" placeholder="${t("swim_minutes_ph")}" /></label>
      <button class="btn" id="swimSave">${t("save")}</button>
    </div>`;
  $("#swimSave", root).onclick = async () => {
    const meters = $("#swimM", root).value.trim();
    const minutes = $("#swimMin", root).value.trim();
    if (!meters && !minutes) { toast(t("swim_empty")); return; }
    const nowIso = new Date().toISOString();
    const session = newSession(templateName);
    session.status = "done";
    session.finished_at = nowIso;      // 游泳也是训练：重置饮食计时、日历盖章
    session.swim = { meters, minutes };
    const sessions = await Store.getCollection("strength_sessions");
    sessions.push(session);
    await Store.saveCollection("strength_sessions", sessions);
    toast(t("recorded"));
    reset(HomeScreen, "title_home");
  };
}

// —— 当天训练汇报：点日历盖章日 → 看那一整天的所有训练内容 ——
async function DayReportScreen(root, dateKey) {
  const sessions = (await Store.getCollection("strength_sessions"))
    .filter((s) => s.timestamp && sessionHasData(s) && trainingDateKey(s.timestamp) === dateKey)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const sessionHtml = (s) => {
    if (s.swim) {
      return `<div class="card">
        <h2 style="margin:0 0 6px">${esc(s.workout_day_template)}</h2>
        <div class="muted" style="font-size:13px;margin-bottom:8px">${fmtDate(s.timestamp)}</div>
        <div class="dr-swim">${t("swim_summary", { m: esc(s.swim.meters || "-"), min: esc(s.swim.minutes || "-") })}</div>
      </div>`;
    }
    const exs = (s.exercises || []).filter((e) => (e.sets || []).some((x) => x.weight !== "" || x.reps !== ""));
    return `<div class="card">
      <h2 style="margin:0 0 6px">${esc(s.workout_day_template)}</h2>
      <div class="muted" style="font-size:13px;margin-bottom:6px">${fmtDate(s.timestamp)}</div>
      ${exs.length ? exs.map((e) => {
        const sets = (e.sets || []).filter((x) => x.weight !== "" || x.reps !== "");
        return `<div class="dr-ex">
          <div class="dr-exname">${esc(e.exercise_name)}${e.target_muscle ? ` <span class="tag">${esc(e.target_muscle)}</span>` : ""}</div>
          <table class="hist-table"><thead><tr><th>${t("col_set")}</th><th>${t("col_weight")}</th><th>${t("col_reps")}</th><th>RIR</th></tr></thead>
          <tbody>${sets.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.weight || "-")}</td><td>${esc(x.reps || "-")}</td><td>${esc(x.rpe_rir || "-")}</td></tr>`).join("")}</tbody></table>
        </div>`;
      }).join("") : `<div class="muted">${t("day_report_no_ex")}</div>`}
    </div>`;
  };

  const [yy, mm, dd] = dateKey.split("-").map(Number);
  const dateLabel = cnDateFull(new Date(yy, mm - 1, dd));
  root.innerHTML = `
    <div class="section-title">${t("day_report_title", { date: dateLabel })}</div>
    ${sessions.length ? sessions.map(sessionHtml).join("") : `<div class="empty">${t("day_report_empty")}</div>`}
  `;
}

// —— 手册总览：原理综述 + 全部动作详解入口 ——
async function HandbookScreen(root) {
  const introHtml = INTRO.map((s) => `
    <div class="group hb-card">
      <h3 class="hb-h">${s.title}</h3>
      <div class="hb-body">${s.html}</div>
    </div>`).join("");

  const groupsHtml = GROUPS.map((g) => `
    <div class="section-title">${esc(g.title)}</div>
    ${g.keys.map((key) => {
      const d = getExerciseDetail(key);
      if (!d) return "";
      return `<div class="listitem hb-ex" data-key="${esc(key)}">
        <div class="grow"><div class="name">${esc(d.names.zh)}${d.star ? " ⭐" : ""}</div>
          <div class="meta">${esc(d.names.ja)} · ${esc(d.names.en)}</div></div>
        <span class="chev muted">›</span>
      </div>`;
    }).join("")}`).join("");

  root.innerHTML = introHtml +
    `<div class="section-title" style="margin-top:8px">${t("hb_exercises")}</div>` + groupsHtml;

  root.querySelectorAll(".hb-ex").forEach((el) => {
    el.onclick = () => navigate((r) => HandbookExerciseScreen(r, el.dataset.key), "title_handbook");
  });
}

// —— 单个动作详解 ——
async function HandbookExerciseScreen(root, key) {
  const d = getExerciseDetail(key);
  if (!d) { root.innerHTML = `<div class="empty">${esc(key)}</div>`; return; }

  const block = (label, body) => body
    ? `<div class="hb-block"><div class="hb-label">${label}</div><div class="hb-text">${body}</div></div>` : "";
  const list = (label, arr) => (arr && arr.length)
    ? `<div class="hb-block"><div class="hb-label">${label}</div><ol class="hb-list">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>` : "";
  const ul = (label, arr) => (arr && arr.length)
    ? `<div class="hb-block"><div class="hb-label">${label}</div><ul class="hb-list">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";

  root.innerHTML = `
    <div class="group hb-card">
      <h2 class="hb-title">${esc(d.names.zh)}${d.star ? " ⭐" : ""}</h2>
      <div class="hb-sub">${esc(d.names.ja)} ・ ${esc(d.names.en)}</div>
      ${block(t("hb_feel"), esc(d.feel))}
      ${block(t("hb_breathing"), esc(d.breathing))}
      ${ul(t("hb_mistakes"), d.mistakes)}
      <a class="btn hb-video" href="${esc(d.video)}" target="_blank" rel="noopener noreferrer">${t("handbook_video")}</a>
    </div>`;
}

// —— 从模板开新的一次训练，立即存档（防丢），再进入清单 ——
async function startSession(templateId) {
  const templates = await Store.getCollection("templates");
  const tpl = templates.find((x) => x.id === templateId);
  if (!tpl) return;
  const session = newSession(tpl.name);
  session.exercises = tpl.exercises.map((e) => {
    const ex = newSessionExercise(e.exercise_name, e.target_muscle);
    ex.equipment_type = e.equipment_type || "";
    ex.target_sets = e.target_sets || 0;
    ex.rep_hint = e.rep_hint || "";
    return ex;
  });
  const sessions = await Store.getCollection("strength_sessions");
  sessions.push(session);
  await Store.saveCollection("strength_sessions", sessions);
  openSession(session.id);
}

async function getSession(id) {
  const sessions = await Store.getCollection("strength_sessions");
  return sessions.find((s) => s.id === id);
}
async function saveSession(session) {
  const sessions = await Store.getCollection("strength_sessions");
  const i = sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) sessions[i] = session; else sessions.push(session);
  await Store.saveCollection("strength_sessions", sessions);
}

function openSession(id) {
  navigate((root) => SessionChecklistScreen(root, id), "title_session");
}

// —— 动作清单（总览，文档 3.2 第 2 步）——
async function SessionChecklistScreen(root, sessionId) {
  const session = await getSession(sessionId);
  if (!session) { root.innerHTML = `<div class="empty">${t("not_found_session")}</div>`; return; }

  const badge = (st) => st === "completed"
    ? `<span class="badge done">${t("badge_done")}</span>`
    : st === "skipped" ? `<span class="badge skipped">${t("badge_skipped")}</span>`
    : `<span class="badge todo">${t("badge_todo")}</span>`;

  root.innerHTML = `
    <div class="card">
      <h2>${esc(session.workout_day_template)}</h2>
      <div class="muted">${fmtDate(session.timestamp)}</div>
    </div>
    <div id="exlist">
      ${session.exercises.map((ex, i) => `
        <div class="listitem" data-i="${i}">
          <div class="grow"><div class="name">${esc(ex.exercise_name)}</div>
            <div class="meta">${esc(ex.target_muscle || "")}${ex.sets.length ? " · " + t("n_sets", { n: ex.sets.filter(s => s.set_type === "normal").length }) : ""}</div>
          </div>${badge(ex.status)}
        </div>`).join("")}
    </div>
    <button class="btn ghost" id="addEx" style="margin-top:6px">${t("add_temp_ex")}</button>
    <div class="btn-row">
      <button class="btn" id="finish">${t("finish_session")}</button>
    </div>
    <button class="btn danger small" id="discard" style="margin-top:10px;width:100%">${t("discard_session")}</button>
  `;

  root.querySelectorAll("#exlist .listitem").forEach((el) => {
    el.onclick = () => navigate((r) => ExerciseRecordScreen(r, sessionId, +el.dataset.i), "title_record_ex");
  });
  $("#addEx", root).onclick = () => navigate((r) => AddExerciseScreen(r, sessionId), "title_add_ex");
  $("#finish", root).onclick = async () => {
    session.status = "done";
    session.finished_at = new Date().toISOString(); // 饮食记录的正计时以此为起点
    await saveSession(session);
    toast(t("session_saved"));
    reset(HomeScreen, "title_home");
  };
  $("#discard", root).onclick = async () => {
    if (!confirm(t("confirm_discard"))) return;
    const sessions = (await Store.getCollection("strength_sessions")).filter((s) => s.id !== sessionId);
    await Store.saveCollection("strength_sessions", sessions);
    reset(HomeScreen, "title_home");
  };
}

// —— 找某个动作的「上次记录」（文档 3.2 第 4 步）——
async function findLastRecord(exerciseName, excludeSessionId) {
  const sessions = (await Store.getCollection("strength_sessions"))
    .filter((s) => s.id !== excludeSessionId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.exercise_name === exerciseName && e.sets.length);
    if (ex) {
      const formal = ex.sets.filter((x) => x.set_type === "normal" && (x.weight !== "" || x.reps !== ""));
      const use = formal.length ? formal : ex.sets;
      return { date: s.timestamp, sets: use, nextWeight: ex.next_start_weight || "" };
    }
  }
  return null;
}

// 找某个动作「上次自己给下次定的起始重量」（可能与上次有成绩记录的那次不同）
async function findLastSuggestedWeight(exerciseName, excludeSessionId) {
  const sessions = (await Store.getCollection("strength_sessions"))
    .filter((s) => s.id !== excludeSessionId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.exercise_name === exerciseName && e.next_start_weight);
    if (ex) return ex.next_start_weight;
  }
  return "";
}

// —— 单个动作的记录界面（文档 3.2 第 3-6 步）——
async function ExerciseRecordScreen(root, sessionId, exIndex) {
  const session = await getSession(sessionId);
  const ex = session.exercises[exIndex];
  const suggested = await findLastSuggestedWeight(ex.exercise_name, sessionId);

  const topHint = `
    ${(ex.target_sets || ex.rep_hint) ? `<div class="rec-hint">🎯 ${t("target_volume", { sets: ex.target_sets || "?", reps: ex.rep_hint || "?" })}</div>` : ""}
    ${suggested ? `<div class="rec-hint suggest">💡 ${t("last_suggest_weight", { w: esc(suggested) })}</div>` : ""}
    <button class="btn ghost small" id="histBtn" style="width:100%;margin:2px 0 10px">${t("view_ex_history")}</button>`;

  if (ex.sets.length === 0) ex.sets.push(newSet());

  function setRowsHtml() {
    return ex.sets.map((s, i) => {
      const isWarmup = s.set_type === "warmup";
      return `
      <div class="setrow" data-i="${i}">
        <div class="idx">${i + 1}</div>
        <input type="number" inputmode="decimal" min="0" placeholder="${t("ph_kg")}" value="${esc(s.weight)}" data-f="weight" />
        <input type="number" inputmode="numeric" min="0" placeholder="${t("ph_reps")}" value="${esc(s.reps)}" data-f="reps" />
        <input type="number" inputmode="numeric" min="0" placeholder="${isWarmup ? "—" : "RIR"}" value="${isWarmup ? "" : esc(s.rpe_rir)}" data-f="rpe_rir" title="${t("rir_title")}" ${isWarmup ? "disabled" : ""} />
        <select data-f="set_type">${SET_TYPES.map((v) => `<option value="${v}" ${s.set_type === v ? "selected" : ""}>${setTypeLabel(v)}</option>`).join("")}</select>
      </div>
      <div class="setrow" style="grid-template-columns:24px 1fr;margin-top:-4px">
        <div></div><button class="del" data-del="${i}" style="text-align:left">${t("delete_set")}</button>
      </div>`;
    }).join("");
  }

  const detail = getExerciseDetail(ex.exercise_name);
  const nameHtml = detail
    ? `<button class="hb-namelink" id="hbName" title="${t("handbook_tap")}">${esc(ex.exercise_name)} ${ICONS.book}</button>`
    : esc(ex.exercise_name);

  root.innerHTML = `
    <div class="card">
      <h2>${nameHtml} ${ex.target_muscle ? `<span class="tag">${esc(ex.target_muscle)}</span>` : ""}</h2>
      ${detail ? `<div class="hb-namehint muted">${t("handbook_tap")}</div>` : ""}
      ${topHint}
      <div class="set-head"><div></div><div>${t("col_weight")}</div><div>${t("col_reps")}</div><div>${t("col_rir")}</div><div>${t("col_type")}</div></div>
      <div id="sets">${setRowsHtml()}</div>
      <button class="btn secondary small" id="addSet">${t("add_set")}</button>
      <div class="muted" style="font-size:12px;margin-top:10px">${t("rir_hint")}</div>
    </div>
    <label class="field card" style="display:block">
      <span class="lbl">${t("note_label")}</span>
      <textarea id="note" placeholder="${t("note_ph")}">${esc(ex.note)}</textarea>
    </label>
    <label class="field card" style="display:block">
      <span class="lbl">${t("next_weight_label")}</span>
      <input type="number" inputmode="decimal" min="0" id="nextW" placeholder="${t("next_weight_ph")}" value="${esc(ex.next_start_weight || "")}" />
      <div class="muted" style="font-size:12px;margin-top:6px">${t("next_weight_hint")}</div>
    </label>
    <div class="btn-row">
      <button class="btn secondary" id="skip">${t("skip_ex")}</button>
      <button class="btn" id="done">${t("done_ex")}</button>
    </div>
  `;

  const setsEl = $("#sets", root);
  setsEl.addEventListener("input", async (e) => {
    const row = e.target.closest(".setrow");
    if (!row) return;
    const i = +row.dataset.i, f = e.target.dataset.f;
    if (!f) return;
    if (f === "set_type") {
      ex.sets[i].set_type = e.target.value;
      if (e.target.value === "warmup") ex.sets[i].rpe_rir = ""; // 热身组不记 RIR
      await saveSession(session);
      setsEl.innerHTML = setRowsHtml(); // 重画一行，让 RIR 立刻灰掉/恢复
      return;
    }
    ex.sets[i][f] = e.target.value;
    await saveSession(session);
  });
  setsEl.addEventListener("click", async (e) => {
    const del = e.target.dataset.del;
    if (del != null) {
      ex.sets.splice(+del, 1);
      if (ex.sets.length === 0) ex.sets.push(newSet());
      await saveSession(session);
      setsEl.innerHTML = setRowsHtml();
    }
  });
  $("#addSet", root).onclick = async () => {
    const prev = ex.sets[ex.sets.length - 1] || {};
    ex.sets.push(newSet({ weight: prev.weight, set_type: prev.set_type }));
    await saveSession(session);
    setsEl.innerHTML = setRowsHtml();
  };
  $("#note", root).addEventListener("input", async (e) => {
    ex.note = e.target.value; await saveSession(session);
  });
  $("#nextW", root).addEventListener("input", async (e) => {
    ex.next_start_weight = e.target.value; await saveSession(session);
  });
  $("#histBtn", root).onclick = () =>
    navigate((r) => ExerciseHistoryScreen(r, ex.exercise_name, sessionId), "title_ex_history");
  if (detail) $("#hbName", root).onclick = () =>
    navigate((r) => HandbookExerciseScreen(r, ex.exercise_name), "title_handbook");
  $("#done", root).onclick = async () => {
    ex.status = "completed"; await saveSession(session); toast(t("recorded")); back();
  };
  $("#skip", root).onclick = async () => {
    ex.status = "skipped"; await saveSession(session); toast(t("marked_skip")); back();
  };
}

// —— 某个动作的历史记录（折叠式：折叠只看日期时间，展开看每组表现）——
async function ExerciseHistoryScreen(root, exerciseName, excludeSessionId) {
  const sessions = (await Store.getCollection("strength_sessions"))
    .filter((s) => s.id !== excludeSessionId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const entries = [];
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.exercise_name === exerciseName);
    if (!ex) continue;
    const sets = (ex.sets || []).filter((x) => x.weight !== "" || x.reps !== "");
    if (!sets.length) continue;
    entries.push({ ts: s.timestamp, sets });
  }
  root.innerHTML = `
    <div class="card"><h2 style="margin:0">${esc(exerciseName)}</h2>
      <div class="muted" style="font-size:13px">${t("ex_history_sub", { n: entries.length })}</div></div>
    ${entries.length ? entries.map((en) => `
      <details class="hist-item">
        <summary class="hist-sum"><span>${fmtDate(en.ts)}</span><span class="hist-arrow">${ICONS.chevR}</span></summary>
        <table class="hist-table">
          <thead><tr><th>${t("col_set")}</th><th>${t("col_weight")}</th><th>${t("col_reps")}</th><th>RIR</th></tr></thead>
          <tbody>${en.sets.map((st, i) => `<tr><td>${i + 1}</td><td>${esc(st.weight || "-")}</td><td>${esc(st.reps || "-")}</td><td>${esc(st.rpe_rir || "-")}</td></tr>`).join("")}</tbody>
        </table>
      </details>`).join("") : `<div class="empty">${t("no_history")}</div>`}
  `;
}

// —— 临时添加菜单外动作（文档 3.3）——
async function AddExerciseScreen(root, sessionId) {
  const templates = await Store.getCollection("templates");
  const sessions = await Store.getCollection("strength_sessions");
  const lib = new Map();
  templates.forEach((tpl) => tpl.exercises.forEach((e) => lib.set(e.exercise_name, e.target_muscle)));
  sessions.forEach((s) => s.exercises.forEach((e) => { if (!lib.has(e.exercise_name)) lib.set(e.exercise_name, e.target_muscle); }));
  const libArr = [...lib.entries()];

  root.innerHTML = `
    <div class="card">
      <h2>${t("new_exercise")}</h2>
      <label class="field"><span class="lbl">${t("ex_name")}</span><input id="nm" placeholder="${t("ex_name_ph")}" /></label>
      <label class="field"><span class="lbl">${t("target_muscle_opt")}</span><input id="mu" placeholder="${t("muscle_ph2")}" /></label>
      <button class="btn" id="addNew">${t("add_to_session")}</button>
    </div>
    ${libArr.length ? `<div class="section-title">${t("or_pick_done")}</div>
      ${libArr.map(([n, m]) => `<div class="listitem" data-n="${esc(n)}" data-m="${esc(m || "")}">
        <div class="grow"><div class="name">${esc(n)}</div><div class="meta">${esc(m || "")}</div></div><span class="chev muted">＋</span></div>`).join("")}` : ""}
  `;

  async function add(name, muscle) {
    if (!name.trim()) { toast(t("fill_ex_name")); return; }
    const session = await getSession(sessionId);
    session.exercises.push(newSessionExercise(name.trim(), muscle.trim()));
    await saveSession(session);
    toast(t("added"));
    back();
  }
  $("#addNew", root).onclick = () => add($("#nm", root).value, $("#mu", root).value);
  root.querySelectorAll(".listitem").forEach((el) => {
    el.onclick = () => add(el.dataset.n, el.dataset.m);
  });
}

// —— 模板管理：列表 ——
async function TemplateListScreen(root) {
  const templates = await Store.getCollection("templates");
  rightEl.innerHTML = `<button class="appbar-action" id="new">${t("new_btn")}</button>`;
  $("#new").onclick = () => navigate((r) => TemplateEditScreen(r, null), "title_new_template");

  root.innerHTML = templates.length ? templates.map((tpl) => `
    <div class="listitem" data-id="${tpl.id}">
      <div class="grow"><div class="name">${esc(tpl.name)}</div>
        <div class="meta">${t("n_exercises", { n: tpl.exercises.length })}</div></div><span class="chev muted">${t("edit_arrow")}</span>
    </div>`).join("") : `<div class="empty">${t("no_templates_short")}</div>`;

  root.querySelectorAll(".listitem").forEach((el) => {
    el.onclick = () => navigate((r) => TemplateEditScreen(r, el.dataset.id), "title_edit_template");
  });
}

// —— 模板管理：新建/编辑（文档 3.1：用户可自行创建/编辑）——
async function TemplateEditScreen(root, templateId) {
  const templates = await Store.getCollection("templates");
  let tpl = templateId ? templates.find((x) => x.id === templateId) : newTemplate("");
  const isNew = !templateId;

  function exRows() {
    return tpl.exercises.map((e, i) => `
      <div class="setrow" style="grid-template-columns:1fr 1fr auto" data-i="${i}">
        <input placeholder="${t("exname_ph")}" value="${esc(e.exercise_name)}" data-f="exercise_name" />
        <input placeholder="${t("muscle_ph")}" value="${esc(e.target_muscle)}" data-f="target_muscle" />
        <button class="del" data-del="${i}">✕</button>
      </div>`).join("");
  }

  root.innerHTML = `
    <label class="field card" style="display:block">
      <span class="lbl">${t("template_name")}</span>
      <input id="tname" placeholder="${t("template_name_ph")}" value="${esc(tpl.name)}" />
    </label>
    <div class="card">
      <h2>${t("exercise_list")}</h2>
      <div class="set-head" style="grid-template-columns:1fr 1fr auto"><div>${t("col_exname")}</div><div>${t("col_muscle")}</div><div></div></div>
      <div id="exs">${exRows()}</div>
      <button class="btn secondary small" id="addRow">${t("add_ex_row")}</button>
    </div>
    <div class="btn-row"><button class="btn" id="save">${t("save")}</button></div>
    ${isNew ? "" : `<button class="btn danger small" id="del" style="width:100%;margin-top:10px">${t("delete_template")}</button>`}
  `;

  const exsEl = $("#exs", root);
  exsEl.addEventListener("input", (e) => {
    const row = e.target.closest(".setrow"); if (!row) return;
    const i = +row.dataset.i, f = e.target.dataset.f;
    if (f) tpl.exercises[i][f] = e.target.value;
  });
  exsEl.addEventListener("click", (e) => {
    if (e.target.dataset.del != null) { tpl.exercises.splice(+e.target.dataset.del, 1); exsEl.innerHTML = exRows(); }
  });
  $("#addRow", root).onclick = () => { tpl.exercises.push(newTemplateExercise("", "")); exsEl.innerHTML = exRows(); };
  $("#tname", root).addEventListener("input", (e) => (tpl.name = e.target.value));

  $("#save", root).onclick = async () => {
    if (!tpl.name.trim()) { toast(t("fill_template_name")); return; }
    tpl.exercises = tpl.exercises.filter((e) => e.exercise_name.trim());
    const all = await Store.getCollection("templates");
    const i = all.findIndex((x) => x.id === tpl.id);
    if (i >= 0) all[i] = tpl; else all.push(tpl);
    await Store.saveCollection("templates", all);
    toast(t("save"));
    back();
  };
  if (!isNew) $("#del", root).onclick = async () => {
    if (!confirm(t("confirm_delete_template"))) return;
    const all = (await Store.getCollection("templates")).filter((x) => x.id !== tpl.id);
    await Store.saveCollection("templates", all);
    back();
  };
}

// ============================================================
// 体重 / 体成分（文档第 4 节）
// 第一版：手动录入 11 项（截图 OCR 自动识别将在后续步骤加上）
// ============================================================
async function WeightScreen(root) {
  const entry = newWeightEntry();
  root.innerHTML = `
    <div class="card">
      <h2>${t("weight_title")}</h2>
      <p class="muted" style="margin-top:-4px">${t("weight_tip")}</p>
      <button class="btn" id="ocrBtn">${t("ocr_button")}</button>
      <input type="file" id="ocrFile" accept="image/*" hidden />
      <div class="muted" id="ocrStatus" style="font-size:13px;margin:8px 2px 16px">${t("ocr_hint")}</div>
      ${WEIGHT_FIELDS.map((f) => `
        <label class="field"><span class="lbl">${t("wf_" + f.key)}${f.unit ? `（${f.unit}）` : ""}</span>
        <input type="number" inputmode="decimal" data-k="${f.key}" placeholder="${t("weight_ph")}" /></label>`).join("")}
      <button class="btn" id="save">${t("save")}</button>
    </div>`;

  // —— 截图自动识别 ——
  const fileInput = $("#ocrFile", root);
  const statusEl = $("#ocrStatus", root);
  $("#ocrBtn", root).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    statusEl.textContent = t("ocr_recognizing", { p: 0 });
    try {
      const { extractNumbersFromImage } = await import("./ocr.js");
      const nums = await extractNumbersFromImage(file, (p) =>
        (statusEl.textContent = t("ocr_recognizing", { p: Math.round(p * 100) }))
      );
      // 按固定顺序把识别到的数值填入对应字段
      WEIGHT_FIELDS.forEach((f, i) => {
        if (nums[i] != null) {
          const inp = root.querySelector(`input[data-k="${f.key}"]`);
          if (inp) inp.value = nums[i];
        }
      });
      statusEl.textContent = t("ocr_done_n", { n: nums.length, total: WEIGHT_FIELDS.length });
      toast(t("ocr_done"));
    } catch (e) {
      statusEl.textContent = t("ocr_failed");
      toast(t("ocr_failed"));
    }
    fileInput.value = "";
  };

  $("#save", root).onclick = async () => {
    root.querySelectorAll("input[data-k]").forEach((inp) => { entry[inp.dataset.k] = inp.value.trim(); });
    if (WEIGHT_FIELDS.every((f) => entry[f.key] === "")) { toast(t("at_least_one")); return; }
    const all = await Store.getCollection("weight");
    all.push(entry);
    await Store.saveCollection("weight", all);
    toast(t("recorded"));
    reset(HomeScreen, "title_home");
  };
}

// ============================================================
// 饮食打卡（文档第 5 节）
// ============================================================
// —— 饮食记录辅助 ——
let dietTimerInterval = null;

// 某个日期所在「自然周(周一~周日)」的周日
function sundayOf(date) {
  const day = date.getDay();               // 0=周日 … 6=周六
  const add = day === 0 ? 0 : 7 - day;     // 到本周日还差几天
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + add);
}
function cnDateFull(d) { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }
function hhmm(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// 毫秒 → "X天 X小时 X分钟"
function fmtDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return t("dur_dhm", { d: Math.floor(totalMin / 1440), h: Math.floor((totalMin % 1440) / 60), m: totalMin % 60 });
}
// 最近一次完成训练的时刻（优先 finished_at，旧数据回退到开始时间）
async function lastWorkoutFinishIso() {
  const sessions = await Store.getCollection("strength_sessions");
  let latest = null;
  for (const s of sessions) {
    if (s.status !== "done") continue;
    const ft = s.finished_at || s.timestamp;
    if (!latest || ft > latest) latest = ft;
  }
  return latest;
}

// 一天的记录块：日期头(只出现一次) + 若干条记录(时间/内容/距训练)
function dietDayGroupHtml(list) {
  const header = `<div class="diet-date">${cnDateFull(new Date(list[0].timestamp))}</div>`;
  const recs = list.map((e) => `
    <div class="diet-rec">
      <div class="diet-time">${hhmm(e.timestamp)}</div>
      <div class="diet-content">${esc(e.content)}</div>
      <div class="diet-since">${e.since_ms == null ? "—" : t("after_workout", { d: fmtDuration(e.since_ms) })}</div>
    </div>`).join("");
  return `<div class="diet-day">${header}${recs}</div>`;
}

// 整个列表：从新到旧；本自然周展开，往期每个自然周折叠(标签=该周周日日期)
function dietListHtml(entries) {
  if (!entries.length) return `<div class="empty">${t("no_diet_yet")}</div>`;
  const sorted = entries.slice().sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  const byWeek = new Map(); // 周日key -> { sunDate, days: Map(dayKey -> entries[]) }
  for (const e of sorted) {
    const d = new Date(e.timestamp);
    const sun = sundayOf(d);
    const wk = ymdKey(sun.getFullYear(), sun.getMonth(), sun.getDate());
    if (!byWeek.has(wk)) byWeek.set(wk, { sunDate: sun, days: new Map() });
    const dayKey = ymdKey(d.getFullYear(), d.getMonth(), d.getDate());
    const days = byWeek.get(wk).days;
    if (!days.has(dayKey)) days.set(dayKey, []);
    days.get(dayKey).push(e);
  }
  const curSun = sundayOf(new Date());
  const curWk = ymdKey(curSun.getFullYear(), curSun.getMonth(), curSun.getDate());
  let html = "";
  for (const [wk, wkObj] of byWeek) {
    const daysHtml = [...wkObj.days.values()].map((list) => dietDayGroupHtml(list)).join("");
    if (wk === curWk) {
      html += `<div class="diet-week-open">${daysHtml}</div>`;
    } else {
      html += `<details class="diet-week">
        <summary class="diet-week-sum"><span class="diet-week-ic"></span>${t("week_ending", { date: cnDateFull(wkObj.sunDate) })}</summary>
        <div class="diet-week-body">${daysHtml}</div>
      </details>`;
    }
  }
  return html;
}

async function DietScreen(root) {
  if (dietTimerInterval) { clearInterval(dietTimerInterval); dietTimerInterval = null; }
  const entries = (await Store.getCollection("diet")).filter((e) => e && typeof e.content === "string");
  const originIso = await lastWorkoutFinishIso();

  root.innerHTML = `
    <div class="card diet-timer-card">
      <div class="diet-timer-label">${t("since_last_workout")}</div>
      <div class="diet-timer" id="dietTimer">—</div>
    </div>
    <div class="card">
      <label class="field" style="margin-bottom:8px"><span class="lbl">${t("diet_input_label")}</span>
        <input id="dietInput" placeholder="${t("diet_input_ph")}" /></label>
      <button class="btn" id="dietSave">${t("save")}</button>
    </div>
    <div id="dietList">${dietListHtml(entries)}</div>
  `;

  // 正计时（X天 X小时 X分钟），到点自动刷新；离开界面自动停止
  const tick = () => {
    const el = document.getElementById("dietTimer");
    if (!el) { clearInterval(dietTimerInterval); dietTimerInterval = null; return; }
    el.textContent = originIso == null ? t("timer_not_started")
      : fmtDuration(Date.now() - new Date(originIso).getTime());
  };
  tick();
  dietTimerInterval = setInterval(tick, 1000);

  $("#dietSave", root).onclick = async () => {
    const content = $("#dietInput", root).value.trim();
    if (!content) { toast(t("diet_input_empty")); return; }
    const sinceMs = originIso == null ? null : (Date.now() - new Date(originIso).getTime());
    const all = await Store.getCollection("diet");
    all.push(newDietEntry(content, sinceMs));
    await Store.saveCollection("diet", all);
    toast(t("diet_saved"));
    DietScreen(root); // 重新渲染，立刻看到新记录
  };
}

// ============================================================
// 历史记录（第一版：简单列表，图表分析等数据攒够后再加）
// ============================================================
async function HistoryScreen(root) {
  const [sessions, weights, diets] = await Promise.all([
    Store.getCollection("strength_sessions"),
    Store.getCollection("weight"),
    Store.getCollection("diet"),
  ]);
  const done = sessions.filter((s) => s.status === "done").sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  root.innerHTML = `
    <div class="section-title">${t("hist_strength")}（${done.length}）</div>
    ${done.length ? done.slice(0, 20).map((s) => {
      const finished = s.exercises.filter((e) => e.status === "completed").length;
      return `<div class="listitem"><div class="grow"><div class="name">${esc(s.workout_day_template)}</div>
        <div class="meta">${fmtDate(s.timestamp)} · ${t("completed_n_of_m", { done: finished, total: s.exercises.length })}</div></div></div>`;
    }).join("") : `<div class="empty">${t("no_strength")}</div>`}

    <div class="section-title">${t("hist_weight")}（${weights.length}）</div>
    ${weights.length ? weights.slice().reverse().slice(0, 20).map((w) => `
      <div class="listitem"><div class="grow"><div class="name">${w.weight || "-"} kg
        ${w.body_fat_pct ? "· " + t("body_fat_short", { v: w.body_fat_pct }) : ""}</div>
        <div class="meta">${fmtDate(w.timestamp)}</div></div></div>`).join("") : `<div class="empty">${t("no_weight")}</div>`}

    ${(() => { const dn = diets.filter((d) => d && typeof d.content === "string"); return `
    <div class="section-title">${t("hist_diet")}（${dn.length}）</div>
    ${dn.length ? dn.slice().sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")).slice(0, 20).map((d) => `
      <div class="listitem"><div class="grow"><div class="name">${esc(d.content || "-")}</div>
        <div class="meta">${fmtDate(d.timestamp)}</div></div></div>`).join("") : `<div class="empty">${t("no_diet")}</div>`}`; })()}
  `;
}

// ============================================================
// 启动
// ============================================================

// 同步状态变化时，实时更新首页账户区里的同步提示
Auth.setStatusListener(() => {
  const sub = document.getElementById("syncSub");
  if (sub) {
    sub.textContent = syncStatusText();
    sub.style.color = Auth.authState.status === "error" ? "var(--red)" : "";
  }
});

(async () => {
  if (Auth.hasStoredSession()) {
    appEl.innerHTML = `<div class="empty">${t("loading")}</div>`;
    try {
      await Auth.initAfterLogin();
      try { localStorage.removeItem("health_app_init_err"); } catch (_) {} // 成功=清掉离线原因
      await maybeSeedHandbook(); // 仅聶星辰账号会导入手册模板，其余账号无操作
      await maybeMigrateHandbook(); // 仅聶星辰：把已导入的旧模板内容更新到新版
      routeAfterLogin(); // 按角色分流：管理员 → 管理界面，普通用户 → 首页
    } catch (e) {
      // 记下离线原因（诊断用，界面会显示）
      try { localStorage.setItem("health_app_init_err", String((e && e.message) || e).slice(0, 100)); } catch (_) {}
      // 初始化(拉取)失败退回本地模式。但只要 getSession 拿到了登录信息(用户名还在)，
      // 就补跑一次 seed/迁移：会写本地并打 pending 标记，联网后自动补传。
      // 避免"拉取出错 → 迁移永远不跑 → 菜单卡住"。
      Auth.useLocalFallback();
      try { await maybeSeedHandbook(); await maybeMigrateHandbook(); } catch (e2) {}
      if (Auth.cachedRole() === "admin") reset(AdminScreen, "title_admin");
      else reset(HomeScreen, "title_home");
    }
  } else {
    reset(LoginScreen, "title_login");
  }
})();

// 注册 Service Worker（让 App 可离线、可加到主屏幕）
// updateViaCache:"none" → 浏览器永远绕过 HTTP 缓存拿最新 sw.js（否则 GitHub 的 10 分钟缓存
//   会让新版本迟迟检测不到）。配合 controllerchange 自动刷新，新版基本能立刻生效。
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    reg.update();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update(); });
  }).catch(() => {});
  let swReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloaded) return;
    swReloaded = true;
    location.reload();
  });
}
