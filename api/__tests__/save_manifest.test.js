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
  delete process.env.MANIFEST_FALLBACK_PATH;

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
    assert.equal(res.body.fallback, undefined);

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

test('writes manifest directly when tmp write fails with EACCES', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-manifest-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const tmpPath = `${manifestPath}.tmp`;
  const originalAdminPin = process.env.ADMIN_PIN;
  const originalManifestPath = process.env.MANIFEST_PATH;
  const originalFallbackPath = process.env.MANIFEST_FALLBACK_PATH;

  process.env.ADMIN_PIN = 'PIN123';
  process.env.MANIFEST_PATH = manifestPath;
  delete process.env.MANIFEST_FALLBACK_PATH;

  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../save_manifest')];

  const originalWriteFile = fs.promises.writeFile;
  const writeTargets = [];
  fs.promises.writeFile = async (targetPath, ...rest) => {
    writeTargets.push(targetPath);
    if (targetPath === tmpPath) {
      const err = new Error('permission denied');
      err.code = 'EACCES';
      throw err;
    }
    return originalWriteFile(targetPath, ...rest);
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

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.location, manifestPath);
    assert.equal(res.body.fallback.type, 'direct');
    assert.equal(res.body.fallback.reason, 'EACCES');
    assert.equal(res.body.fallback.originalPath, manifestPath);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.rev, 1);
    assert.equal(fs.existsSync(tmpPath), false);
    assert(writeTargets.includes(tmpPath));
    assert(writeTargets.includes(manifestPath));
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

test('writes to default fallback path when manifest is not writable', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-manifest-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const tmpPath = `${manifestPath}.tmp`;
  const defaultFallbackPath = path.join(os.tmpdir(), 'manifest.json');
  const originalAdminPin = process.env.ADMIN_PIN;
  const originalManifestPath = process.env.MANIFEST_PATH;
  const originalFallbackPath = process.env.MANIFEST_FALLBACK_PATH;
  const originalMkdir = fs.promises.mkdir;

  process.env.ADMIN_PIN = 'PIN123';
  process.env.MANIFEST_PATH = manifestPath;
  delete process.env.MANIFEST_FALLBACK_PATH;

  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../save_manifest')];

  const originalWriteFile = fs.promises.writeFile;
  const writeTargets = [];

  fs.promises.mkdir = async (targetPath, ...rest) => {
    if (targetPath === path.dirname(manifestPath)) {
      const err = new Error('read-only file system');
      err.code = 'EROFS';
      throw err;
    }
    return originalMkdir(targetPath, ...rest);
  };

  fs.promises.writeFile = async (targetPath, ...rest) => {
    writeTargets.push(targetPath);
    if (targetPath === tmpPath || targetPath === manifestPath) {
      const err = new Error('permission denied');
      err.code = 'EACCES';
      throw err;
    }
    return originalWriteFile(targetPath, ...rest);
  };

  let fallbackBackup = null;
  const fallbackExisted = fs.existsSync(defaultFallbackPath);
  if (fallbackExisted) {
    fallbackBackup = fs.readFileSync(defaultFallbackPath);
  }

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

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.location, defaultFallbackPath);
    assert.equal(res.body.fallback.type, 'alternate');
    assert.equal(res.body.fallback.reason, 'EACCES');
    assert.equal(res.body.fallback.originalPath, manifestPath);
    assert.equal(res.body.fallback.path, defaultFallbackPath);
    assert(writeTargets.includes(tmpPath));
    assert(writeTargets.includes(manifestPath));
    assert(writeTargets.includes(defaultFallbackPath));
    assert.equal(fs.existsSync(tmpPath), false);
    assert.equal(fs.existsSync(defaultFallbackPath), true);

    const manifest = JSON.parse(fs.readFileSync(defaultFallbackPath, 'utf8'));
    assert.equal(manifest.rev, 1);
  } finally {
    fs.promises.writeFile = originalWriteFile;
    fs.promises.mkdir = originalMkdir;
    if (fallbackExisted) {
      fs.writeFileSync(defaultFallbackPath, fallbackBackup);
    } else {
      try {
        fs.unlinkSync(defaultFallbackPath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }

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
