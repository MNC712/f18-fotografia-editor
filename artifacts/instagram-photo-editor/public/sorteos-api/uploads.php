<?php
declare(strict_types=1);

/** Private uploads are decoded and re-encoded, never stored as supplied PHP/SVG/etc. */
function storePrizeImage(array $file, string $directory): string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) throw new RaffleError('No se pudo recibir la imagen. Revisa el límite de subida del hosting.');
    if (!is_uploaded_file($file['tmp_name']) || $file['size'] > 8 * 1024 * 1024) throw new RaffleError('La imagen debe pesar como máximo 8 MB.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($types[$mime])) throw new RaffleError('Solo se admiten imágenes JPEG, PNG y WebP reales.');
    $size = @getimagesize($file['tmp_name']);
    if (!$size || $size[0] < 1 || $size[1] < 1 || $size[0] * $size[1] > 20000000) {
        throw new RaffleError('La imagen no es válida o supera los 20 megapíxeles.');
    }
    $image = match ($mime) {
        'image/jpeg' => @imagecreatefromjpeg($file['tmp_name']),
        'image/png' => @imagecreatefrompng($file['tmp_name']),
        'image/webp' => @imagecreatefromwebp($file['tmp_name']),
    };
    if (!$image) throw new RaffleError('No se pudo decodificar la imagen.');
    // Keep JPEG phone photos upright before dropping EXIF metadata.
    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($file['tmp_name']);
        $orientation = (int)($exif['Orientation'] ?? 1);
        if (in_array($orientation, [2, 4, 5, 7], true)) imageflip($image, IMG_FLIP_HORIZONTAL);
        $angle = match ($orientation) { 3, 4 => 180, 5, 6 => -90, 7, 8 => 90, default => 0 };
        if ($angle) {
            $rotated = imagerotate($image, $angle, 0);
            if ($rotated) { imagedestroy($image); $image = $rotated; }
        }
    }
    imagealphablending($image, false); imagesavealpha($image, true);
    $key = bin2hex(random_bytes(24)) . '.' . $types[$mime];
    $path = $directory . '/' . $key;
    try {
        $ok = match ($mime) {
            'image/jpeg' => imagejpeg($image, $path, 100),
            'image/png' => imagepng($image, $path, 6),
            'image/webp' => imagewebp($image, $path, IMG_WEBP_LOSSLESS),
        };
        if (!$ok) throw new RaffleError('No se pudo guardar la foto del premio.', 503);
        chmod($path, 0600);
    } finally { imagedestroy($image); }
    return $key;
}

function imagePath(string $directory, string $key): string {
    if (!preg_match('/^[a-f0-9]{48}\.(jpg|png|webp)$/D', $key)) throw new RaffleError('Imagen no válida.', 404);
    return $directory . '/' . $key;
}
