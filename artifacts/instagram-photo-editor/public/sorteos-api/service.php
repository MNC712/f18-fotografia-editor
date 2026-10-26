<?php
declare(strict_types=1);

final class RaffleService {
    private PDO $db;
    private string $directory;
    /** Files are reconciled with transaction success; no public paths are returned. */
    private array $createdFiles = [];
    private array $retiredFiles = [];

    public function __construct(PDO $db, string $directory) {
        $this->db = $db;
        $this->directory = $directory;
    }
    private function rows(string $sql, array $params = []): array {
        $statement = $this->db->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }
    private function run(string $sql, array $params = []): void {
        $statement = $this->db->prepare($sql);
        $statement->execute($params);
    }
    public function listing(): array {
        $rows = $this->rows('SELECT r.*, (SELECT COUNT(*) FROM f18_participants p WHERE p.raffle_id=r.id) participant_count,
            (SELECT COUNT(*) FROM f18_prizes p WHERE p.raffle_id=r.id) prize_count FROM f18_raffles r ORDER BY r.id DESC');
        return array_map(fn($r) => $this->castSummary($r), $rows);
    }
    private function castSummary(array $r): array {
        foreach (['id', 'participant_count', 'prize_count'] as $field) if (isset($r[$field])) $r[$field] = (int)$r[$field];
        return $r;
    }
    private function raffle(int $id, bool $lock = false): array {
        $rows = $this->rows('SELECT * FROM f18_raffles WHERE id=?' . ($lock ? ' FOR UPDATE' : ''), [$id]);
        if (!$rows) throw new RaffleError('El sorteo ya no existe. Actualiza la lista.', 404);
        return $rows[0];
    }
    public function detail(int $id): array {
        $r = $this->castSummary($this->raffle($id));
        $r['participants'] = $this->rows('SELECT id,name FROM f18_participants WHERE raffle_id=? ORDER BY id', [$id]);
        $r['prizes'] = $this->rows('SELECT id,name,description,IF(image_key IS NULL,NULL,CAST(id AS CHAR)) image_url FROM f18_prizes WHERE raffle_id=? ORDER BY id', [$id]);
        $r['results'] = $this->rows('SELECT x.prize_id,x.participant_id,x.winner_name,x.prize_name,x.prize_description,
            IF(p.image_key IS NULL,NULL,CAST(p.id AS CHAR)) image_url FROM f18_results x JOIN f18_prizes p ON p.id=x.prize_id WHERE x.raffle_id=? ORDER BY x.prize_id', [$id]);
        foreach ($r['participants'] as &$p) $p['id'] = (int)$p['id'];
        unset($p);
        foreach ($r['prizes'] as &$p) $p['id'] = (int)$p['id'];
        unset($p);
        foreach ($r['results'] as &$result) {
            $result['prize_id'] = (int)$result['prize_id']; $result['participant_id'] = (int)$result['participant_id'];
        }
        unset($result);
        $r['participant_count'] = count($r['participants']);
        $r['prize_count'] = count($r['prizes']);
        return $r;
    }
    /** A consistent detail snapshot even while another session changes a draft. */
    public function readDetail(int $id): array {
        $this->db->beginTransaction();
        try {
            $this->raffle($id, true);
            $result = $this->detail($id);
            $this->db->commit();
            return $result;
        } catch (Throwable $e) { $this->db->rollBack(); throw $e; }
    }
    public function mutate(string $action, array $data, ?array $file = null): array {
        $this->createdFiles = []; $this->retiredFiles = [];
        $this->db->beginTransaction();
        try {
            if ($action === 'create') {
                $this->run('INSERT INTO f18_raffles(title,description) VALUES(?,?)', [
                    textValue($data['title'] ?? null, 120), textValue($data['description'] ?? '', 600, false),
                ]);
                $id = (int)$this->db->lastInsertId();
            } else {
                $id = positiveId($data['id'] ?? null);
                $raffle = $this->raffle($id, true);
                if ($raffle['status'] === 'drawn' && !in_array($action, ['draw', 'duplicate', 'delete'], true)) {
                    throw new RaffleError('El sorteo ya finalizó. Crea una copia para realizar otro.', 409);
                }
                switch ($action) {
                    case 'update':
                        $this->run('UPDATE f18_raffles SET title=?,description=? WHERE id=?', [
                            textValue($data['title'] ?? null, 120), textValue($data['description'] ?? '', 600, false), $id,
                        ]); break;
                    case 'delete':
                        foreach ($this->rows('SELECT image_key FROM f18_prizes WHERE raffle_id=? AND image_key IS NOT NULL', [$id]) as $p) $this->retiredFiles[] = $p['image_key'];
                        $this->run('DELETE FROM f18_raffles WHERE id=?', [$id]);
                        break;
                    case 'participants-add': $this->addParticipants($id, $data['names'] ?? null); break;
                    case 'participant-update': $this->updateParticipant($id, $data); break;
                    case 'participant-delete':
                        $participant = positiveId($data['participant_id'] ?? null);
                        $this->requireChild('participants', $id, $participant);
                        $this->run('DELETE FROM f18_participants WHERE id=? AND raffle_id=?', [$participant, $id]); break;
                    case 'prize-save': $this->savePrize($id, $data, $file); break;
                    case 'prize-delete':
                        $prize = $this->requireChild('prizes', $id, positiveId($data['prize_id'] ?? null));
                        if ($prize['image_key']) $this->retiredFiles[] = $prize['image_key'];
                        $this->run('DELETE FROM f18_prizes WHERE id=? AND raffle_id=?', [$prize['id'], $id]); break;
                    case 'draw': if ($raffle['status'] !== 'drawn') $this->draw($id); break;
                    case 'duplicate': $id = $this->duplicate($id, $raffle); break;
                    default: throw new RaffleError('Acción no admitida.', 404);
                }
            }
            $result = $action === 'delete' ? ['deleted' => true] : $this->detail($id);
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $this->cleanFiles($this->createdFiles);
            throw $e;
        }
        $this->cleanFiles($this->retiredFiles);
        return $result;
    }
    private function cleanFiles(array $keys): void {
        foreach ($keys as $key) {
            $path = imagePath($this->directory, $key);
            if (is_file($path) && !@unlink($path)) error_log('F18: No se pudo limpiar una foto privada retirada.');
        }
    }
    private function requireChild(string $table, int $id, int $child): array {
        if (!in_array($table, ['prizes', 'participants'], true)) throw new LogicException('Invalid table');
        $rows = $this->rows("SELECT * FROM f18_{$table} WHERE id=? AND raffle_id=?", [$child, $id]);
        if (!$rows) throw new RaffleError('El participante o premio ya no existe. Actualiza el sorteo.', 404);
        return $rows[0];
    }
    private function existingNames(int $id): array {
        $names = [];
        foreach ($this->rows('SELECT normalized_name FROM f18_participants WHERE raffle_id=?', [$id]) as $p) $names[$p['normalized_name']] = true;
        return $names;
    }
    private function addParticipants(int $id, mixed $input): void {
        if (!is_array($input) || !array_is_list($input) || count($input) < 1 || count($input) > 5000) throw new RaffleError('Agrega entre 1 y 5000 nombres.');
        $existing = $this->existingNames($id); $batch = []; $duplicates = [];
        foreach ($input as $item) {
            $name = textValue($item, 100);
            $normalized = mb_strtolower($name, 'UTF-8');
            if (isset($existing[$normalized]) || isset($batch[$normalized])) $duplicates[] = $name;
            $batch[$normalized] = $name;
        }
        if ($duplicates) throw new RaffleError('Hay nombres repetidos. Corrige la lista; no se agregó ningún participante.', 409, array_values(array_unique($duplicates)));
        if (count($existing) + count($batch) > 5000) throw new RaffleError('El máximo por sorteo es de 5000 participantes.');
        foreach ($batch as $normalized => $name) $this->run('INSERT INTO f18_participants(raffle_id,name,normalized_name) VALUES(?,?,?)', [$id, $name, (string)$normalized]);
    }
    private function updateParticipant(int $id, array $data): void {
        $participant = positiveId($data['participant_id'] ?? null);
        $this->requireChild('participants', $id, $participant);
        $name = textValue($data['name'] ?? null, 100);
        $normalized = mb_strtolower($name, 'UTF-8');
        if ($this->rows('SELECT id FROM f18_participants WHERE raffle_id=? AND normalized_name=? AND id<>?', [$id, $normalized, $participant])) {
            throw new RaffleError('Ya existe un participante con ese nombre.', 409, [$name]);
        }
        $this->run('UPDATE f18_participants SET name=?,normalized_name=? WHERE id=? AND raffle_id=?', [$name, $normalized, $participant, $id]);
    }
    private function savePrize(int $id, array $data, ?array $file): void {
        $prizeId = isset($data['prize_id']) ? positiveId($data['prize_id']) : null;
        $old = $prizeId ? $this->requireChild('prizes', $id, $prizeId) : null;
        if (!$old && (int)$this->rows('SELECT COUNT(*) n FROM f18_prizes WHERE raffle_id=?', [$id])[0]['n'] >= 30) throw new RaffleError('El máximo por sorteo es de 30 premios.');
        $name = textValue($data['name'] ?? null, 120);
        $description = textValue($data['description'] ?? '', 600, false);
        $key = $old['image_key'] ?? null;
        if (!empty($data['remove_image'])) $key = null;
        if ($file && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $key = storePrizeImage($file, $this->directory);
            $this->createdFiles[] = $key;
        }
        if ($old && $old['image_key'] && $key !== $old['image_key']) $this->retiredFiles[] = $old['image_key'];
        if ($old) $this->run('UPDATE f18_prizes SET name=?,description=?,image_key=? WHERE id=? AND raffle_id=?', [$name, $description, $key, $prizeId, $id]);
        else $this->run('INSERT INTO f18_prizes(raffle_id,name,description,image_key) VALUES(?,?,?,?)', [$id, $name, $description, $key]);
    }
    private function draw(int $id): void {
        $participants = $this->rows('SELECT id,name FROM f18_participants WHERE raffle_id=? ORDER BY id', [$id]);
        $prizes = $this->rows('SELECT id,name,description FROM f18_prizes WHERE raffle_id=? ORDER BY id', [$id]);
        if (!$prizes || count($participants) < count($prizes)) throw new RaffleError('Agrega premios y al menos un participante diferente por cada premio.');
        // Partial Fisher-Yates: every remaining participant has equal probability.
        foreach ($prizes as $i => $prize) {
            $pick = random_int($i, count($participants) - 1);
            [$participants[$i], $participants[$pick]] = [$participants[$pick], $participants[$i]];
            $winner = $participants[$i];
            $this->run('INSERT INTO f18_results(raffle_id,prize_id,participant_id,winner_name,prize_name,prize_description) VALUES(?,?,?,?,?,?)',
                [$id, $prize['id'], $winner['id'], $winner['name'], $prize['name'], $prize['description']]);
        }
        $this->run("UPDATE f18_raffles SET status='drawn',drawn_at=UTC_TIMESTAMP() WHERE id=?", [$id]);
    }
    private function duplicate(int $oldId, array $raffle): int {
        $title = mb_substr($raffle['title'], 0, 112, 'UTF-8') . ' · copia';
        $this->run('INSERT INTO f18_raffles(title,description) VALUES(?,?)', [$title, $raffle['description']]);
        $id = (int)$this->db->lastInsertId();
        $this->run('INSERT INTO f18_participants(raffle_id,name,normalized_name) SELECT ?,name,normalized_name FROM f18_participants WHERE raffle_id=?', [$id, $oldId]);
        foreach ($this->rows('SELECT * FROM f18_prizes WHERE raffle_id=? ORDER BY id', [$oldId]) as $prize) {
            $key = null;
            if ($prize['image_key']) {
                $source = imagePath($this->directory, $prize['image_key']);
                $key = bin2hex(random_bytes(24)) . '.' . pathinfo($source, PATHINFO_EXTENSION);
                $this->createdFiles[] = $key;
                if (!copy($source, imagePath($this->directory, $key))) throw new RaffleError('No se pudo copiar la imagen del premio. No se creó el sorteo.', 503);
                chmod(imagePath($this->directory, $key), 0600);
            }
            $this->run('INSERT INTO f18_prizes(raffle_id,name,description,image_key) VALUES(?,?,?,?)', [$id, $prize['name'], $prize['description'], $key]);
        }
        return $id;
    }
    public function image(int $id): array {
        $rows = $this->rows('SELECT image_key FROM f18_prizes WHERE id=?', [$id]);
        if (!$rows || !$rows[0]['image_key']) throw new RaffleError('La imagen no existe.', 404);
        $path = imagePath($this->directory, $rows[0]['image_key']);
        if (!is_file($path)) throw new RaffleError('La imagen no está disponible. Revisa los archivos privados del hosting.', 404);
        return ['path' => $path, 'mime' => (new finfo(FILEINFO_MIME_TYPE))->file($path)];
    }
}
