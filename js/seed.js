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
import { getUsername } from "./supabase.js";

// 只有这个用户名才会被导入
const OWNER = "聶星辰";
// 一次性标记（换版本号即可重新导入）
const SEED_FLAG = "health_app_seed_handbook_v1";
// 模板内容迁移标记（每次要改"已导入过"的模板内容，就加一个新标记并写迁移逻辑）
const MIGRATION_V2_FLAG = "health_app_handbook_migration_v2";

// 《健身动作手册 v1 / 2026-06-12》的 A / B / C 三个模板。
// 动作名用「中文 日本語」（中文看懂动作，日语方便在健身房按机器标牌找到它）。
// target_muscle 用简短中文。
const HANDBOOK_TEMPLATES = [
  {
    name: "Day A · 腿+胸肩",
    exercises: [
      ["腿举 レッグプレス", "大腿·臀"],
      ["坐姿推胸 チェストプレス", "胸"],
      ["坐姿腿弯举 レッグカール", "腘绳肌"],
      ["坐姿肩推 ショルダープレス", "肩"],
      ["臀冲 ヒップスラスト", "臀·盆底"],
      ["坐姿卷腹 アブドミナルクランチ", "腹"],
    ],
  },
  {
    name: "Day B · 背+臀髋",
    exercises: [
      ["史密斯机深蹲 スミススクワット", "腿·臀"],
      ["高位下拉 ラットプルダウン", "背阔肌"],
      ["坐姿划船 ローロウ", "背中部"],
      ["蝴蝶机夹胸 ペクトラルフライ", "胸"],
      ["髋外展 アブダクター", "臀中肌"],
      ["背伸展 バックエクステンション", "下背·臀"],
      ["转体机 ロータリートルソー", "腹斜肌"],
    ],
  },
  {
    name: "Day C · 后链+全身",
    exercises: [
      ["罗马尼亚硬拉 ルーマニアンデッドリフト", "臀·腘绳·下背"],
      ["腿屈伸 レッグエクステンション", "股四头肌"],
      ["辅助引体/双杠 チン＆ディップ", "背·臂"],
      ["史密斯上斜推 スミスインクライン", "上胸·肩"],
      ["臀冲 ヒップスラスト", "臀·盆底"],
      ["髋内收 アダクター", "大腿内侧"],
      ["俯卧撑 プッシュアップ", "胸·三头·核心"],
    ],
  },
];

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
      const tpl = newTemplate(def.name);
      tpl.exercises = def.exercises.map(([name, muscle]) =>
        newTemplateExercise(name, muscle)
      );
      templates.push(tpl);
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
  try {
    if ((getUsername() || "").trim() !== OWNER) return;
    if (localStorage.getItem(MIGRATION_V2_FLAG)) return;

    const templates = await Store.getCollection("templates");
    let changed = false;

    // ① 高脚杯深蹲 → 史密斯机深蹲（在任意模板里找到就替换）
    for (const tpl of templates) {
      for (const ex of tpl.exercises) {
        if (ex.exercise_name === "高脚杯深蹲 ゴブレットスクワット") {
          ex.exercise_name = "史密斯机深蹲 スミススクワット";
          ex.target_muscle = "腿·臀";
          changed = true;
        }
      }
    }

    // ② Day C 末尾追加 俯卧撑（若尚无）
    const dayC = templates.find((t) => /Day C/.test(t.name));
    if (dayC && !dayC.exercises.some((e) => e.exercise_name === "俯卧撑 プッシュアップ")) {
      dayC.exercises.push(newTemplateExercise("俯卧撑 プッシュアップ", "胸·三头·核心"));
      changed = true;
    }

    if (changed) await Store.saveCollection("templates", templates);
    localStorage.setItem(MIGRATION_V2_FLAG, "1");
  } catch (e) {
    console.warn("handbook migration v2 skipped:", e);
  }
}
