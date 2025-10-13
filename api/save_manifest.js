const fs = require('fs');
const path = require('path');
const {
  ADMIN_PIN,
  MANIFEST_PATH,
  MANIFEST_FALLBACK_PATH,
} = require('./config');

const WRITE_FALLBACK_CODES = new Set(['EACCES', 'EPERM', 'EROFS']);

class ManifestWriteError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ManifestWriteError';
    this.statusCode = options.statusCode || 500;
    this.expose = options.expose ?? true;
    this.details = options.details || null;
  }
}

function sanitizeId(value) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, 64);
}

function sanitizeTab(tab) {
  if (!tab || typeof tab !== 'object') return null;
  const { id, title, type, url } = tab;
  if (id === undefined || title === undefined || type === undefined || url === undefined) {
    return null;
  }
  const normalized = String(type ?? '').toLowerCase();
  const normalizedType = ['pdf', 'image', 'link'].includes(normalized) ? normalized : 'link';
  return {
    id: sanitizeId(id),
    title: String(title ?? '').trim(),
    type: normalizedType,
    url: String(url ?? '').trim(),
  };
}

async function readOldManifest() {
  try {
    const raw = await fs.promises.readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function ensureDirExists(filePath) {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function writeFallbackManifest(filePath, json, originalError) {
  await ensureDirExists(filePath);

  try {
    await fs.promises.writeFile(filePath, json, { encoding: 'utf8' });
    return {
      path: filePath,
      fallback: {
        type: 'direct',
        reason: originalError.code,
        originalPath: filePath,
        message: 'Atomic manifest write failed; wrote directly to manifest path instead.',
      },
    };
  } catch (directError) {
    if (MANIFEST_FALLBACK_PATH) {
      await ensureDirExists(MANIFEST_FALLBACK_PATH);
      await fs.promises.writeFile(MANIFEST_FALLBACK_PATH, json, { encoding: 'utf8' });
      return {
        path: MANIFEST_FALLBACK_PATH,
        fallback: {
          type: 'alternate',
          reason: originalError.code,
          originalPath: filePath,
          path: MANIFEST_FALLBACK_PATH,
          message: 'Atomic manifest write failed; wrote to alternate manifest path instead.',
        },
      };
    }

    throw new ManifestWriteError(
      `Unable to write manifest to ${filePath}. The path is not writable and no fallback path is configured.`,
      {
        statusCode: 500,
        details: {
          path: filePath,
          code: directError.code || originalError.code,
        },
      },
    );
  }
}

async function writeManifestFile(filePath, json) {
  const tmpPath = `${filePath}.tmp`;
  let tmpCreated = false;

  try {
    try {
      await fs.promises.writeFile(tmpPath, json, { encoding: 'utf8' });
      tmpCreated = true;
    } catch (err) {
      if (WRITE_FALLBACK_CODES.has(err.code)) {
        return await writeFallbackManifest(filePath, json, err);
      }
      throw err;
    }

    const renameFallbackCodes = ['EXDEV', 'EEXIST', 'EPERM', 'ENOTEMPTY', 'EACCES', 'EBUSY'];

    try {
      await fs.promises.rename(tmpPath, filePath);
      tmpCreated = false;
      return { path: filePath, fallback: null };
    } catch (err) {
      if (!renameFallbackCodes.includes(err.code)) {
        throw err;
      }
    }

    await fs.promises.copyFile(tmpPath, filePath);
    await fs.promises.unlink(tmpPath);
    tmpCreated = false;
    return { path: filePath, fallback: null };
  } finally {
    if (tmpCreated) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch (cleanupErr) {
        if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
      }
    }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (!body.pin || body.pin !== ADMIN_PIN) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!Array.isArray(body.tabs)) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const oldManifest = await readOldManifest();
    const rev = oldManifest && Number.isFinite(Number(oldManifest.rev))
      ? Number(oldManifest.rev) + 1
      : 1;

    const tabs = [];
    for (const tab of body.tabs) {
      const sanitized = sanitizeTab(tab);
      if (!sanitized) continue;
      tabs.push(sanitized);
    }

    const parsedActive = Number.parseInt(body.activeIndex, 10);

    const manifest = {
      rev,
      activeIndex: Number.isFinite(parsedActive) ? parsedActive : 0,
      tabs,
      updatedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(manifest, null, 2);

    await ensureDirExists(MANIFEST_PATH);
    const result = await writeManifestFile(MANIFEST_PATH, json);

    const responseBody = { ok: true, manifest };
    if (result && result.fallback) {
      responseBody.fallback = result.fallback;
      responseBody.location = result.path;
    }

    res.status(200).json(responseBody);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const expose = err.expose ?? false;
    const payload = {
      error: expose ? err.message : 'Internal Server Error',
    };

    if (expose && err.details) {
      payload.details = err.details;
    }

    res.status(statusCode).json(payload);
  }
};
