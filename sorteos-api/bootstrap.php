<?php
declare(strict_types=1);

final class RaffleError extends RuntimeException {
    public int $status;
    public array $duplicates;
    public function __construct(string $message, int $status = 422, array $duplicates = []) {
        parent::__construct($message);
        $this->status = $status;
        $this->duplicates = $duplicates;
    }
}

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function authorize(): void {
    // Only the WEB SERVER may set this after validating Ferozo directory access.
    // Never trust a browser header, an arbitrary username, or HTTP_AUTHORIZATION here.
    if (empty($_SERVER['REMOTE_USER'])) {
        throw new RaffleError('Acceso restringido. Activa la protección por contraseña del directorio en Ferozo.', 401);
    }
}

function configuration(): array {
    $documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
    if (!$documentRoot || $documentRoot === DIRECTORY_SEPARATOR) {
        throw new RaffleError('No se pudo identificar la carpeta pública del hosting.', 503);
    }
    $private = dirname($documentRoot) . '/f18-private';
    $explicitConfig = getenv('F18_RAFFLE_CONFIG');
    $configPath = $explicitConfig ?: $private . '/config.php';
    $config = ['data_file' => $private . '/sorteos.json', 'upload_dir' => $private . '/prizes', 'require_https' => true];
    if ($explicitConfig || file_exists($configPath)) {
        $realConfig = realpath($configPath);
        if (!$realConfig || $realConfig === $documentRoot || str_starts_with($realConfig, $documentRoot . DIRECTORY_SEPARATOR)) {
            throw new RaffleError('La configuración debe existir fuera del directorio público.', 503);
        }
        $custom = require $realConfig;
        if (!is_array($custom)) throw new RaffleError('La configuración privada no es válida.', 503);
        if (isset($custom['dsn'])) throw new RaffleError('Se detectó la configuración MySQL anterior. Conserva un respaldo y consulta la guía antes de cambiar a JSON; no se migraron ni borraron datos.', 503);
        $config = array_replace($config, $custom);
    }
    foreach (['data_file', 'upload_dir'] as $key) if (!is_string($config[$key]) || !str_starts_with($config[$key], '/')) {
        throw new RaffleError('Configura rutas absolutas privadas para el JSON y los premios.', 503);
    }
    if (!str_ends_with($config['data_file'], '.json')) throw new RaffleError('El archivo de datos debe tener extensión .json.', 503);
    if (($config['require_https'] ?? true) && ($_SERVER['HTTPS'] ?? '') !== 'on') {
        throw new RaffleError('Abre el sitio mediante HTTPS para proteger el acceso.', 403);
    }
    // Resolve the closest existing ancestor BEFORE creating directories (including symlinks).
    $ensurePrivate = static function(string $path) use ($documentRoot): string {
        $ancestor = $path;
        while (!file_exists($ancestor) && !is_link($ancestor)) {
            $parent = dirname($ancestor);
            if ($ancestor === $parent) throw new RaffleError('Ruta privada no válida.', 503);
            $ancestor = $parent;
        }
        $real = realpath($ancestor);
        if (!$real || $real === $documentRoot || str_starts_with($real, $documentRoot . DIRECTORY_SEPARATOR)
            || preg_match('~(?:^|/)\.\.(?:/|$)~', $path)) {
            throw new RaffleError('El JSON y los premios deben estar fuera del sitio público.', 503);
        }
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
            throw new RaffleError('No se pudo crear la carpeta privada. Revisa permisos en Ferozo; no uses 777.', 503);
        }
        $real = realpath($path);
        if (!$real || $real === $documentRoot || str_starts_with($real, $documentRoot . DIRECTORY_SEPARATOR) || !is_writable($real)) {
            throw new RaffleError('La carpeta privada no está disponible para escritura.', 503);
        }
        return $real;
    };
    $parent = $ensurePrivate(dirname($config['data_file']));
    $config['data_file'] = $parent . '/' . basename($config['data_file']);
    if (is_link($config['data_file']) || is_link($config['data_file'] . '.lock')) {
        throw new RaffleError('El JSON privado no admite enlaces simbólicos.', 503);
    }
    $config['upload_dir'] = $ensurePrivate($config['upload_dir']);
    return $config;
}

function csrfSession(): string {
    ini_set('session.use_strict_mode', '1');
    session_name('F18SORTEOS');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/',
        'secure' => ($_SERVER['HTTPS'] ?? '') === 'on', 'httponly' => true, 'samesite' => 'Strict',
    ]);
    if (!session_start()) throw new RaffleError('No se pudo abrir una sesión segura.', 503);
    if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $token = $_SESSION['csrf'];
    // Release PHP's session lock: the private JSON lock serializes storage operations.
    session_write_close();
    return $token;
}

function inputData(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 9 * 1024 * 1024) {
        throw new RaffleError('El archivo o la solicitud supera el límite permitido.', 413);
    }
    if (str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data')) {
        if (!$_POST) throw new RaffleError('No se recibió el formulario. Revisa post_max_size del hosting.', 413);
        return $_POST;
    }
    if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
        throw new RaffleError('Formato de solicitud no admitido.', 415);
    }
    try {
        $data = json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) { throw new RaffleError('La solicitud no contiene JSON válido.'); }
    if (!is_array($data) || array_is_list($data)) throw new RaffleError('Se esperaba un objeto.');
    return $data;
}

function textValue(mixed $value, int $max, bool $required = true): string {
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) throw new RaffleError('Texto no válido.');
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    if (($required && $value === '') || mb_strlen($value, 'UTF-8') > $max) {
        throw new RaffleError("Completa el texto sin superar {$max} caracteres.");
    }
    return $value;
}

function positiveId(mixed $value): int {
    if (!is_int($value) && !(is_string($value) && ctype_digit($value))) throw new RaffleError('Identificador no válido.');
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 4294967295]]);
    if ($id === false) throw new RaffleError('Identificador no válido.');
    return $id;
}
