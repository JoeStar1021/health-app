// ============================================================
// ocr.js —— 体脂秤截图识别（本地、免费，用 Tesseract.js）
// ------------------------------------------------------------
// 思路（对应项目文档 4.1/4.3 方案二）：
//   1) 裁掉顶部手机状态栏（去掉时间/电量这类干扰数字）。
//   2) OCR 整张图。
//   3) 按阅读顺序抽出所有「带小数的数字」——正好对应那 11 项指标，
//      顺序固定（体重→…→骨量），所以截图上下平移都不影响。
//   4) 返回数组，交给界面按 WEIGHT_FIELDS 顺序填入、用户核对后保存。
// 识别结果不强求 100% 准，所以保留「填好后人工核对」这一步。
// 将来若想更准，可在此处切换为 AI 视觉方案（文档 4.3 方案一）。
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

// 读入图片 → 裁掉顶部状态栏 → 返回 canvas
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

/**
 * 识别体脂秤截图，返回「带一位/两位小数的数字」字符串数组（按从上到下顺序）。
 * @param {File} file 用户选的截图
 * @param {(p:number)=>void} onProgress 识别进度 0~1
 */
export async function extractNumbersFromImage(file, onProgress) {
  await loadTesseract();
  const canvas = await fileToCroppedCanvas(file);
  const { data } = await window.Tesseract.recognize(canvas, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  const text = (data && data.text) || "";
  // 抽出形如 97.3 / 31.4 / 3.4 的数字（带小数点），按出现顺序
  const matches = text.match(/\d{1,3}\.\d{1,2}/g) || [];
  return matches;
}
