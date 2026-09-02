const fs = require('fs');
let content = fs.readFileSync('lib/capture.js', 'utf8');

content = content.replace(
  /this\._onFrame\(\{\s*base64:\s*data,\s*metadata,\s*timestamp:\s*Date\.now\(\),\s*epoch:\s*this\.epoch,\s*frameId:\s*this\._metrics\.totalFrames,\s*quality:\s*this\._metrics\.currentQuality,\s*\}\);/,
  'this._onFrame({ base64: data, buffer: this._base64ToArrayBuffer(data), metadata, timestamp: Date.now(), epoch: this.epoch, frameId: this._metrics.totalFrames, quality: this._metrics.currentQuality });'
);

fs.writeFileSync('lib/capture.js', content);
