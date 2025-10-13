// Daftar isi /public/assets untuk picker
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  try {
    const q = req.query || {};
    const reqPath = String(q.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

    const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
    const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');

    // Cegah path traversal
    const target = path.resolve(ASSETS_DIR, reqPath);
    if (!target.startsWith(ASSETS_DIR)) {
      res.status(400).json({ ok:false, error:'Path tidak valid' }); return;
    }

    if (!fs.existsSync(target)) {
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
