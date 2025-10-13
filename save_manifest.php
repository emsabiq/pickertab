<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || !isset($data['pin']) || $data['pin'] !== ADMIN_PIN) {
  http_response_code(401);
  echo json_encode(['error' => 'Unauthorized']);
  exit;
}
if (!isset($data['tabs']) || !is_array($data['tabs'])) {
  http_response_code(400);
  echo json_encode(['error' => 'Invalid payload']);
  exit;
}

// Ambil manifest lama (kalau ada) untuk meneruskan rev
$old = null;
if (is_file(MANIFEST_PATH)) {
  $oldJson = @file_get_contents(MANIFEST_PATH);
  if ($oldJson !== false) {
    $old = json_decode($oldJson, true);
  }
}
$rev = isset($old['rev']) && is_numeric($old['rev']) ? ((int)$old['rev']) + 1 : 1;

// Sanitasi item
$tabs = [];
foreach ($data['tabs'] as $t) {
  if (!isset($t['id'],$t['title'],$t['type'],$t['url'])) continue;
  $type = in_array($t['type'], ['pdf','image','link'], true) ? $t['type'] : 'link';
  $tabs[] = [
    'id'    => substr(preg_replace('/[^a-zA-Z0-9-_]/','',$t['id']),0,64),
    'title' => trim((string)$t['title']),
    'type'  => $type,
    'url'   => trim((string)$t['url']),
  ];
}

$manifest = [
  'rev'         => $rev,
  'activeIndex' => isset($data['activeIndex']) ? (int)$data['activeIndex'] : 0,
  'tabs'        => $tabs,
  'updatedAt'   => gmdate('c'),
];

$tmp = MANIFEST_PATH . '.tmp';
$json = json_encode($manifest, JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);

if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
  http_response_code(500);
  echo json_encode(['error' => 'Write temp failed']);
  exit;
}
if (!@rename($tmp, MANIFEST_PATH)) {
  @unlink($tmp);
  http_response_code(500);
  echo json_encode(['error' => 'Atomic rename failed']);
  exit;
}

echo json_encode(['ok' => true, 'manifest' => $manifest]);
