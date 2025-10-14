const fs = require('fs');
const path = require('path');

const {
  MANIFEST_PATH,
  MANIFEST_FALLBACK_PATH,
} = require('../config');

const ACCESS_DENIED_CODES = new Set(['EACCES', 'EPERM', 'EROFS']);

async function tryReadManifest(filePath) {
  if (!filePath) return null;
  try {
    const [raw, stats] = await Promise.all([
      fs.promises.readFile(filePath, 'utf8'),
      fs.promises.stat(filePath),
    ]);

    return {
      path: filePath,
      manifest: JSON.parse(raw),
      mtimeMs: stats.mtimeMs,
    };
  } catch (err) {
    if (err && (err.code === 'ENOENT' || ACCESS_DENIED_CODES.has(err.code))) {
      return null;
    }
    throw err;
  }
}

async function loadManifest() {
  const candidates = [];

  if (MANIFEST_FALLBACK_PATH && MANIFEST_FALLBACK_PATH !== MANIFEST_PATH) {
    candidates.push(MANIFEST_FALLBACK_PATH);
  }

  candidates.push(MANIFEST_PATH);

  let chosen = null;

  for (const filePath of candidates) {
    const result = await tryReadManifest(filePath);
    if (!result) continue;

    if (!chosen || result.mtimeMs > chosen.mtimeMs) {
      chosen = result;
    }
  }

  return chosen;
}

function relativeManifestPath(targetPath) {
  if (!targetPath) return '';
  return path.relative(process.cwd(), targetPath);
}

module.exports = {
  loadManifest,
  tryReadManifest,
  relativeManifestPath,
};
