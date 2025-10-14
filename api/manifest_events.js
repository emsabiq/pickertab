const { loadManifest } = require('./lib/manifestLoader');

const HEARTBEAT_INTERVAL_MS = 15000;
const POLL_INTERVAL_MS = 1000;

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function writeEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  } else {
    res.write('\n');
  }

  let closed = false;
  let lastEmittedMtime = 0;

  async function pushUpdate(reason) {
    if (closed) return;
    try {
      const result = await loadManifest();
      if (!result || !result.manifest) return;

      const nextMtime = toNumber(result.mtimeMs) ?? Date.now();
      if (reason !== 'initial' && nextMtime <= lastEmittedMtime) {
        return;
      }

      lastEmittedMtime = nextMtime;
      writeEvent(res, {
        type: 'manifest-updated',
        rev: result.manifest.rev ?? null,
        updatedAt: result.manifest.updatedAt ?? null,
        mtime: nextMtime,
        reason,
        sentAt: Date.now(),
      });
    } catch (err) {
      writeEvent(res, {
        type: 'manifest-error',
        message: 'Failed to load manifest',
      });
    }
  }

  await pushUpdate('initial');

  const pollTimer = setInterval(() => {
    void pushUpdate('poll');
  }, POLL_INTERVAL_MS);

  const heartbeatTimer = setInterval(() => {
    if (closed) return;
    res.write(': heartbeat\n\n');
  }, HEARTBEAT_INTERVAL_MS);

  req.on('close', () => {
    closed = true;
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
  });
};
