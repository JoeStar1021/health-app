// ============================================================
// models.js —— 数据模型（严格对应项目文档 3.4 / 4.2 / 5.2）
// ------------------------------------------------------------
// 原则：记录界面可以简洁，但底层结构「宁全勿缺」。
// 标注【预留】的字段先建好但界面暂不强制（文档 1.设计总原则）。
// 每条记录都带 user_id，为将来多用户扩展预留（文档 6.3）。
// ============================================================

// 当前用户（第一版只有一个人，固定为 "me"；多用户扩展时替换）
export const CURRENT_USER = "me";

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function now() {
  return new Date().toISOString();
}

// —— 组类型选项（文档 3.4：必须区分热身/正式，否则污染统计）——
// 用语言中立的内部值（界面显示按语言翻译，存储统一）。未来可加 "drop" 等。
export const SET_TYPES = ["normal", "warmup"];

// ============================================================
// 力量训练
// ============================================================

/** 训练日模板（文档 3.1，不绑定星期几） */
export function newTemplate(name) {
  return {
    id: uid(),
    user_id: CURRENT_USER,
    name: name || "",
    exercises: [], // 每项: { exercise_name, target_muscle, equipment_type }
  };
}

/** 模板里的一个动作定义 */
export function newTemplateExercise(name, targetMuscle) {
  return {
    exercise_name: name || "",
    target_muscle: targetMuscle || "",
    equipment_type: "", // 【预留】杠铃/哑铃/器械/自重
  };
}

/** 一组（Set）—— 文档 3.4 每组层面 */
export function newSet(prefill = {}) {
  return {
    weight: prefill.weight ?? "",      // 【必填】kg
    reps: prefill.reps ?? "",          // 【必填】
    rpe_rir: prefill.rpe_rir ?? "",    // 【必做】RPE 或 RIR
    set_type: prefill.set_type ?? "normal", // 【必做】normal / warmup
    rest_seconds: "",                  // 【预留】组间休息
    is_unilateral: false,              // 【预留】单/双侧
  };
}

/** 训练中的一个动作（Exercise）—— 文档 3.4 每个动作层面 */
export function newSessionExercise(name, targetMuscle) {
  return {
    exercise_name: name || "",
    target_muscle: targetMuscle || "",
    equipment_type: "",          // 【预留】
    note: "",                    // 【必填可空】体感备注
    status: "not_started",       // not_started / completed / skipped
    sets: [],
  };
}

/** 一次训练（Session）—— 文档 3.4 每次训练层面 */
export function newSession(templateName) {
  return {
    id: uid(),
    user_id: CURRENT_USER,
    timestamp: now(),                  // 【系统自动】
    workout_day_template: templateName || "",
    session_note: "",                  // 【预留】整体备注
    total_duration: null,              // 【预留】总时长
    status: "in_progress",             // in_progress / done
    exercises: [],
  };
}

// ============================================================
// 体重 / 体成分 —— 文档 4.2 共 11 项
// ============================================================

/** 11 项字段定义：key 用于存储，unit 是单位符号（语言中立）。
 * 字段名称（label）按界面语言翻译，见 i18n.js 的 wf_* 键。 */
export const WEIGHT_FIELDS = [
  { key: "weight", unit: "kg" },
  { key: "bmi", unit: "" },
  { key: "body_fat_pct", unit: "%" },
  { key: "muscle_pct", unit: "%" },
  { key: "fat_free_mass", unit: "kg" },
  { key: "subcutaneous_fat_pct", unit: "%" },
  { key: "visceral_fat", unit: "" },
  { key: "body_water_pct", unit: "%" },
  { key: "skeletal_muscle_pct", unit: "%" },
  { key: "muscle_mass", unit: "kg" },
  { key: "bone_mass", unit: "kg" },
];

export function newWeightEntry() {
  const entry = {
    id: uid(),
    user_id: CURRENT_USER,
    timestamp: now(), // 【系统自动】
  };
  WEIGHT_FIELDS.forEach((f) => (entry[f.key] = ""));
  return entry;
}

// ============================================================
// 饮食打卡 —— 文档 5.2
// ============================================================

export function newDietEntry(adhered, reason) {
  return {
    id: uid(),
    user_id: CURRENT_USER,
    timestamp: now(),
    date: new Date().toISOString().slice(0, 10), // 【系统自动】YYYY-MM-DD
    adhered: !!adhered,        // 【必填】是否坚持
    reason: adhered ? "" : (reason || ""), // 未坚持时填
  };
}
