<?php
// OPTIONAL: defaults already use ../f18-private/ outside DOCUMENT_ROOT.
// Copy OUTSIDE public_html to ../f18-private/config.php only to customize paths.
// No database, password or credentials are needed.
return [
    'data_file' => __DIR__ . '/sorteos.json',
    'upload_dir' => __DIR__ . '/prizes',
    'require_https' => true,
];
