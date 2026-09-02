const fs = require('fs');
let content = fs.readFileSync('lib/capture.js', 'utf8');

content = content.replace(
  '    this._onFrame({\\n      base64: data,\\n      metadata,\\n      timestamp: Date.now(),\\n      epoch: this.epoch,\\n      frameId: this._metrics.totalFrames,\\n      quality: this._metrics.currentQuality,\\n    });',
  '    this._onFrame({\\n      base64: data,\\n      buffer: this._base64ToArrayBuffer(data),\\n      metadata,\\n      timestamp: Date.now(),\\n      epoch: this.epoch,\\n      frameId: this._metrics.totalFrames,\\n      quality: this._metrics.currentQuality,\\n    });'
);

fs.writeFileSync('lib/capture.js', content);
