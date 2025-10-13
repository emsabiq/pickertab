<?php
// ===== Konfigurasi Utama =====
const ADMIN_PIN = '123456'; // ganti PIN Anda
const MANIFEST_PATH = __DIR__ . '/manifest.json';

// Host yang diizinkan untuk diproxy (supaya bisa di-embed jika pakai sumber eksternal)
const ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'githubusercontent.com',
  'github.io',
  'drive.google.com',
  'lh3.googleusercontent.com',
];

// Helper polyfill
if (!function_exists('ends_with')) {
  function ends_with($haystack, $needle) {
    $len = strlen($needle);
    if ($len === 0) return true;
    return substr($haystack, -$len) === $needle;
  }
}
