<?php
declare(strict_types=1);
require_once __DIR__ . '/json-store.php';

final class RaffleService {
    private array $state = [];
    private array $createdFiles = [];
    private array $retiredFiles = [];

    public function __construct(private JsonRaffleStore $store, private string $directory) {}

    private function snapshot(bool $write, callable $operation): mixed {
        return $this->store->access($write, function(array &$state) use ($operation) {
            $this->state = $state;
            $result = $operation();
            $state = $this->state;
            return $result;
        });
    }
    public function listing(): array {
        return $this->snapshot(false, function() {
            return array_map(fn($r) => $this->summary($r), array_reverse($this->state['raffles']));
        });
    }
    private function summary(array $r): array {
        return array_diff_key($r, array_flip(['participants', 'prizes', 'results'])) + [
            'participant_count' => count($r['participants']), 'prize_count' => count($r['prizes']),
        ];
    }
    private function raffleIndex(int $id): int {
        foreach ($this->state['raffles'] as $i => $r) if ($r['id'] === $id) return $i;
        throw new RaffleError('El sorteo ya no existe. Actualiza la lista.', 404);
    }
    private function detail(int $id): array {
        $r = $this->state['raffles'][$this->raffleIndex($id)];
        $prizes = [];
        foreach ($r['prizes'] as $p) $prizes[$p['id']] = $p;
        return $this->summary($r) + [
            'participants' => array_map(fn($p) => ['id' => $p['id'], 'name' => $p['name']], $r['participants']),
            'prizes' => array_map(fn($p) => [
                'id' => $p['id'], 'name' => $p['name'], 'description' => $p['description'],
                'image_url' => $p['image_key'] ? (string)$p['id'] : null,
            ], $r['prizes']),
            'results' => array_map(fn($x) => $x + ['image_url' => $prizes[$x['prize_id']]['image_key'] ? (string)$x['prize_id'] : null], $r['results']),
        ];
    }
    public function readDetail(int $id): array {
        return $this->snapshot(false, fn() => $this->detail($id));
    }
    private function nextId(string $kind): int {
        $id = $this->state['next_ids'][$kind];
        if ($id >= 4294967295) throw new RaffleError('Se alcanzó el límite de identificadores.', 503);
        $this->state['next_ids'][$kind]++;
        return $id;
    }
    public function mutate(string $action, array $data, ?array $file = null): array {
        $this->createdFiles = []; $this->retiredFiles = [];
        try {
            $result = $this->snapshot(true, function() use ($action, $data, $file) {
                if ($action === 'create') {
                    $id = $this->nextId('raffle');
                    $this->state['raffles'][] = [
                        'id' => $id, 'title' => textValue($data['title'] ?? null, 120),
                        'description' => textValue($data['description'] ?? '', 600, false),
                        'status' => 'draft', 'created_at' => gmdate('Y-m-d H:i:s'), 'drawn_at' => null,
                        'participants' => [], 'prizes' => [], 'results' => [],
                    ];
                } else {
                    $id = positiveId($data['id'] ?? null);
                    $index = $this->raffleIndex($id);
                    $r =& $this->state['raffles'][$index];
                    if ($r['status'] === 'drawn' && !in_array($action, ['draw', 'duplicate', 'delete'], true)) {
                        throw new RaffleError('El sorteo ya finalizó. Crea una copia para realizar otro.', 409);
                    }
                    switch ($action) {
                        case 'update':
                            $r['title'] = textValue($data['title'] ?? null, 120);
                            $r['description'] = textValue($data['description'] ?? '', 600, false); break;
                        case 'delete':
                            foreach ($r['prizes'] as $p) if ($p['image_key']) $this->retiredFiles[] = $p['image_key'];
                            array_splice($this->state['raffles'], $index, 1); break;
                        case 'participants-add': $this->addParticipants($r, $data['names'] ?? null); break;
                        case 'participant-update':
                            $child = $this->childIndex($r['participants'], positiveId($data['participant_id'] ?? null));
                            $name = textValue($data['name'] ?? null, 100);
                            $normalized = mb_strtolower($name, 'UTF-8');
                            foreach ($r['participants'] as $i => $p) if ($i !== $child && $p['normalized_name'] === $normalized) {
                                throw new RaffleError('Ya existe un participante con ese nombre.', 409, [$name]);
                            }
                            $r['participants'][$child]['name'] = $name;
                            $r['participants'][$child]['normalized_name'] = $normalized; break;
                        case 'participant-delete':
                            array_splice($r['participants'], $this->childIndex($r['participants'], positiveId($data['participant_id'] ?? null)), 1); break;
                        case 'prize-save': $this->savePrize($r, $data, $file); break;
                        case 'prize-delete':
                            $child = $this->childIndex($r['prizes'], positiveId($data['prize_id'] ?? null));
                            if ($r['prizes'][$child]['image_key']) $this->retiredFiles[] = $r['prizes'][$child]['image_key'];
                            array_splice($r['prizes'], $child, 1); break;
                        case 'draw': if ($r['status'] !== 'drawn') $this->draw($r); break;
                        case 'duplicate': $id = $this->duplicate($r); break;
                        default: throw new RaffleError('Acción no admitida.', 404);
                    }
                }
                return $action === 'delete' ? ['deleted' => true] : $this->detail($id);
            });
        } catch (Throwable $e) {
            $this->cleanFiles($this->createdFiles);
            throw $e;
        }
        // Only retire photos after the new JSON snapshot has committed successfully.
        $this->cleanFiles($this->retiredFiles);
        $this->retiredFiles = [];
        return $result;
    }
    private function cleanFiles(array $keys): void {
        foreach ($keys as $key) {
            $path = imagePath($this->directory, $key);
            if (is_file($path) && !@unlink($path)) error_log('F18: No se pudo limpiar una foto privada retirada.');
        }
    }
    private function childIndex(array $children, int $id): int {
        foreach ($children as $index => $child) if ($child['id'] === $id) return $index;
        throw new RaffleError('El participante o premio ya no existe. Actualiza el sorteo.', 404);
    }
    private function addParticipants(array &$r, mixed $input): void {
        if (!is_array($input) || !array_is_list($input) || count($input) < 1 || count($input) > 5000) throw new RaffleError('Agrega entre 1 y 5000 nombres.');
        $existing = array_fill_keys(array_column($r['participants'], 'normalized_name'), true);
        $batch = []; $duplicates = [];
        foreach ($input as $item) {
            $name = textValue($item, 100);
            $normalized = mb_strtolower($name, 'UTF-8');
            if (isset($existing[$normalized]) || isset($batch[$normalized])) $duplicates[] = $name;
            $batch[$normalized] = $name;
        }
        if ($duplicates) throw new RaffleError('Hay nombres repetidos. Corrige la lista; no se agregó ningún participante.', 409, array_values(array_unique($duplicates)));
        if (count($existing) + count($batch) > 5000) throw new RaffleError('El máximo por sorteo es de 5000 participantes.');
        foreach ($batch as $normalized => $name) $r['participants'][] = [
            'id' => $this->nextId('participant'), 'name' => $name, 'normalized_name' => (string)$normalized,
        ];
    }
    private function savePrize(array &$r, array $data, ?array $file): void {
        $index = isset($data['prize_id']) ? $this->childIndex($r['prizes'], positiveId($data['prize_id'])) : null;
        $old = $index !== null ? $r['prizes'][$index] : null;
        if (!$old && count($r['prizes']) >= 30) throw new RaffleError('El máximo por sorteo es de 30 premios.');
        $name = textValue($data['name'] ?? null, 120);
        $description = textValue($data['description'] ?? '', 600, false);
        $key = $old['image_key'] ?? null;
        if (!empty($data['remove_image'])) $key = null;
        if ($file && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $key = storePrizeImage($file, $this->directory);
            $this->createdFiles[] = $key;
        }
        if ($old && $old['image_key'] && $key !== $old['image_key']) $this->retiredFiles[] = $old['image_key'];
        $prize = ['id' => $old['id'] ?? $this->nextId('prize'), 'name' => $name, 'description' => $description, 'image_key' => $key];
        if ($index === null) $r['prizes'][] = $prize;
        else $r['prizes'][$index] = $prize;
    }
    private function draw(array &$r): void {
        $participants = $r['participants'];
        if (!$r['prizes'] || count($participants) < count($r['prizes'])) throw new RaffleError('Agrega premios y al menos un participante diferente por cada premio.');
        foreach ($r['prizes'] as $i => $prize) {
            $pick = random_int($i, count($participants) - 1);
            [$participants[$i], $participants[$pick]] = [$participants[$pick], $participants[$i]];
            $r['results'][] = [
                'prize_id' => $prize['id'], 'participant_id' => $participants[$i]['id'],
                'winner_name' => $participants[$i]['name'], 'prize_name' => $prize['name'], 'prize_description' => $prize['description'],
            ];
        }
        $r['status'] = 'drawn'; $r['drawn_at'] = gmdate('Y-m-d H:i:s');
    }
    private function duplicate(array $r): int {
        $r['id'] = $this->nextId('raffle');
        $r['title'] = mb_substr($r['title'], 0, 112, 'UTF-8') . ' · copia';
        $r['status'] = 'draft'; $r['created_at'] = gmdate('Y-m-d H:i:s'); $r['drawn_at'] = null; $r['results'] = [];
        foreach ($r['participants'] as &$p) $p['id'] = $this->nextId('participant');
        unset($p);
        foreach ($r['prizes'] as &$p) {
            $p['id'] = $this->nextId('prize');
            if ($p['image_key']) {
                $source = imagePath($this->directory, $p['image_key']);
                $key = bin2hex(random_bytes(24)) . '.' . pathinfo($source, PATHINFO_EXTENSION);
                $this->createdFiles[] = $key;
                if (!copy($source, imagePath($this->directory, $key)) || !chmod(imagePath($this->directory, $key), 0600)) {
                    throw new RaffleError('No se pudo copiar la imagen del premio. No se creó el sorteo.', 503);
                }
                $p['image_key'] = $key;
            }
        }
        unset($p);
        $this->state['raffles'][] = $r;
        return $r['id'];
    }
    public function image(int $id): array {
        return $this->snapshot(false, function() use ($id) {
            foreach ($this->state['raffles'] as $r) foreach ($r['prizes'] as $p) {
                if ($p['id'] !== $id || !$p['image_key']) continue;
                $path = imagePath($this->directory, $p['image_key']);
                $bytes = is_file($path) ? file_get_contents($path) : false;
                if ($bytes === false) throw new RaffleError('La imagen no está disponible. Revisa los archivos privados del hosting.', 404);
                return ['bytes' => $bytes, 'mime' => (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes), 'extension' => pathinfo($path, PATHINFO_EXTENSION)];
            }
            throw new RaffleError('La imagen no existe.', 404);
        });
    }
}
