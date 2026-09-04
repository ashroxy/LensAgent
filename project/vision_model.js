import { runVisionDetection } from './dist/offscreen.bundle.js';

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

  static formatDetections(rawDetections = []) {
    // This format logic is now handled internally by runVisionDetection, 
    // but kept here for compatibility if needed.
    return rawDetections;
  }

  async detect(rawScreenshotBase64) {
    try {
      const response = await runVisionDetection(rawScreenshotBase64, this.classes, this.threshold);
      if (response && response.error) {
         console.error('[VisionModel Error]:', response.error);
         return [];
      }
      return response ? (response.customMlBoxes || []) : [];
    } catch (err) {
      console.error('[VisionModel Error]:', err);
      return [];
    }
  }
}
