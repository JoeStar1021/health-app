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
        <label class="field"><span class="lbl">${t("email")}</span>
          <input id="email" type="email" inputmode="email" autocomplete="email" placeholder="${t("email_ph")}" /></label>
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
    const email = $("#email", root).value.trim();
    const pw = $("#password", root).value;
    const msg = $("#loginMsg", root);
    if (!email || !pw) { msg.textContent = t("fill_email_pw"); return; }
    if (pw.length < 6) { msg.textContent = t("pw_too_short"); return; }
    const btn = $("#submit", root); btn.disabled = true; msg.textContent = "…";
    try {
      if (mode === "signup") await Auth.signUp(email, pw);
      await Auth.signIn(email, pw);
      await Auth.initAfterLogin();
      reset(HomeScreen, "title_home");
    } catch (e) {
      msg.style.color = "var(--red)";
      msg.textContent = (mode === "signup" ? t("signup_failed") : t("login_failed")) + (e?.message ? "：" + e.message : "");
      btn.disabled = false;
    }
  }
  paint();
}

// —— 首页底部的账户区 ——
function syncStatusText() {
  switch (Auth.authState.status) {
    case "syncing": return t("sync_syncing");
    case "error": return t("sync_error");
    default: return t("sync_synced");
  }
}
function accountGroupHtml() {
  const errColor = Auth.authState.status === "error" ? "color:var(--red)" : "";
  return `
    <div class="group">
      <div class="row" style="cursor:default">
        ${iconTile("user", "var(--brand)")}
        <span class="row-text"><span class="row-title">${esc(Auth.getUserEmail())}</span>
          <span class="row-sub" id="syncSub" style="${errColor}">${syncStatusText()}</span></span>
      </div>
      <button class="row" id="logout">
        ${iconTile("logout", "#8e8e93")}
        <span class="row-text"><span class="row-title">${t("logout")}</span></span>
        <span class="row-chev">${ICONS.chevR}</span>
      </button>
    </div>`;
}
function wireAccountGroup(root) {
  const btn = $("#logout", root);
  if (btn) btn.onclick = async () => {
    if (!confirm(t("logout_confirm"))) return;
    await Auth.signOut();
    reset(LoginScreen, "title_login");
  };
}

