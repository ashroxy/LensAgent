/**
 * vision_model.js - Member 1 Local Vision Model (WebGPU ONNX)
 * 
 * Runs on-device WebGPU/WASM Vision inference natively using onnxruntime-web
 * Completely offline using the local 12MB YOLO model.
 */

let ortSession = null;

function calculateIoU(b1, b2) {
  const xLeft = Math.max(b1.xmin, b2.xmin);
  const yTop = Math.max(b1.ymin, b2.ymin);
  const xRight = Math.min(b1.xmax, b2.xmax);
  const yBottom = Math.min(b1.ymax, b2.ymax);
  if (xRight < xLeft || yBottom < yTop) return 0.0;
  const intersection = (xRight - xLeft) * (yBottom - yTop);
  const a1 = (b1.xmax - b1.xmin) * (b1.ymax - b1.ymin);
  const a2 = (b2.xmax - b2.xmin) * (b2.ymax - b2.ymin);
  return intersection / (a1 + a2 - intersection);
}

export class LocalVisionModel {
  constructor(options = {}) {
    this.threshold = options.threshold ?? 0.15;
  }

  static formatDetections(rawDetections = []) {
    return rawDetections.map((det, index) => {
      const idx = index + 1;
      const category = 'VISUAL_PII'; // Generic visual PII label
      const x = Math.round(det.box.xmin);
      const y = Math.round(det.box.ymin);
      const width = Math.round(det.box.xmax - det.box.xmin);
      const height = Math.round(det.box.ymax - det.box.ymin);

      return {
        id: `ML_DETECTED_${category}_${idx}`,
        category: category,
        boundingBox: { x, y, width, height },
        redactionLabel: `[REDACTED_${category}_#${idx}]`
      };
    });
  }

  async initModel() {
    if (!ortSession) {
      if (typeof ort === 'undefined') {
        throw new Error("ONNX Runtime Web (ort) is not loaded!");
      }
      ort.env.wasm.wasmPaths = chrome.runtime.getURL('lib/ort/');
      ort.env.wasm.numThreads = 1; // Prevent fetching missing threaded wasm & avoid COOP/COEP issues
      
      try {
        // Use WASM directly (WebGPU requires ort.webgpu.min.js in v1.17+)
        ortSession = await ort.InferenceSession.create(chrome.runtime.getURL('models/yolo_pii_nano.onnx'), {
          executionProviders: ['wasm']
        });
        console.log("[LocalVisionModel] ONNX model loaded natively via WASM!");
      } catch(e) {
        console.error("Failed to load ONNX model:", e);
        throw e;
      }
    }
  }

  async detect(rawScreenshotBase64) {
    try {
      await this.initModel();

      const dataUrl = rawScreenshotBase64.startsWith('data:') 
        ? rawScreenshotBase64 
        : `data:image/jpeg;base64,${rawScreenshotBase64}`;

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });

      // YOLO typically uses 640x640, but this distilled model expects 256x256!
      const INPUT_SIZE = 256;
      const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
      const ctx = canvas.getContext('2d');
      
      // CRITICAL FIX: Preserve aspect ratio (Letterboxing) instead of squashing!
      // Squashing destroys aspect ratio and causes the model to predict massive bounding box widths.
      const scale = Math.min(INPUT_SIZE / img.width, INPUT_SIZE / img.height);
      const newW = Math.round(img.width * scale);
      const newH = Math.round(img.height * scale);
      const padX = (INPUT_SIZE - newW) / 2;
      const padY = (INPUT_SIZE - newH) / 2;
      
      // Fill with gray padding (standard YOLO padding)
      ctx.fillStyle = '#787878';
      ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
      ctx.drawImage(img, padX, padY, newW, newH);
      
      const imgData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

      // Preprocess image to float32 tensor [1, 3, 256, 256]
      const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
      for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
        float32Data[i] = imgData.data[i * 4] / 255.0;                           // R
        float32Data[INPUT_SIZE * INPUT_SIZE + i] = imgData.data[i * 4 + 1] / 255.0; // G
        float32Data[2 * INPUT_SIZE * INPUT_SIZE + i] = imgData.data[i * 4 + 2] / 255.0; // B
      }
      const tensor = new ort.Tensor('float32', float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);

      // Run inference
      const results = await ortSession.run({ images: tensor });
      const outputName = ortSession.outputNames[0];
      const output = results[outputName].data;
      const dims = results[outputName].dims; // e.g. [1, 84, 8400] for YOLOv8 or [1, 8400, 85] for YOLOv5

      let rawBoxes = [];
      
      // Scaling factors to map from padded 256x256 back to original image
      const rx = img.width / newW;
      const ry = img.height / newH;

      if (dims.length === 3 && dims[1] < dims[2]) {
        // YOLOv8 Format: [1, num_features, num_anchors]
        const num_features = dims[1];
        const num_anchors = dims[2];
        const num_classes = num_features - 4;

        for (let i = 0; i < num_anchors; i++) {
          let maxScore = 0;
          for (let c = 0; c < num_classes; c++) {
            const score = output[(4 + c) * num_anchors + i];
            if (score > maxScore) maxScore = score;
          }

          if (maxScore > this.threshold) {
            const xc = output[0 * num_anchors + i];
            const yc = output[1 * num_anchors + i];
            const w  = output[2 * num_anchors + i];
            const h  = output[3 * num_anchors + i];

            const xmin = ((xc - w / 2) - padX) * rx;
            const ymin = ((yc - h / 2) - padY) * ry;
            const xmax = ((xc + w / 2) - padX) * rx;
            const ymax = ((yc + h / 2) - padY) * ry;

            rawBoxes.push({ box: { xmin, ymin, xmax, ymax }, score: maxScore });
          }
        }
      } else if (dims.length === 3 && dims[1] > dims[2]) {
        // YOLOv5 Format: [1, num_anchors, num_features]
        const num_anchors = dims[1];
        const num_features = dims[2];
        const num_classes = num_features - 5;

        for (let i = 0; i < num_anchors; i++) {
          const objConf = output[i * num_features + 4];
          if (objConf < this.threshold) continue;
          
          let maxScore = 0;
          for (let c = 0; c < num_classes; c++) {
            const score = output[i * num_features + 5 + c] * objConf;
            if (score > maxScore) maxScore = score;
          }

          if (maxScore > this.threshold) {
            const xc = output[i * num_features + 0];
            const yc = output[i * num_features + 1];
            const w  = output[i * num_features + 2];
            const h  = output[i * num_features + 3];

            const xmin = ((xc - w / 2) - padX) * rx;
            const ymin = ((yc - h / 2) - padY) * ry;
            const xmax = ((xc + w / 2) - padX) * rx;
            const ymax = ((yc + h / 2) - padY) * ry;

            rawBoxes.push({ box: { xmin, ymin, xmax, ymax }, score: maxScore });
          }
        }
      }

      // NMS
      rawBoxes.sort((a, b) => b.score - a.score);
      const nmsBoxes = [];
      for (const b of rawBoxes) {
        let keep = true;
        for (const keepB of nmsBoxes) {
          if (calculateIoU(b.box, keepB.box) > 0.45) {
            keep = false;
            break;
          }
        }
        if (keep) nmsBoxes.push(b);
      }

      return LocalVisionModel.formatDetections(nmsBoxes);
    } catch (err) {
      console.error('[VisionModel Error]:', err);
      throw err;
    }
  }
}
