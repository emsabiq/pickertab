<?php
// List isi /assets untuk dipakai di picker control.html
// Output: { ok: true, items: [ {type: 'dir'|'file', name, path, ext?, url?} ] }

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$ASSETS_DIR = realpath(__DIR__ . '/assets');    // folder fisik
if ($ASSETS_DIR === false) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'Folder /assets tidak ditemukan']); exit;
}

$req = isset($_GET['path']) ? $_GET['path'] : '';
$req = str_replace('\\','/',$req);
$req = trim($req, '/');

// cegah path traversal
if (strpos($req, '..') !== false) {
  http_response_code(400);
  echo json_encode(['ok'=>false,'error'=>'Path tidak valid']); exit;
}

$target = $ASSETS_DIR . ($req === '' ? '' : '/' . $req);
$targetReal = realpath($target);
if ($targetReal === false || strpos($targetReal, $ASSETS_DIR) !== 0) {
  http_response_code(404);
  echo json_encode(['ok'=>false,'error'=>'Path tidak ditemukan']); exit;
}

// Base URL untuk mengakses /assets di web (mendukung subfolder, mis. /boss-tabs)
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/'); // contoh: '' atau '/boss-tabs'
$ASSETS_URL = $basePath . '/assets';

$entries = @scandir($targetReal);
if ($entries === false) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'Gagal membaca direktori']); exit;
}

$dirs = [];
$files = [];
foreach ($entries as $name) {
  if ($name === '.' || $name === '..') continue;
  if (substr($name,0,1) === '.') continue; // sembunyikan dotfiles

  $full = $targetReal . '/' . $name;
  $relPath = ($req === '' ? $name : $req . '/' . $name);

  if (is_dir($full)) {
    $dirs[] = [
      'type' => 'dir',
      'name' => $name,
      'path' => $relPath,
    ];
  } else {
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $files[] = [
      'type' => 'file',
      'name' => $name,
      'path' => $relPath,
      'ext'  => $ext,
      'url'  => $ASSETS_URL . '/' . str_replace('%2F','/', rawurlencode($relPath)),
    ];
  }
}

// urutkan alfabet, folder dulu baru file
usort($dirs,  function($a,$b){ return strcasecmp($a['name'],$b['name']); });
usort($files, function($a,$b){ return strcasecmp($a['name'],$b['name']); });

echo json_encode(['ok'=>true, 'items'=>array_merge($dirs,$files)], JSON_UNESCAPED_SLASHES);
