/**
 * In-process Mock Backend Server for LensAgent E2E Testing
 * Implements FastAPI backend contracts from backend_contracts.md
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export class MockBackendServer {
  constructor(options = {}) {
    this.port = options.port || 8000;
    this.server = null;
    this.receivedRequests = [];
    this.nextInferAction = {
      thought: "Executed test action successfully.",
      action_plan: { type: "FINISH", detail: "Task successfully completed in test." }
    };
    this.healthStatus = {
      status: "ok",
      vlm_status: "ok",
      gpu_accelerated: true,
      version: "1.1.0"
    };
    this.shouldFailHealth = false;
    this.healthErrorCode = 500;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          return res.end();
        }

        const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
        const pathname = url.pathname;

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          let parsedBody = null;
          if (body) {
            try { parsedBody = JSON.parse(body); } catch (_) { parsedBody = body; }
          }

          this.receivedRequests.push({
            method: req.method,
            pathname,
            query: Object.fromEntries(url.searchParams),
            headers: req.headers,
            body: parsedBody,
            timestamp: Date.now()
          });

          if ((pathname === '/health' || pathname === '/api/health') && req.method === 'GET') {
            if (this.shouldFailHealth) {
              res.writeHead(this.healthErrorCode, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ detail: "Server error simulated" }));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(this.healthStatus));
          }

          if (pathname === '/api/v1/session' && req.method === 'POST') {
            const sessId = parsedBody?.session_id || `sess_${Date.now()}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              session_id: sessId,
              status: "RUNNING",
              created_at: new Date().toISOString()
            }));
          }

          if (pathname.startsWith('/api/v1/session/') && req.method === 'GET') {
            const sessId = pathname.split('/').pop();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              session_id: sessId,
              status: "RUNNING",
              history: [],
              metrics: { frames: 10, redactions: 2 }
            }));
          }

          if (pathname.startsWith('/api/v1/session/') && req.method === 'DELETE') {
            const sessId = pathname.split('/').pop();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              status: "deleted",
              session_id: sessId
            }));
          }

          if (pathname === '/api/v1/infer' && req.method === 'POST') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(this.nextInferAction));
          }

          if (pathname.startsWith('/sandbox/')) {
            const filename = pathname.replace('/sandbox/', '');
            const filePath = path.resolve('project', 'testing', filename);
            if (fs.existsSync(filePath)) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              return res.end(fs.readFileSync(filePath));
            }
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ detail: 'Not found' }));
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  setNextInferAction(action) {
    this.nextInferAction = action;
  }

  setHealthFailure(fail = true, code = 500) {
    this.shouldFailHealth = fail;
    this.healthErrorCode = code;
  }

  getReceivedRequests(pathnameFilter = null) {
    if (!pathnameFilter) return [...this.receivedRequests];
    return this.receivedRequests.filter(r => r.pathname === pathnameFilter);
  }

  clearRequests() {
    this.receivedRequests = [];
  }
}
