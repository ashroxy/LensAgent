const fs = require('fs');
let content = fs.readFileSync('lib/capture.js', 'utf8');

const newFn = `  async _onScreencastFrame(params) {
    const { data, sessionId, metadata } = params;
    this._cdp("Page.screencastFrameAck", { sessionId }).catch(() => {});
    if (!this.isCapturing || !this._onFrame) return;

    this._metrics.totalFrames++;
    this._metrics.lastFrameTime = Date.now();
    this._metrics.bytesProcessed += data.length;
    this._frameTimestamps.push(Date.now());

    if (this.enableDelta) {
      const hash = this._fastHash(data);
      if (hash === this._prevFrameHash) {
        this._consecutiveSkips++;
        if (this._consecutiveSkips < this._maxConsecutiveSkips) {
          this._metrics.skippedFrames++;
          return;
        }
      }
      this._prevFrameHash = hash;
      this._consecutiveSkips = 0;
    }

    this._metrics.deliveredFrames++;

    const res = await fetch(\`data:image/jpeg;base64,\${data}\`);
    const buffer = await res.arrayBuffer();

    this._onFrame({
      buffer,
      base64: data,
      metadata,
      timestamp: Date.now(),
      epoch: this.epoch,
      frameId: this._metrics.totalFrames,
      quality: this._metrics.currentQuality,
    });
  }`;

const startIdx = content.indexOf('async _onScreencastFrame(params) {');
const endIdx = content.indexOf('_onFrameNavigated(params) {');
if (startIdx !== -1 && endIdx !== -1) {
  content = content.substring(0, startIdx) + newFn + "\n\n  " + content.substring(endIdx);
  fs.writeFileSync('lib/capture.js', content);
  console.log('Fixed capture.js');
} else {
  console.log('Indices not found', startIdx, endIdx);
}
