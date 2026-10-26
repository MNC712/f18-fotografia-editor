<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Cross-Origin-Resource-Policy: same-origin');
header('Referrer-Policy: same-origin');
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/uploads.php';
require __DIR__ . '/service.php';

try {
    authorize();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? '';
    if (!is_string($action)) throw new RaffleError('Acción no válida.', 404);
    $readActions = ['session', 'list', 'get', 'image'];
    $writeActions = ['create', 'update', 'delete', 'participants-add', 'participant-update', 'participant-delete', 'prize-save', 'prize-delete', 'draw', 'duplicate'];
    if (!in_array($action, array_merge($readActions, $writeActions), true)) throw new RaffleError('Acción no admitida.', 404);
    if (($method !== 'GET' && in_array($action, $readActions, true)) || ($method !== 'POST' && in_array($action, $writeActions, true))) {
        header('Allow: ' . (in_array($action, $readActions, true) ? 'GET' : 'POST'));
        throw new RaffleError('Método no admitido.', 405);
    }
    $config = configuration();
    if ($action === 'session') respond(['data' => ['csrf' => csrfSession()]]);
    $data = [];
    if ($method === 'POST') {
        $token = csrfSession();
        $supplied = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($supplied) || !hash_equals($token, $supplied)) throw new RaffleError('La sesión de seguridad venció. Vuelve a intentar la operación.', 403);
        $data = inputData();
    }
    $db = new PDO($config['dsn'], $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec("SET time_zone = '+00:00'");
    $service = new RaffleService($db, $config['upload_dir']);
    if ($action === 'image') {
        $image = $service->image(positiveId($_GET['id'] ?? null));
        header('Content-Type: ' . $image['mime']);
        header('Content-Disposition: inline; filename="premio.' . pathinfo($image['path'], PATHINFO_EXTENSION) . '"');
        header('Content-Length: ' . filesize($image['path']));
        readfile($image['path']); exit;
    }
    if ($action === 'list') respond(['data' => $service->listing()]);
    if ($action === 'get') respond(['data' => $service->readDetail(positiveId($_GET['id'] ?? null))]);
    respond(['data' => $service->mutate($action, $data, $_FILES['image'] ?? null)]);
} catch (RaffleError $e) {
    respond(['error' => $e->getMessage(), 'duplicates' => $e->duplicates], $e->status);
} catch (Throwable $e) {
    error_log('F18 Sorteos: ' . get_class($e) . ' code=' . $e->getCode());
    respond(['error' => 'No se pudo completar la operación. Revisa la conexión MySQL, el esquema y los permisos privados del hosting. No se confirmó ningún cambio.'], 503);
}
