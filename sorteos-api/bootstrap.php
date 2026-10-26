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
    $configPath = getenv('F18_RAFFLE_CONFIG') ?: dirname($documentRoot) . '/f18-private/config.php';
    $realConfig = realpath($configPath);
    if (!$realConfig || !$documentRoot || str_starts_with($realConfig, $documentRoot . DIRECTORY_SEPARATOR)) {
        throw new RaffleError('Falta configurar Sorteos en el hosting. Consulta la guía de instalación.', 503);
    }
    $config = require $realConfig;
    foreach (['dsn', 'user', 'password', 'upload_dir'] as $key) {
        if (!is_array($config) || !isset($config[$key]) || !is_string($config[$key])) {
            throw new RaffleError('La configuración privada de Sorteos está incompleta.', 503);
        }
    }
    if (($config['require_https'] ?? true) && ($_SERVER['HTTPS'] ?? '') !== 'on') {
        throw new RaffleError('Abre el sitio mediante HTTPS para proteger el acceso.', 403);
    }
    $parent = realpath(dirname($config['upload_dir']));
    if (!$parent || $parent === $documentRoot || str_starts_with($parent, $documentRoot . DIRECTORY_SEPARATOR)) {
        throw new RaffleError('La carpeta de premios debe estar fuera del sitio público.', 503);
    }
    if (!is_dir($config['upload_dir']) && !mkdir($config['upload_dir'], 0700, true)) {
        throw new RaffleError('No se pudo preparar la carpeta privada de premios.', 503);
    }
    $uploads = realpath($config['upload_dir']);
    if (!$uploads || $uploads === $documentRoot || str_starts_with($uploads, $documentRoot . DIRECTORY_SEPARATOR)) {
        throw new RaffleError('La carpeta de premios no es privada.', 503);
    }
    $config['upload_dir'] = $uploads;
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
    // Release PHP's session lock: database transactions provide concurrency control.
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
