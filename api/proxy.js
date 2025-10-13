const http = require('http');
const https = require('https');
const { URL } = require('url');
const { hostAllowed } = require('./config');

module.exports = (req, res) => {
  const rawUrl = req.query && req.query.url ? String(req.query.url).trim() : '';
  if (!rawUrl) {
    res.status(400).send('missing url');
    return;
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch (err) {
    res.status(400).send('bad url');
    return;
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    res.status(400).send('bad scheme');
    return;
  }

  if (!hostAllowed(target.hostname)) {
    res.status(403).send('host not allowed');
    return;
  }

  const client = target.protocol === 'https:' ? https : http;

  const request = client.get(
    target,
    {
      headers: {
        'User-Agent': 'BossTabsProxy/1.0',
      },
      timeout: 30000,
    },
    (upstream) => {
      const statusCode = upstream.statusCode || 200;
      if (statusCode >= 400) {
        upstream.resume();
        res.status(502).send('upstream error');
        return;
      }

      const contentType = upstream.headers['content-type'] || 'application/octet-stream';

      res.status(200);
      res.setHeader('Content-Type', contentType);
      if (upstream.headers['content-length']) {
        res.setHeader('Content-Length', upstream.headers['content-length']);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'no-referrer');

      upstream.pipe(res);
      upstream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).send('upstream error');
        } else {
          res.end();
        }
      });
    }
  );

  request.on('timeout', () => {
    request.destroy(new Error('timeout'));
  });

  request.on('error', () => {
    if (!res.headersSent) {
      res.status(502).send('upstream error');
    } else {
      res.end();
    }
  });
};
