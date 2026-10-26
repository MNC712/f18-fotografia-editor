<?php
// Copy OUTSIDE public_html to ../f18-private/config.php, edit there (never commit).
// This example contains no real credentials.
return [
    'dsn' => 'mysql:host=localhost;dbname=YOUR_DATABASE;charset=utf8mb4',
    'user' => 'YOUR_DATABASE_USER',
    'password' => 'SET_ONLY_ON_YOUR_HOSTING',
    'upload_dir' => __DIR__ . '/prizes',
    'require_https' => true,
];
