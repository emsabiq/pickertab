const fs = require('fs');
const path = require('path');
const { ADMIN_PIN, MANIFEST_PATH, MANIFEST_FALLBACK_PATH } = require('./config');

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

async function writeManifestFile(filePath, json) {
  const tmpPath = `${filePath}.tmp`;
  const writeFallbackCodes = new Set(['EACCES', 'EPERM', 'EROFS']);
  const renameFallbackCodes = ['EXDEV', 'EEXIST', 'EPERM', 'ENOTEMPTY', 'EACCES', 'EBUSY'];
  let tmpCreated = false;
  let cleanupError = null;

  try {
    await fs.promises.writeFile(tmpPath, json, { encoding: 'utf8' });
    tmpCreated = true;

    try {
      await fs.promises.rename(tmpPath, filePath);
      tmpCreated = false;
      return { path: filePath, fallback: false };
    } catch (err) {
      if (!renameFallbackCodes.includes(err.code)) {
        throw err;
      }
    }

    await fs.promises.copyFile(tmpPath, filePath);
    await fs.promises.unlink(tmpPath);
    tmpCreated = false;
    return { path: filePath, fallback: false };
  } catch (err) {
    if (writeFallbackCodes.has(err.code) && !tmpCreated) {
      const fallbackPath = MANIFEST_FALLBACK_PATH || filePath;
      await ensureDirExists(fallbackPath);
      try {
        await fs.promises.writeFile(fallbackPath, json, { encoding: 'utf8' });
      } catch (fallbackErr) {
        fallbackErr.code = fallbackErr.code || err.code;
        fallbackErr.originalError = err;
        fallbackErr.message = `Unable to write manifest to fallback path ${fallbackPath}: ${fallbackErr.message}`;
        throw fallbackErr;
      }

      return {
        path: fallbackPath,
        fallback: true,
        reason: err,
      };
    }

    throw err;
  } finally {
    if (tmpCreated) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch (cleanupErr) {
        if (cleanupErr && cleanupErr.code !== 'ENOENT') {
          cleanupError = cleanupErr;
        }
      }
    }

    if (cleanupError) {
      throw cleanupError;
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

    const payload = { ok: true, manifest };
    if (result.fallback) {
      payload.warning = result.path === MANIFEST_PATH
        ? `Manifest saved using non-atomic fallback. Check permissions for ${MANIFEST_PATH}.`
        : `Manifest saved to fallback path ${result.path}. Check permissions for ${MANIFEST_PATH}.`;
    }

    res.status(200).json(payload);
  } catch (err) {
    const message = err && err.message ? err.message : 'Unknown error';
    const code = err && err.code ? err.code : undefined;
    res.status(500).json({
      error: 'Failed to save manifest',
      message,
      code,
      manifestPath: MANIFEST_PATH,
      fallbackPath: MANIFEST_FALLBACK_PATH || null,
    });
  }
};
