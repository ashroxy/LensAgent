/**
 * vision_model.js - Member 1 Local Vision Model (WebGPU ONNX)
 * 
 * Runs on-device WebGPU Vision inference and formats predictions into customMlBoxes.
 */

export class LocalVisionModel {
  constructor(options = {}) {
    this.threshold = options.threshold ?? 0.15;
    this.classes = options.classes ?? [
      'face',
      'human face',
      'profile photo',
      'credit card',
      'id card',
      'driver license',
      'qr code'
    ];
  }

  /**
   * Transforms raw model bounding boxes to the team standard customMlBoxes schema
   * @param {Array} rawDetections - Array of { box: {xmin, ymin, xmax, ymax}, label, score }
   * @returns {Array<{id: string, category: string, boundingBox: {x: number, y: number, width: number, height: number}, redactionLabel: string}>}
   */
  static formatDetections(rawDetections = []) {
    return rawDetections.map((det, index) => {
      const idx = index + 1;
      const label = (det.label || 'OBJECT').toLowerCase();
      
      let category = 'VISUAL_PII';
      if (label.includes('face') || label.includes('photo')) category = 'FACE_AVATAR';
      else if (label.includes('card')) category = 'CREDIT_CARD';
      else if (label.includes('id') || label.includes('license')) category = 'ID_DOCUMENT';
      else if (label.includes('qr')) category = 'QR_CODE';

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

  /**
   * Runs local WebGPU inference via Chrome Extension Offscreen worker
   * @param {string} rawScreenshotBase64
   * @returns {Promise<Array>} customMlBoxes
   */
  async detect(rawScreenshotBase64) {
    const dataUrl = rawScreenshotBase64.startsWith('data:') 
      ? rawScreenshotBase64 
      : `data:image/jpeg;base64,${rawScreenshotBase64}`;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'RUN_VISION_DETECTION',
          dataUrl: dataUrl,
          classes: this.classes,
          threshold: this.threshold
        },
        (response) => {
          if (chrome.runtime.lastError || !response || response.error) {
            const errMsg = response?.error || chrome.runtime.lastError?.message || 'Unknown VisionModel Error';
            console.error('[VisionModel Error]:', errMsg);
            reject(new Error(errMsg));
          } else {
            resolve(response.customMlBoxes || []);
          }
        }
      );
    });
  }
}
