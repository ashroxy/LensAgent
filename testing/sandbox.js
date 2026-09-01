import { PrivacyEngine } from '../privacy_engine.js';
import { LocalVisionModel } from '../vision_model.js';

// Initialize the exact modules used in production
const privacyEngine = new PrivacyEngine({ enableStrictZeroLeakage: true });
const visionModel = new LocalVisionModel({ threshold: 0.15 });

let uploadedBase64 = null;

const elUpload = document.getElementById('image-upload');
const elBtnRun = document.getElementById('btn-run-all');
const elStatusPipeline = document.getElementById('status-pipeline');
const elPreOutput = document.getElementById('pre-output');
const elImgOriginal = document.getElementById('img-original');
const elImgRedacted = document.getElementById('img-redacted');

const elTxtPayload = document.getElementById('txt-payload');
const elBtnValidate = document.getElementById('btn-validate');
const elStatusValidation = document.getElementById('status-validation');

// 1. Image Upload Handler
elUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    uploadedBase64 = event.target.result; // Data URI
    elImgOriginal.src = uploadedBase64;
    elImgOriginal.style.display = 'block';
    elImgRedacted.style.display = 'none';
    elBtnRun.disabled = false;
    elStatusPipeline.textContent = 'Image loaded. Ready to run.';
    elStatusPipeline.className = '';
  };
  reader.readAsDataURL(file);
});

// 2. Full Pipeline (Vision -> Privacy)
elBtnRun.addEventListener('click', async () => {
  if (!uploadedBase64) return;
  
  elStatusPipeline.textContent = '⏳ Step 1: Running WebGPU Vision Model...';
  elStatusPipeline.className = '';
  elBtnRun.disabled = true;

  try {
    // Member 1 - WebGPU Object Detection
    const t0 = performance.now();
    const mlBoxes = await visionModel.detect(uploadedBase64);
    const inferMs = Math.round(performance.now() - t0);
    
    elStatusPipeline.textContent = `⏳ Step 2: Running Zero-Leakage Privacy Engine (Detected ${mlBoxes.length} ML elements)...`;

    // Dummy DOM boxes just for testing integration logic
    const dummyDomBoxes = [
      {
        id: 'DOM_PII_SANDBOX_1',
        category: 'CREDIT_CARD',
        boundingBox: { x: 10, y: 10, width: 100, height: 20 },
        redactionLabel: '[REDACTED_DOM_CREDIT_CARD_#1]'
      }
    ];

    // Member 3 - Privacy Engine Redaction
    const t1 = performance.now();
    const { sanitizedImage, tokenMap, telemetry } = await privacyEngine.sanitizeViewport(
      uploadedBase64,
      [...mlBoxes, ...dummyDomBoxes],
      window.devicePixelRatio || 1
    );
    const redactMs = Math.round(performance.now() - t1);

    // Show Output
    elImgRedacted.src = sanitizedImage;
    elImgRedacted.style.display = 'block';
    
    elStatusPipeline.textContent = `✅ Pipeline Success! Inference: ${inferMs}ms, Redaction: ${redactMs}ms.`;
    elStatusPipeline.className = 'success';

    elPreOutput.textContent = JSON.stringify({
      telemetry,
      mlBoxes,
      tokenMap
    }, null, 2);

  } catch (error) {
    console.error(error);
    elStatusPipeline.textContent = `❌ Pipeline Failed (Fail-Closed): ${error.message}`;
    elStatusPipeline.className = 'error';
  } finally {
    elBtnRun.disabled = false;
  }
});

// 3. Payload Validator (Member 4)
elBtnValidate.addEventListener('click', () => {
  const payloadStr = elTxtPayload.value.trim();
  let payloadObj;
  
  try {
    payloadObj = JSON.parse(payloadStr);
  } catch (e) {
    elStatusValidation.textContent = '❌ Invalid JSON format!';
    elStatusValidation.className = 'error';
    return;
  }

  try {
    const isSafe = privacyEngine.validatePayload(payloadObj);
    if (isSafe) {
      elStatusValidation.textContent = '✅ Payload is Safe! No raw PII detected. Ready for network egress.';
      elStatusValidation.className = 'success';
    }
  } catch (error) {
    elStatusValidation.textContent = `❌ Privacy Block: ${error.message}`;
    elStatusValidation.className = 'error';
  }
});

console.log("Sandbox initialized.");
