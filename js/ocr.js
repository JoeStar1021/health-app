// ============================================================
// ocr.js —— 体脂秤截图识别（本地、免费，用 Tesseract.js）
// ------------------------------------------------------------
// v3（2026-06-14，用用户真实截图调通）：
//   之前两版的坑（已修）：
//     · 纯英文 OCR 整图 + 全局抓「带小数的数字」→ 中文标签被误读成假数字、
//       且部分行的小数点会被漏读（如 31.5 读成 315），导致错位、尾部丢失。
//     · 加「数字白名单」反而把中文状态词（肥胖/高/标准）强行塞成数字，
//       粘到数值前面（96.1 → 896.1），更糟。
//   v3 做法（实测对这台体脂秤 11 项全中）：
//     ① 不用白名单。OCR 拿「词级坐标框」(recognize 的 blocks 输出)。
//     ② 只保留「以数字开头」的词 → 中文状态词、底部导航栏乱码(如 E24:)
//        自然被过滤掉。
//     ③ 按 y 坐标分行、每行取最右的那个数字词 = 该行指标值，从上到下排好。
//     ④ 该体脂秤每个数值都是 1 位小数；若某行小数点被漏读（如 315/658），
//        就在末位前补回小数点 → 31.5 / 65.8。
//   带兜底：若拿不到坐标框（引擎版本差异），退回逐行文本解析。
// 仍保留「识别后人工核对」这一步，不强求 100% 准。
// ============================================================

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TESSERACT_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("OCR 引擎加载失败（需要联网）"));
    document.head.appendChild(s);
  });
}

// 读入图片 → 裁掉顶部状态栏（时间/电量等干扰）→ 返回 canvas
function fileToCroppedCanvas(file, topCropFrac = 0.06) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cropY = Math.round(img.naturalHeight * topCropFrac);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight - cropY;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, cropY, img.naturalWidth, canvas.height,
        0, 0, img.naturalWidth, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("无法读取图片"));
    img.src = URL.createObjectURL(file);
  });
}

// 该体脂秤数值都是 1 位小数：没有小数点的就在末位前补回（315→31.5；658→65.8）。
function reformatValue(numStr) {
  if (numStr.includes(".")) return numStr;
  if (numStr.length >= 2) return numStr.slice(0, -1) + "." + numStr.slice(-1);
  return numStr;
}

// 从一个词里取「开头的数字」作为值；不是以数字开头（中文状态词、E24: 之类）→ null。
function valueFromWord(text) {
  const m = String(text).match(/^\d{1,4}(?:\.\d{1,2})?/);
  return m ? reformatValue(m[0]) : null;
}

// 主解析：用词级坐标框，按行取最右数字词，从上到下。
function parseFromBlocks(data) {
  const words = [];
  (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) =>
    (p.lines || []).forEach((l) => (l.words || []).forEach((w) => {
      const val = valueFromWord(w.text);
      if (val != null && w.bbox) words.push({ val, x: w.bbox.x0, y: w.bbox.y0 });
    }))));
  if (!words.length) return null;
  words.sort((a, b) => a.y - b.y);
  const rows = [];
  const ROW_GAP = 40; // y 相差 40px 内视为同一行
  for (const w of words) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(w.y - last.y) <= ROW_GAP) {
      if (w.x > last.x) { last.x = w.x; last.val = w.val; } // 同一行取更靠右的（数值在右）
    } else {
      rows.push({ ...w });
    }
  }
  return rows.map((r) => r.val);
}

// 兜底：没有坐标框时，逐行文本取最右数字。
function parseFromText(text) {
  const values = [];
  for (const line of text.split(/\r?\n/)) {
    const toks = line.match(/\d{1,4}(?:\.\d{1,2})?/g);
    if (toks) values.push(reformatValue(toks[toks.length - 1]));
  }
  return values;
}

/**
 * 识别体脂秤截图，返回指标值字符串数组（按从上到下顺序）。
 * @param {File} file 用户选的截图
 * @param {(p:number)=>void} onProgress 识别进度 0~1
 */
export async function extractNumbersFromImage(file, onProgress) {
  await loadTesseract();
  const canvas = await fileToCroppedCanvas(file);
  const worker = await window.Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    return parseFromBlocks(data) || parseFromText((data && data.text) || "");
  } finally {
    await worker.terminate();
  }
}
