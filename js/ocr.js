// ============================================================
// ocr.js —— 体脂秤截图识别（本地、免费，用 Tesseract.js）
// ------------------------------------------------------------
// v2（2026-06-13）针对「后面的字段（肌肉量/骨量）常常识别不到」的修复：
//   旧版用纯英文 OCR 整张图、再全局正则抓所有带小数的数字、按顺序填。
//   问题：中文标签/图标的笔画会被英文 OCR 误读成「带小数的数字」，这些
//   假数字混在前面，挤掉了名额，导致真正靠后的指标溢出、永远填不到。
//
// 新做法（两招）：
//   ① 给 Tesseract 设「数字白名单」(tessedit_char_whitelist)，只认 0-9 和小数点，
//      中文/图标几乎不会再被误读成数字 → 噪声大幅减少。
//   ② 逐行解析：体脂秤每一行右侧就是该指标的数值，所以「每行取最右边的那个
//      小数」= 该行指标值，从上到下排好 → 天然对齐 11 项，不再错位溢出。
//   带兜底：若逐行没抽到（个别图把数字挤成一行），退回全局顺序抽取。
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

// 从一行文字里取「最右边的小数」作为该行的指标值（数值在右、状态词在左）。
function lastDecimalInLine(line) {
  const ms = line.match(/\d{1,3}\.\d{1,2}/g);
  return ms ? ms[ms.length - 1] : null;
}

// 把识别文本解析成从上到下的数值数组。
function parseValues(text) {
  const values = [];
  for (const line of text.split(/\r?\n/)) {
    const v = lastDecimalInLine(line);
    if (v) values.push(v);
  }
  // 兜底：逐行抽得太少（有的图把数字挤成一行）→ 退回全局顺序抽取
  if (values.length < 6) {
    const all = text.match(/\d{1,3}\.\d{1,2}/g) || [];
    if (all.length > values.length) return all;
  }
  return values;
}

/**
 * 识别体脂秤截图，返回「带小数的指标值」字符串数组（按从上到下顺序）。
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
    // 只认数字和小数点，过滤掉中文标签/图标被误读成数字的噪声
    await worker.setParameters({ tessedit_char_whitelist: "0123456789." });
    const { data } = await worker.recognize(canvas);
    return parseValues((data && data.text) || "");
  } finally {
    await worker.terminate();
  }
}
