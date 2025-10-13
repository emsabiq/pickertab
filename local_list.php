<?php
header('Content-Type: application/json; charset=utf-8');

// Akar folder aset di server dan base URL-nya.
$ROOT = realpath(__DIR__ . '/assets');
$BASE_URL = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/assets';

$ALLOWED_EXT = ['pdf','png','jpg','jpeg','webp','svg'];

if ($ROOT === false || !is_dir($ROOT)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Folder assets tidak ditemukan']);
  exit;
}

function safe_path($rel) {
  $rel = trim($rel, "/\\\t\n\r\0\x0B");
  $rel = ltrim($rel, '/'); // relatif
  if (strpos($rel, '..') !== false) return '';
  return $rel;
}
function starts_with($s, $p){ return strncmp($s, $p, strlen($p)) === 0; }

$rel = isset($_GET['path']) ? safe_path($_GET['path']) : '';
$full = realpath($ROOT . ($rel ? '/' . $rel : ''));

if ($full === false || !starts_with($full, $ROOT)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Path tidak valid']);
  exit;
}
if (!is_dir($full)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Bukan direktori']);
  exit;
}

$entries = @scandir($full);
if ($entries === false) { $entries = []; }

$dirs = [];
$files = [];
foreach ($entries as $name) {
  if ($name === '.' || $name === '..') continue;
  if ($name[0] === '.') continue; // sembunyikan dotfiles
  $p = $full . '/' . $name;
  $relPath = $rel ? ($rel . '/' . $name) : $name;
  if (is_dir($p)) {
    $dirs[] = [
      'type' => 'dir',
      'name' => $name,
      'path' => $relPath,
    ];
  } else if (is_file($p)) {
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, $ALLOWED_EXT, true)) continue;
    $url = $BASE_URL . '/' . str_replace(['\\'], ['%5C'], $relPath);
    $files[] = [
      'type' => 'file',
      'name' => $name,
      'path' => $relPath,
      'size' => @filesize($p) ?: null,
      'url'  => $url,
      'ext'  => $ext,
    ];
  }
}

// urutkan alfabetis
usort($dirs, function($a,$b){ return strcasecmp($a['name'],$b['name']); });
usort($files, function($a,$b){ return strcasecmp($a['name'],$b['name']); });

$items = array_merge($dirs, $files);

echo json_encode([
  'ok' => true,
  'root' => '/assets',
  'path' => $rel,
  'items' => $items,
], JSON_UNESCAPED_SLASHES);
