// ============================================================
// i18n.js —— 界面多语言（日语 / 中文）
// ------------------------------------------------------------
// 界面默认日语（给日本朋友用），可一键切换中文。
// 注意：用户填进 App 的内容（动作名、备注等）是「数据」，不在这里翻译，
// 用户填什么就存什么。这里只翻译界面固定文字。
// 将来多用户时，可把语言偏好存到各自的用户设置里。
// ============================================================

const LANG_KEY = "health_app_lang";

// 占位符替换：t("resume_sub", { name: "Day A" })
function fill(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
}

let lang = localStorage.getItem(LANG_KEY) || "ja"; // 默认日语

export function getLang() { return lang; }
export function setLang(l) { lang = l; localStorage.setItem(LANG_KEY, l); }
export function localeTag() { return lang === "ja" ? "ja-JP" : "zh-CN"; }

export function t(key, params) {
  const s = (dict[lang] && dict[lang][key]) ?? (dict.zh[key]) ?? key;
  return fill(s, params);
}

const dict = {
  ja: {
    app_title: "健康記録",
    loading: "読み込み中…",
    lang_ja: "日本語", lang_zh: "中文",

    // 标题
    title_home: "健康記録",
    title_pick: "トレーニング日を選択",
    title_weight: "体重を記録",
    title_diet: "食事チェック",
    title_history: "履歴",
    title_templates: "トレーニング日テンプレート",
    title_new_template: "トレーニング日を新規作成",
    title_edit_template: "トレーニング日を編集",
    title_session: "トレーニング記録",
    title_record_ex: "種目を記録",
    title_add_ex: "種目を追加",

    // 首页
    home_today: "今日",
    today_trained_done: "今日のトレーニングを記録済み",
    today_trained_none: "今日はまだトレーニング未記録",
    today_weight_done: "今日の体重を記録済み",
    today_weight_none: "今日はまだ体重未記録",
    today_diet_yes: "食事チェック：レシピ通り",
    today_diet_no: "食事チェック：レシピ通りでない",
    today_diet_none: "今日はまだ食事チェック未記録",
    resume_title: "中断したトレーニングを続ける",
    resume_sub: "{name}・タップで記録に戻る",
    section_record: "記録する",
    home_strength: "今日のトレーニングを開始",
    home_strength_sub: "筋トレ・トレーニング日を選択",
    home_weight: "体重・体組成を記録",
    home_weight_sub: "朝の計測後",
    home_diet: "食事チェック",
    home_diet_sub: "今夜レシピ通り食べたか",
    section_history: "履歴を見る",
    home_history: "履歴",
    home_history_sub: "筋トレ / 体重 / 食事",
    language: "言語",

    // 力量：选择/模板
    manage_templates: "テンプレート管理",
    no_templates_p: "まだトレーニング日テンプレートがありません。トレーニング日は友達が組んだメニューです（例：「Day A = 胸+三頭」）。",
    create_first: "＋ 最初のトレーニング日を作成",
    pick_prompt: "今日はどのトレーニング日？タップして開始。",
    n_exercises: "{n} 種目",
    new_btn: "＋ 新規",
    no_templates_short: "テンプレートがありません。右上の「＋ 新規」をタップ",
    edit_arrow: "編集 ›",
    template_name: "トレーニング日の名前",
    template_name_ph: "例：Day A（胸+三頭）",
    exercise_list: "種目リスト",
    col_exname: "種目名",
    col_muscle: "対象筋群",
    exname_ph: "種目名",
    muscle_ph: "筋群",
    add_ex_row: "＋ 種目を追加",
    delete_template: "このトレーニング日を削除",
    fill_template_name: "トレーニング日の名前を入力してください",
    confirm_delete_template: "このトレーニング日テンプレートを削除しますか？記録済みの履歴は影響を受けません。",

    // 力量：清单
    badge_done: "完了", badge_skipped: "スキップ", badge_todo: "未開始",
    n_sets: "{n} セット",
    add_temp_ex: "＋ 種目を一時的に追加",
    finish_session: "今回のトレーニングを完了",
    discard_session: "今回のトレーニングを破棄",
    session_saved: "トレーニングを保存しました ✅",
    confirm_discard: "今回のトレーニングを破棄しますか？入力した記録は削除されます。",
    not_found_session: "トレーニングが見つかりません",

    // 力量：动作记录
    last_time: "前回（{date}）：",
    no_history: "この種目はまだ記録がありません。これが最初です、頑張って！",
    col_weight: "重量", col_reps: "回数", col_rir: "RIR", col_type: "タイプ",
    add_set: "＋ セットを追加",
    delete_set: "このセットを削除",
    note_label: "メモ（体感、空欄可）",
    note_ph: "例：今日は肩が少し不調 / グリップを狭めると安定",
    skip_ex: "この種目をスキップ",
    done_ex: "この種目を完了",
    recorded: "記録しました ✅",
    marked_skip: "スキップにしました",
    ph_kg: "kg", ph_reps: "回", rir_title: "あと何回できるか",
    rir_hint: "RIR＝あと何回できたか（0＝限界、もう1回も無理）。ウォームアップは記録不要。",
    set_type_normal: "本番", set_type_warmup: "ウォームアップ",

    // 力量：加动作
    new_exercise: "種目を新規作成",
    ex_name: "種目名", ex_name_ph: "例：フライ",
    target_muscle_opt: "対象筋群（空欄可）", muscle_ph2: "例：胸",
    add_to_session: "今回のトレーニングに追加",
    or_pick_done: "または記録済みの種目から選ぶ",
    fill_ex_name: "種目名を入力してください",
    added: "追加しました",

    // 体重
    weight_title: "体重・体組成を記録",
    weight_tip: "朝の同じ時間・空腹・排尿後・金属アクセサリーなしが最も安定します。＊体重は正確ですが、体脂肪率/筋肉量などは推定値です。<b>絶対値より傾向を見てください</b>。",
    ocr_notice: "📷 スクリーンショット自動認識は今後のバージョンで追加します。今は手入力で、気になる項目だけでOK（空欄可）。",
    weight_ph: "空欄可",
    at_least_one: "1項目以上入力してください",
    ocr_button: "📷 スクショから自動入力",
    ocr_hint: "体組成計アプリのあの画面のスクショを選ぶと、11項目を自動で読み取ります（読み取り後、念のため目視で確認を）。",
    ocr_recognizing: "読み取り中… {p}%",
    ocr_done: "自動入力しました。確認して保存してください ✅",
    ocr_failed: "読み取りに失敗しました。手動で入力してください。",
    wf_weight: "体重", wf_bmi: "BMI", wf_body_fat_pct: "体脂肪率", wf_muscle_pct: "筋肉率",
    wf_fat_free_mass: "除脂肪体重", wf_subcutaneous_fat_pct: "皮下脂肪", wf_visceral_fat: "内臓脂肪（指数）",
    wf_body_water_pct: "体水分", wf_skeletal_muscle_pct: "骨格筋率", wf_muscle_mass: "筋肉量", wf_bone_mass: "骨量",

    // 饮食
    diet_q: "今夜はレシピ通り食べましたか？",
    already_checked: "今日はチェック済みです。選び直すと上書きされます。",
    yes_btn: "はい ✅", no_btn: "いいえ ✕",
    reason_label: "レシピ通りでなかった理由",
    reason_ph: "例：外食 / 残業でデリバリー",
    save_check: "チェックを保存",
    pick_yes_no: "先に「はい」か「いいえ」を選んでください",
    check_done: "チェック完了 ✅",

    // 历史
    hist_strength: "筋トレ", hist_weight: "体重・体組成", hist_diet: "食事チェック",
    completed_n_of_m: "{done}/{total} 種目完了",
    no_strength: "まだトレーニング記録がありません",
    no_weight: "まだ体重記録がありません",
    no_diet: "まだ食事記録がありません",
    body_fat_short: "体脂肪 {v}%",
    diet_yes_label: "✅ レシピ通り", diet_no_label: "✕ レシピ通りでない",

    // 数据存储 / Google Drive
    storage_section: "データの保存先",
    storage_local_status: "この端末内に保存中",
    storage_drive_status: "Google ドライブと同期中",
    connect_drive: "Google ドライブに接続",
    disconnect_drive: "接続を解除",
    drive_local_hint: "今はこの端末内に保存しています。Google ドライブに接続すると、iPhone など他の端末ともデータを同期できます。",
    drive_connecting: "接続中…",
    drive_syncing: "同期中…",
    drive_synced: "同期済み ✅",
    drive_error: "同期エラー。もう一度接続してください。",
    drive_connect_failed: "接続に失敗しました。もう一度お試しください。",
    drive_disconnect_confirm: "Google ドライブとの同期を解除しますか？（アップロード済みのデータは削除されません）",

    // 通用
    save: "保存",
  },

  zh: {
    app_title: "健康记录",
    loading: "加载中…",
    lang_ja: "日本語", lang_zh: "中文",

    title_home: "健康记录",
    title_pick: "选择训练日",
    title_weight: "记录体重",
    title_diet: "饮食打卡",
    title_history: "历史记录",
    title_templates: "训练日模板",
    title_new_template: "新建训练日",
    title_edit_template: "编辑训练日",
    title_session: "训练记录",
    title_record_ex: "记录动作",
    title_add_ex: "添加动作",

    home_today: "今天",
    today_trained_done: "已完成今天的训练",
    today_trained_none: "今天还没记录训练",
    today_weight_done: "已记录今天的体重",
    today_weight_none: "今天还没记录体重",
    today_diet_yes: "饮食已打卡：按食谱吃了",
    today_diet_no: "饮食已打卡：未按食谱",
    today_diet_none: "今天还没饮食打卡",
    resume_title: "继续未完成的训练",
    resume_sub: "{name} · 点此回到记录",
    section_record: "开始记录",
    home_strength: "开始今天的训练",
    home_strength_sub: "力量训练 · 选训练日",
    home_weight: "记录体重 / 体成分",
    home_weight_sub: "早晨称重后",
    home_diet: "饮食打卡",
    home_diet_sub: "今晚是否按食谱吃",
    section_history: "查看历史",
    home_history: "历史记录",
    home_history_sub: "力量 / 体重 / 饮食",
    language: "语言",

    manage_templates: "管理模板",
    no_templates_p: "还没有训练日模板。训练日是朋友给你设计的菜单，比如「Day A = 胸+三头」。",
    create_first: "＋ 创建第一个训练日",
    pick_prompt: "今天练哪个训练日？点一下开始。",
    n_exercises: "{n} 个动作",
    new_btn: "＋ 新建",
    no_templates_short: "还没有模板，点右上角「＋ 新建」",
    edit_arrow: "编辑 ›",
    template_name: "训练日名称",
    template_name_ph: "如：Day A（胸+三头）",
    exercise_list: "动作列表",
    col_exname: "动作名",
    col_muscle: "目标肌群",
    exname_ph: "动作名",
    muscle_ph: "肌群",
    add_ex_row: "＋ 加一个动作",
    delete_template: "删除这个训练日",
    fill_template_name: "请填训练日名称",
    confirm_delete_template: "删除这个训练日模板？已记录的历史训练不受影响。",

    badge_done: "已完成", badge_skipped: "已跳过", badge_todo: "未开始",
    n_sets: "{n} 组",
    add_temp_ex: "＋ 临时加一个动作",
    finish_session: "完成本次训练",
    discard_session: "放弃本次训练",
    session_saved: "本次训练已存档 ✅",
    confirm_discard: "放弃本次训练？已填的记录会删除。",
    not_found_session: "找不到这次训练",

    last_time: "上次（{date}）：",
    no_history: "这个动作还没有历史记录，加油，这是第一次！",
    col_weight: "重量", col_reps: "次数", col_rir: "RIR", col_type: "类型",
    add_set: "＋ 加一组",
    delete_set: "删除这组",
    note_label: "动作备注（体感，可空）",
    note_ph: "如：今天肩略不适 / 握距调窄更稳",
    skip_ex: "跳过此动作",
    done_ex: "完成此动作",
    recorded: "已记录 ✅",
    marked_skip: "已标记跳过",
    ph_kg: "kg", ph_reps: "次", rir_title: "还能再做几个",
    rir_hint: "RIR＝这组还能再做几个（0＝力竭，一个都做不动了）。热身组不用记。",
    set_type_normal: "正式组", set_type_warmup: "热身组",

    new_exercise: "新建一个动作",
    ex_name: "动作名", ex_name_ph: "如：飞鸟",
    target_muscle_opt: "目标肌群（可空）", muscle_ph2: "如：胸",
    add_to_session: "加入本次训练",
    or_pick_done: "或从练过的动作里选",
    fill_ex_name: "请填动作名",
    added: "已加入",

    weight_title: "记录体重 / 体成分",
    weight_tip: "早晨同一时间、空腹、排空、无金属配饰，测得最稳。＊体重是准的；体脂率/肌肉量等是推算值，<b>只看趋势别纠结绝对值</b>。",
    ocr_notice: "📷 截图自动识别功能将在后续版本加上。现在先手动填，只填你关心的、留空也行。",
    weight_ph: "留空也行",
    at_least_one: "至少填一项再保存",
    ocr_button: "📷 上传截图自动识别",
    ocr_hint: "选一张体脂秤App那一屏的截图，自动识别这11项数值（识别后请扫一眼核对）。",
    ocr_recognizing: "识别中… {p}%",
    ocr_done: "已自动填入，请核对后保存 ✅",
    ocr_failed: "识别失败，请手动填写。",
    wf_weight: "体重", wf_bmi: "BMI", wf_body_fat_pct: "体脂率", wf_muscle_pct: "肌肉率",
    wf_fat_free_mass: "去脂体重", wf_subcutaneous_fat_pct: "皮下脂肪", wf_visceral_fat: "内脏脂肪（指数）",
    wf_body_water_pct: "体水分", wf_skeletal_muscle_pct: "骨骼肌率", wf_muscle_mass: "肌肉量", wf_bone_mass: "骨量",

    diet_q: "今晚是否按食谱吃了？",
    already_checked: "今天已打过卡，可重新选择覆盖。",
    yes_btn: "是 ✅", no_btn: "否 ✕",
    reason_label: "没按食谱的原因",
    reason_ph: "如：在外面吃饭 / 加班点了外卖",
    save_check: "保存打卡",
    pick_yes_no: "先选「是」或「否」",
    check_done: "打卡完成 ✅",

    hist_strength: "力量训练", hist_weight: "体重 / 体成分", hist_diet: "饮食打卡",
    completed_n_of_m: "完成 {done}/{total} 个动作",
    no_strength: "还没有训练记录",
    no_weight: "还没有体重记录",
    no_diet: "还没有饮食记录",
    body_fat_short: "体脂 {v}%",
    diet_yes_label: "✅ 按食谱吃了", diet_no_label: "✕ 未按食谱",

    storage_section: "数据存储位置",
    storage_local_status: "保存在本机",
    storage_drive_status: "正在与 Google 云端硬盘同步",
    connect_drive: "连接 Google 云端硬盘",
    disconnect_drive: "断开连接",
    drive_local_hint: "现在数据保存在本机。连接 Google 云端硬盘后，可与 iPhone 等其他设备同步数据。",
    drive_connecting: "连接中…",
    drive_syncing: "同步中…",
    drive_synced: "已同步 ✅",
    drive_error: "同步出错，请重新连接一次。",
    drive_connect_failed: "连接失败，请再试一次。",
    drive_disconnect_confirm: "断开与 Google 云端硬盘的同步？（已上传的数据不会被删除）",

    save: "保存",
  },
};
