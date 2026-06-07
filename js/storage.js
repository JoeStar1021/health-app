// ============================================================
// storage.js —— 数据存储层（可替换后端）
// ------------------------------------------------------------
// 设计要点（对应项目文档 6.3）：所有读写都经过这一层。
// 第一版用「浏览器本地存储」后端；将来接 Google Drive 时，
// 只要写一个新的后端类、用 setBackend() 换上即可，
// 其余业务代码完全不用改。
// ============================================================

const LOCAL_PREFIX = "health_app_";

// —— 本地存储后端（第一版用这个）——
class LocalBackend {
  async load(key) {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  }
  async save(key, value) {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  }
}

// —— 未来：Google Drive 后端会长这样（先留个壳，第二步实现）——
// class DriveBackend {
//   async load(key) { /* 从用户网盘读 key.json */ }
//   async save(key, value) { /* 写回用户网盘 key.json */ }
// }

let backend = new LocalBackend();

/** 切换存储后端（将来接 Drive 时调用） */
export function setBackend(newBackend) {
  backend = newBackend;
}

/**
 * 统一的数据访问入口。
 * 每个「集合」对应文档里的一个数据文件：
 *   templates          训练日模板
 *   strength_sessions  力量训练记录  -> 将来导出为 strength.json
 *   weight             体重/体成分    -> 将来导出为 weight.json
 *   diet               饮食打卡       -> 将来导出为 diet.json
 *   settings           App 设置（如当前用户）
 */
export const Store = {
  async getCollection(name) {
    return (await backend.load(name)) || [];
  },
  async saveCollection(name, arr) {
    await backend.save(name, arr);
  },
  async getSettings() {
    return (await backend.load("settings")) || {};
  },
  async saveSettings(obj) {
    await backend.save("settings", obj);
  },
};
