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

test('falls back when rename fails with EACCES', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-manifest-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const originalAdminPin = process.env.ADMIN_PIN;
  const originalManifestPath = process.env.MANIFEST_PATH;
  const originalFallbackPath = process.env.MANIFEST_FALLBACK_PATH;

  process.env.ADMIN_PIN = 'PIN123';
  process.env.MANIFEST_PATH = manifestPath;

  // Ensure modules use updated environment variables.
  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../save_manifest')];

  const renameError = new Error('permission denied');
  renameError.code = 'EACCES';

  const originalRename = fs.promises.rename;
  let renameCallCount = 0;
  fs.promises.rename = async (...args) => {
    renameCallCount += 1;
    throw renameError;
  };

  const req = {
    body: {
      pin: 'PIN123',
      tabs: [
        {
          id: 'tab-1',
          title: 'Example',
          type: 'link',
          url: 'https://example.com',
        },
      ],
      activeIndex: 0,
    },
  };
  const res = createMockRes();

  try {
    const saveManifest = require('../save_manifest');
    await saveManifest(req, res);

    assert.equal(renameCallCount, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.manifest.rev, 1);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.rev, 1);
    assert.equal(fs.existsSync(`${manifestPath}.tmp`), false);
  } finally {
    fs.promises.rename = originalRename;
    if (originalAdminPin === undefined) {
      delete process.env.ADMIN_PIN;
    } else {
      process.env.ADMIN_PIN = originalAdminPin;
    }
    if (originalManifestPath === undefined) {
      delete process.env.MANIFEST_PATH;
    } else {
      process.env.MANIFEST_PATH = originalManifestPath;
    }
    if (originalFallbackPath === undefined) {
      delete process.env.MANIFEST_FALLBACK_PATH;
    } else {
      process.env.MANIFEST_FALLBACK_PATH = originalFallbackPath;
    }
    delete require.cache[require.resolve('../save_manifest')];
    delete require.cache[require.resolve('../config')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('falls back to direct write when tmp write fails with EACCES', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-manifest-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const originalAdminPin = process.env.ADMIN_PIN;
  const originalManifestPath = process.env.MANIFEST_PATH;
  const originalFallbackPath = process.env.MANIFEST_FALLBACK_PATH;

  process.env.ADMIN_PIN = 'PIN123';
  process.env.MANIFEST_PATH = manifestPath;
  delete process.env.MANIFEST_FALLBACK_PATH;

  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../save_manifest')];

  const originalWriteFile = fs.promises.writeFile;
  let tmpWriteAttempts = 0;
  fs.promises.writeFile = async (targetPath, ...args) => {
    if (targetPath.endsWith('.tmp')) {
      tmpWriteAttempts += 1;
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    }
    return originalWriteFile(targetPath, ...args);
  };

  const req = {
    body: {
      pin: 'PIN123',
      tabs: [
        {
          id: 'tab-1',
          title: 'Example',
          type: 'link',
          url: 'https://example.com',
        },
      ],
      activeIndex: 0,
    },
  };
  const res = createMockRes();

  try {
    const saveManifest = require('../save_manifest');
    await saveManifest(req, res);

    assert.equal(tmpWriteAttempts, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.warning.includes('non-atomic fallback'));

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.rev, 1);
    assert.equal(fs.existsSync(`${manifestPath}.tmp`), false);
  } finally {
    fs.promises.writeFile = originalWriteFile;
    if (originalAdminPin === undefined) {
      delete process.env.ADMIN_PIN;
    } else {
      process.env.ADMIN_PIN = originalAdminPin;
    }
    if (originalManifestPath === undefined) {
      delete process.env.MANIFEST_PATH;
    } else {
      process.env.MANIFEST_PATH = originalManifestPath;
    }
    if (originalFallbackPath === undefined) {
      delete process.env.MANIFEST_FALLBACK_PATH;
    } else {
      process.env.MANIFEST_FALLBACK_PATH = originalFallbackPath;
    }
    delete require.cache[require.resolve('../save_manifest')];
    delete require.cache[require.resolve('../config')];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
