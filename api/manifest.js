const { loadManifest, relativeManifestPath } = require('./lib/manifestLoader');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await loadManifest();
    if (!result) {
      res.status(404).json({ error: 'Manifest not found' });
      return;
    }

    res.setHeader('X-Manifest-Path', relativeManifestPath(result.path));
    res.status(200).json(result.manifest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load manifest' });
  }
};
