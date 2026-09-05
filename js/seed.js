// ============================================================
// seed.js —— 把《健身动作手册 v1》的训练计划导入 App
// ------------------------------------------------------------
// 关键隐私约束（用户最在意的一点）：
//   这套模板【只】导入给用户名为「聶星辰」的账号。
//   1) 用户名不是聶星辰 → 整个函数直接返回，连复制一份都不会发生。
//   2) 写入的是「当前登录账号自己」的数据，Supabase 行级安全(RLS)
//      保证别的账号从数据库层面就读不到，朋友绝无可能看到这些训练内容。
//   3) 按「模板名」查重，已存在就跳过，绝不重复导入或覆盖你的修改。
//   4) 本地设一个一次性标记，导入过一次后同一台设备不再重复检查
//      （也尊重你之后主动删除某个模板的选择）。
// 手册改版时：更新下面的 HANDBOOK_TEMPLATES，并把 SEED_FLAG 的版本号
//   （_v1）改成 _v2，即可让聶星辰账号再导入一次新版。
// ============================================================
import { Store } from "./storage.js";
import { newTemplate, newTemplateExercise } from "./models.js";
import { getUsername, flushAll } from "./supabase.js";

// 只有这个用户名才会被导入
const OWNER = "聶星辰";
// 一次性标记（换版本号即可重新导入）
const SEED_FLAG = "health_app_seed_handbook_v1";
// 模板内容迁移标记（每次要改"已导入过"的模板内容，就加一个新标记并写迁移逻辑）
const MIGRATION_V2_FLAG = "health_app_handbook_migration_v2";
const MIGRATION_V3_FLAG = "health_app_handbook_migration_v3"; // 简化成 A/B 两套菜单（旧，可能因云端未推成功而卡住）
const MIGRATION_V4_FLAG = "health_app_handbook_migration_v4"; // v4：强制重换 A/B 并确认推云端
const MIGRATION_V5_FLAG = "health_app_handbook_migration_v5"; // v5：A/B 改名 + 新增 Day C(背)/Day D(游泳)

// 训练菜单（2026-06-14 起，朋友帮忙简化为 Day A / Day B 两套）。
// 动作名「中文 日本語」；每项 [动作名, 目标部位, 计划组数, 计划次数]。
const HANDBOOK_TEMPLATES = [
  {
    name: "Day A · 胸/肩",
    exercises: [
      ["坐姿推胸 チェストプレス", "胸", 6, "10-12"],
      ["坐姿肩推 ショルダープレス", "肩", 3, "10-14"],
      ["侧向肩推 サイドプレス", "肩", 3, "10-14"],
      ["辅助引体 チンニングマシン", "背", 6, "10-12"],
    ],
  },
  {
    name: "Day B · 腿",
    exercises: [
      ["腿举 45°レッグプレス", "腿", 7, "10-14"],
      ["提踵 カーフプレス", "小腿", 4, "10-14"],
      ["坐姿划船 シーテッドロー", "背", 5, "10-12"],
    ],
  },
  { name: "Day C · 背", exercises: [] },                 // 空模板：靠"临时加动作"自选当天内容
  { name: "Day D · 游泳", exercises: [], kind: "swim" }, // 游泳：只记米数+时长
];

// 由定义构建一个模板对象
function buildTemplate(def) {
  const tpl = newTemplate(def.name);
  if (def.kind) tpl.kind = def.kind;
  tpl.exercises = (def.exercises || []).map(([name, muscle, sets, reps]) =>
    newTemplateExercise(name, muscle, sets, reps));
  return tpl;
}

/**
 * 登录成功后调用：仅当登录用户名为聶星辰时，把手册模板导入其本人账号。
 * 必须在 Auth.initAfterLogin() 之后调用（此时后端已切到云、用户名已就绪）。
 */
export async function maybeSeedHandbook() {
  try {
    if ((getUsername() || "").trim() !== OWNER) return;        // 隐私闸门①：只给聶星辰
    if (localStorage.getItem(SEED_FLAG)) return;               // 本设备已导入过，跳过

    const templates = await Store.getCollection("templates");
    const existingNames = new Set(templates.map((tpl) => tpl.name));
    let added = 0;
    for (const def of HANDBOOK_TEMPLATES) {
      if (existingNames.has(def.name)) continue;               // 按名查重，绝不重复
      templates.push(buildTemplate(def));
      added++;
    }
    if (added > 0) await Store.saveCollection("templates", templates);
    localStorage.setItem(SEED_FLAG, "1");                       // 置位，下次不再检查
  } catch (e) {
    // 导入失败不应影响正常登录使用，静默即可
    console.warn("seed handbook skipped:", e);
  }
}

/**
 * 一次性内容迁移（v2，2026-06-13）：把聶星辰账号里【已导入过】的旧模板更新到新版。
 *   · Day B：高脚杯深蹲 ゴブレットスクワット → 史密斯机深蹲 スミススクワット
 *   · Day C：末尾追加 俯卧撑 プッシュアップ（自重）
 * 因为导入只跑一次（SEED_FLAG 已置位），改 seed 数据不会动到现有模板，故需要这段。
 * 幂等：按动作名匹配，改过/加过就不再重复；并用 MIGRATION_V2_FLAG 兜底。
 * 必须在 Auth.initAfterLogin() 之后调用。
 */
export async function maybeMigrateHandbook() {
  // 注意：各迁移块相互独立、互不阻断（用 if 守卫，别用 return，否则前一块会挡住后面的）。
  const isOwner = (getUsername() || "").trim() === OWNER;
  if (!isOwner) return;

  // —— 迁移 v4（2026-06-14）：整体换成 Day A / Day B 两套 ——
  try {
    if (!localStorage.getItem(MIGRATION_V4_FLAG)) {
      await Store.saveCollection("templates", HANDBOOK_TEMPLATES.map(buildTemplate));
      try { await flushAll(); } catch (e) {}
      localStorage.setItem(MIGRATION_V4_FLAG, "1");
    }
  } catch (e) { console.warn("handbook migration v4 skipped:", e); }

  // —— 迁移 v5（2026-06-15）：A/B 改名（内容不变）+ 新增 Day C(背，空) / Day D(游泳) ——
  try {
    if (!localStorage.getItem(MIGRATION_V5_FLAG)) {
      const templates = await Store.getCollection("templates");
      let changed = false;
      const rename = (oldName, newName) => {
        const tpl = templates.find((x) => x.name === oldName);
        if (tpl) { tpl.name = newName; changed = true; }
      };
      rename("Day A · 胸/肩/背", "Day A · 胸/肩");
      rename("Day B · 腿/肩", "Day B · 腿");
      if (!templates.some((x) => /Day C/.test(x.name))) {
        templates.push(buildTemplate({ name: "Day C · 背", exercises: [] }));
        changed = true;
      }
      if (!templates.some((x) => /Day D/.test(x.name))) {
        templates.push(buildTemplate({ name: "Day D · 游泳", exercises: [], kind: "swim" }));
        changed = true;
      }
      if (changed) { await Store.saveCollection("templates", templates); try { await flushAll(); } catch (e) {} }
      localStorage.setItem(MIGRATION_V5_FLAG, "1");
    }
  } catch (e) { console.warn("handbook migration v5 skipped:", e); }
}