// ============================================================
// 首页 / 今日概览（文档第 2 节）
// ============================================================
async function HomeScreen(root) {
  const [sessions, weights, diets] = await Promise.all([
    Store.getCollection("strength_sessions"),
    Store.getCollection("weight"),
    Store.getCollection("diet"),
  ]);
  const today = todayStr();
  const inProgress = sessions.find((s) => s.status === "in_progress");
  const trainedToday = sessions.some((s) => s.timestamp.slice(0, 10) === today && s.status === "done");
  const weighedToday = weights.some((w) => w.timestamp.slice(0, 10) === today);
  const dietToday = diets.find((d) => d.date === today);

  const status = (ok, txt) => `<div class="statusline"><span class="ic">${ok ? ICONS.check : ICONS.circle}</span>${txt}</div>`;
  const weekday = new Date().toLocaleDateString(localeTag(), { month: "long", day: "numeric", weekday: "long" });
  const row = (id, icon, color, title, sub) => `
    <button class="row" id="${id}">${iconTile(icon, color)}
      <span class="row-text"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>
      <span class="row-chev">${ICONS.chevR}</span></button>`;

  root.innerHTML = `
    <div class="card">
      <h2>${t("home_today")} · ${weekday}</h2>
      ${status(trainedToday, trainedToday ? t("today_trained_done") : t("today_trained_none"))}
      ${status(weighedToday, weighedToday ? t("today_weight_done") : t("today_weight_none"))}
      ${status(!!dietToday, dietToday ? (dietToday.adhered ? t("today_diet_yes") : t("today_diet_no")) : t("today_diet_none"))}
    </div>

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

  root.innerHTML = `<div class="muted" style="margin:0 4px 12px">${t("pick_prompt")}</div>` +
    templates.map((tpl) => `
      <div class="listitem" data-id="${tpl.id}">
        <div class="grow"><div class="name">${esc(tpl.name)}</div>
          <div class="meta">${t("n_exercises", { n: tpl.exercises.length })} · ${esc(tpl.exercises.map(e => e.exercise_name).slice(0, 3).join("、"))}${tpl.exercises.length > 3 ? "…" : ""}</div>
        </div><span class="chev muted">›</span>
      </div>`).join("");

  root.querySelectorAll(".listitem").forEach((el) => {
    el.onclick = () => startSession(el.dataset.id);
  });
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
      return { date: s.timestamp, sets: use };
    }
  }
  return null;
}

// —— 单个动作的记录界面（文档 3.2 第 3-6 步）——
async function ExerciseRecordScreen(root, sessionId, exIndex) {
  const session = await getSession(sessionId);
  const ex = session.exercises[exIndex];
  const last = await findLastRecord(ex.exercise_name, sessionId);

  const lastHtml = last
    ? `<div class="lasttime"><b>${t("last_time", { date: fmtDate(last.date) })}</b>${
        last.sets.map((s) => `${s.weight || "?"}kg×${s.reps || "?"}`).join(" / ")}</div>`
    : `<div class="lasttime muted">${t("no_history")}</div>`;

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

  root.innerHTML = `
    <div class="card">
      <h2>${esc(ex.exercise_name)} ${ex.target_muscle ? `<span class="tag">${esc(ex.target_muscle)}</span>` : ""}</h2>
      ${lastHtml}
      <div class="set-head"><div></div><div>${t("col_weight")}</div><div>${t("col_reps")}</div><div>${t("col_rir")}</div><div>${t("col_type")}</div></div>
      <div id="sets">${setRowsHtml()}</div>
      <button class="btn secondary small" id="addSet">${t("add_set")}</button>
      <div class="muted" style="font-size:12px;margin-top:10px">${t("rir_hint")}</div>
    </div>
    <label class="field card" style="display:block">
      <span class="lbl">${t("note_label")}</span>
      <textarea id="note" placeholder="${t("note_ph")}">${esc(ex.note)}</textarea>
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
  $("#done", root).onclick = async () => {
    ex.status = "completed"; await saveSession(session); toast(t("recorded")); back();
  };
  $("#skip", root).onclick = async () => {
    ex.status = "skipped"; await saveSession(session); toast(t("marked_skip")); back();
  };
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
      statusEl.textContent = t("ocr_done");
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
async function DietScreen(root) {
  const today = todayStr();
  const all = await Store.getCollection("diet");
  const existing = all.find((d) => d.date === today);
  let adhered = existing ? existing.adhered : null;

  function paint() {
    root.innerHTML = `
      <div class="card">
        <h2>${t("diet_q")}</h2>
        ${existing ? `<p class="muted">${t("already_checked")}</p>` : ""}
        <div class="pill-toggle">
          <button id="yes" class="${adhered === true ? "on-yes" : ""}">${t("yes_btn")}</button>
          <button id="no" class="${adhered === false ? "on-no" : ""}">${t("no_btn")}</button>
        </div>
        <div id="reasonBox" style="margin-top:14px;${adhered === false ? "" : "display:none"}">
          <label class="field"><span class="lbl">${t("reason_label")}</span>
          <textarea id="reason" placeholder="${t("reason_ph")}">${esc(existing?.reason || "")}</textarea></label>
        </div>
        <button class="btn" id="save" style="margin-top:8px">${t("save_check")}</button>
      </div>`;
    $("#yes", root).onclick = () => { adhered = true; paint(); };
    $("#no", root).onclick = () => { adhered = false; paint(); };
    $("#save", root).onclick = save;
  }
  async function save() {
    if (adhered === null) { toast(t("pick_yes_no")); return; }
    const reason = adhered === false ? ($("#reason", root)?.value || "") : "";
    const all = await Store.getCollection("diet");
    const i = all.findIndex((d) => d.date === today);
    const rec = newDietEntry(adhered, reason);
    if (i >= 0) { rec.id = all[i].id; all[i] = rec; } else all.push(rec);
    await Store.saveCollection("diet", all);
    toast(t("check_done"));
    reset(HomeScreen, "title_home");
  }
  paint();
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

    <div class="section-title">${t("hist_diet")}（${diets.length}）</div>
    ${diets.length ? diets.slice().reverse().slice(0, 20).map((d) => `
      <div class="listitem"><div class="grow"><div class="name">${d.adhered ? t("diet_yes_label") : t("diet_no_label")}</div>
        <div class="meta">${d.date}${d.reason ? " · " + esc(d.reason) : ""}</div></div></div>`).join("") : `<div class="empty">${t("no_diet")}</div>`}
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
    // 已登录：先用本地缓存秒开（离线也能用），再后台连云、拉取、切到云后端
    Auth.useLocalFallback();
    reset(HomeScreen, "title_home");
    Auth.initAfterLogin().then(() => render()).catch(() => {});
  } else {
    reset(LoginScreen, "title_login");
  }
})();

// 注册 Service Worker（让 App 可离线、可加到主屏幕）
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
