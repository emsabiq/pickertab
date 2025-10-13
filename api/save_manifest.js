const fs = require('fs');
const { ADMIN_PIN, MANIFEST_PATH } = require('./config');

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

    const tmpPath = `${MANIFEST_PATH}.tmp`;
    const json = JSON.stringify(manifest, null, 2);

    await fs.promises.writeFile(tmpPath, json, { encoding: 'utf8' });
    await fs.promises.rename(tmpPath, MANIFEST_PATH);

    res.status(200).json({ ok: true, manifest });
  } catch (err) {
    try {
      await fs.promises.unlink(`${MANIFEST_PATH}.tmp`);
    } catch (e) {
      // ignore
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
