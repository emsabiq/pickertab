// Daftar isi direktori assets untuk picker
const fs = require('fs');
const path = require('path');

function resolveAssetsRoot() {
  const baseDirs = [
    process.cwd(),
    __dirname,
    path.resolve(__dirname, '..'),
  ];

  const relPaths = [
    ['assets'],
    ['public', 'assets'],
  ];

  const candidates = [];
  const seen = new Set();

  for (const base of baseDirs) {
    for (const rel of relPaths) {
      const candidate = path.resolve(base, ...rel);
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
  }

  for (const dir of candidates) {
    try {
      const stat = fs.statSync(dir);
      if (stat && stat.isDirectory()) {
        return dir;
      }
    } catch (err) {
      // ignore missing directories, try the next candidate
    }
  }

  // fallback to the first candidate even if it doesn't exist yet so we
  // preserve the original directory structure expectations
  return candidates[0];
}

const handler = (req, res) => {
  try {
    const q = req.query || {};
    const reqPath = String(q.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

    const ASSETS_DIR = resolveAssetsRoot();

    // Cegah path traversal
    const target = path.resolve(ASSETS_DIR, reqPath);
    if (!target.startsWith(ASSETS_DIR)) {
      res.status(400).json({ ok:false, error:'Path tidak valid' }); return;
    }

    if (!fs.existsSync(target)) {
      if (!reqPath) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ ok:true, items: [] });
        return;
      }

      res.status(404).json({ ok:false, error:'Path tidak ditemukan' }); return;
    }

    const entries = fs.readdirSync(target, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const relPath = reqPath ? `${reqPath}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        dirs.push({ type:'dir', name: ent.name, path: relPath });
      } else {
        const ext = (path.extname(ent.name).slice(1) || '').toLowerCase();
        files.push({
          type:'file',
          name: ent.name,
          path: relPath,
          ext,
          url: `/assets/${encodeURI(relPath).replace(/%2F/g,'/')}`
        });
      }
    }

    dirs.sort((a,b)=>a.name.localeCompare(b.name, 'id', {sensitivity:'base'}));
    files.sort((a,b)=>a.name.localeCompare(b.name, 'id', {sensitivity:'base'}));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok:true, items:[...dirs, ...files] });
  } catch (e) {
    res.status(500).json({ ok:false, error:'Gagal membaca direktori' });
  }
};

module.exports = handler;
module.exports.config = {
  runtime: 'nodejs18.x',
  includeFiles: ['assets/**', 'public/assets/**'],
};
