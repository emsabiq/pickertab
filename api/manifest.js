const fs = require('fs');
const path = require('path');
const {
  MANIFEST_PATH,
  MANIFEST_FALLBACK_PATH,
} = require('./config');

const ACCESS_DENIED = new Set(['EACCES', 'EPERM', 'EROFS']);

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
    if (err && (err.code === 'ENOENT' || ACCESS_DENIED.has(err.code))) {
      return null;
    }
    // Surface JSON parse errors or unexpected issues to the caller.
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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await loadManifest();
    if (!result) {
      res.status(404).json({ error: 'Manifest not found' });
      return;
    }

    res.setHeader('X-Manifest-Path', path.relative(process.cwd(), result.path));
    res.status(200).json(result.manifest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load manifest' });
  }
};
