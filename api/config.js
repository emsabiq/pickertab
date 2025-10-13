const path = require('path');

const DEFAULT_ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'githubusercontent.com',
  'github.io',
  'drive.google.com',
  'lh3.googleusercontent.com',
];

function parseHosts(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
}

const ADMIN_PIN = process.env.ADMIN_PIN ? String(process.env.ADMIN_PIN) : '123456';
const MANIFEST_PATH = process.env.MANIFEST_PATH
  ? path.resolve(process.cwd(), process.env.MANIFEST_PATH)
  : path.resolve(process.cwd(), 'manifest.json');
const MANIFEST_FALLBACK_PATH = process.env.MANIFEST_FALLBACK_PATH
  ? path.resolve(process.cwd(), process.env.MANIFEST_FALLBACK_PATH)
  : null;

const envHosts = parseHosts(process.env.ALLOWED_HOSTS);
const ALLOWED_HOSTS = envHosts.length ? envHosts : DEFAULT_ALLOWED_HOSTS;

function endsWith(haystack, needle) {
  if (!needle) return true;
  return haystack.endsWith(needle);
}

function hostAllowed(host) {
  if (!host) return false;
  const lower = host.toLowerCase();
  return ALLOWED_HOSTS.some((h) => {
    const cmp = h.toLowerCase();
    return lower === cmp || endsWith(lower, `.${cmp}`);
  });
}

module.exports = {
  ADMIN_PIN,
  MANIFEST_PATH,
  MANIFEST_FALLBACK_PATH,
  ALLOWED_HOSTS,
  hostAllowed,
};
