const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('returns manifest from fallback path when it is newer', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-api-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const fallbackPath = path.join(tmpDir, 'fallback.json');

  const originalManifestEnv = process.env.MANIFEST_PATH;
  const originalFallbackEnv = process.env.MANIFEST_FALLBACK_PATH;

  process.env.MANIFEST_PATH = manifestPath;
  process.env.MANIFEST_FALLBACK_PATH = fallbackPath;

  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../manifest')];

  try {
    fs.writeFileSync(manifestPath, JSON.stringify({ rev: 1, tabs: [], updatedAt: '2024-01-01T00:00:00Z' }));
    fs.writeFileSync(fallbackPath, JSON.stringify({ rev: 2, tabs: [{ id: 'x', title: 'New', type: 'link', url: 'https://example.com' }], updatedAt: '2024-01-02T00:00:00Z' }));

    const older = Date.now() - 10_000;
    const newer = Date.now();
    fs.utimesSync(manifestPath, older / 1000, older / 1000);
    fs.utimesSync(fallbackPath, newer / 1000, newer / 1000);

    const handler = require('../manifest');
    const req = { query: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.rev, 2);
    assert.equal(res.headers['X-Manifest-Path'], path.relative(process.cwd(), fallbackPath));
  } finally {
    if (originalManifestEnv === undefined) {
      delete process.env.MANIFEST_PATH;
    } else {
      process.env.MANIFEST_PATH = originalManifestEnv;
    }
    if (originalFallbackEnv === undefined) {
      delete process.env.MANIFEST_FALLBACK_PATH;
    } else {
      process.env.MANIFEST_FALLBACK_PATH = originalFallbackEnv;
    }
    delete require.cache[require.resolve('../manifest')];
    delete require.cache[require.resolve('../config')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('returns 404 when no manifest is available', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-api-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const fallbackPath = path.join(tmpDir, 'fallback.json');

  const originalManifestEnv = process.env.MANIFEST_PATH;
  const originalFallbackEnv = process.env.MANIFEST_FALLBACK_PATH;

  process.env.MANIFEST_PATH = manifestPath;
  process.env.MANIFEST_FALLBACK_PATH = fallbackPath;

  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../manifest')];

  try {
    const handler = require('../manifest');
    const req = { query: {} };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Manifest not found' });
  } finally {
    if (originalManifestEnv === undefined) {
      delete process.env.MANIFEST_PATH;
    } else {
      process.env.MANIFEST_PATH = originalManifestEnv;
    }
    if (originalFallbackEnv === undefined) {
      delete process.env.MANIFEST_FALLBACK_PATH;
    } else {
      process.env.MANIFEST_FALLBACK_PATH = originalFallbackEnv;
    }
    delete require.cache[require.resolve('../manifest')];
    delete require.cache[require.resolve('../config')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
