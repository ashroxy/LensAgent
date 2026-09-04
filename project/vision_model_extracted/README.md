# PrivacyEngine & WebGPU Vision Model Integration Pack

This package provides on-device, client-side privacy sanitization (<80ms) for Chrome Extensions with zero data leakage.

## 🚀 Quick Integration

### 1. For Member 1 (Vision Model Lead):
```javascript
import { PrivacyEngine } from "./privacy_engine.js";
import { LocalVisionModel } from "./vision_model.js";

const privacyEngine = new PrivacyEngine({ enableStrictZeroLeakage: true });
const visionModel = new LocalVisionModel({ threshold: 0.15 });

// 1. Pass detected visual bounding boxes:
const customMlBoxes = await visionModel.detect(rawScreenshotBase64);

// 2. Sanitize viewport in one line (combines DOM PII + ML boxes):
const { sanitizedImage, tokenMap, telemetry } = await privacyEngine.sanitizeViewport(
  rawScreenshotBase64,
  customMlBoxes,
  window.devicePixelRatio || 1
);

console.log(`Sanitized in ${telemetry.sanitizationLatencyMs}ms. Masked items: ${tokenMap.length}`);
```

### 2. For Member 4 (Backend LLM Lead - Zero Leakage Validator):
```javascript
import { PrivacyEngine } from "./privacy_engine.js";
const privacyEngine = new PrivacyEngine({ enableStrictZeroLeakage: true });

try {
  // Blocks unmasked Aadhaar, PAN, Passwords, Phones, or Cards
  privacyEngine.validatePayload(outgoingJsonPayload);
  
  // Safe to transmit over network
  await sendToBackend(outgoingJsonPayload);
} catch (err) {
  console.error("Payload blocked locally:", err.message);
}
```

### 3. File Manifest
- `privacy_engine.js`: Core engine (DOM ground truth + zero leakage validator).
- `vision_model.js`: Adapter that generates `customMlBoxes`.
- `dist/offscreen.bundle.js` & `offscreen.html`: WebGPU offscreen worker.
- `models/yolo_pii_nano.onnx`: 11.6 MB distilled PII detection model (~9.7ms latency).
- `test_demo.html`: Interactive in-browser test demo.
