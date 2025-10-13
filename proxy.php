<?php
require_once __DIR__ . '/config.php';

function host_allowed($host) {
  $host = strtolower($host);
  foreach (ALLOWED_HOSTS as $h) {
    $h = strtolower($h);
    if ($host === $h || ends_with($host, '.'.$h)) return true;
  }
  return false;
}

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
if (!$url) { http_response_code(400); echo 'missing url'; exit; }

$parts = parse_url($url);
if (!$parts || empty($parts['scheme']) || empty($parts['host'])) { http_response_code(400); echo 'bad url'; exit; }
if (!in_array($parts['scheme'], ['http','https'], true)) { http_response_code(400); echo 'bad scheme'; exit; }
if (!host_allowed($parts['host'])) { http_response_code(403); echo 'host not allowed'; exit; }

$ctx = stream_context_create([
  'http' => [
    'method' => 'GET',
    'timeout' => 30,
    'header' => "User-Agent: BossTabsProxy/1.0\r\n",
  ]
]);
$data = @file_get_contents($url, false, $ctx);
if ($data === false) { http_response_code(502); echo 'upstream error'; exit; }

$contentType = 'application/octet-stream';
$meta = $http_response_header ?? [];
foreach ($meta as $h) {
  if (stripos($h, 'Content-Type:') === 0) { $contentType = trim(substr($h, 13)); break; }
}

header('Content-Type: ' . $contentType);
header('Cache-Control: no-store');
header('Content-Disposition: inline');
echo $data;
