<?php
declare(strict_types=1);

/** One permanent lock inode; snapshots are replaced atomically on the same filesystem. */
final class JsonRaffleStore {
    public function __construct(private string $path) {}

    public function access(bool $write, callable $operation): mixed {
        if (is_link($this->path) || is_link($this->path . '.lock')) {
            throw new RaffleError('El almacenamiento privado no admite enlaces simbólicos.', 503);
        }
        $lock = fopen($this->path . '.lock', 'c+b');
        if (!$lock) throw new RaffleError('No se pudo abrir el bloqueo del archivo JSON.', 503);
        chmod($this->path . '.lock', 0600);
        $temporary = null;
        try {
            $deadline = microtime(true) + 15;
            while (!flock($lock, ($write ? LOCK_EX : LOCK_SH) | LOCK_NB)) {
                if (microtime(true) >= $deadline) throw new RaffleError('Sorteos está ocupado. Vuelve a intentar en unos segundos.', 503);
                usleep(20000);
            }
            // An existing empty, unreadable or invalid file MUST NOT become an empty collection.
            $state = ['version' => 1, 'next_ids' => ['raffle' => 1, 'participant' => 1, 'prize' => 1], 'raffles' => []];
            if (file_exists($this->path)) {
                $contents = is_file($this->path) && is_readable($this->path) ? file_get_contents($this->path) : false;
                try {
                    if ($contents === false) throw new RuntimeException('Unreadable JSON');
                    $state = json_decode($contents, true, 64, JSON_THROW_ON_ERROR);
                    $this->validate($state);
                } catch (Throwable $e) {
                    throw new RaffleError('El JSON de Sorteos está dañado o tiene un formato no compatible. Conserva el archivo y restaura una copia de seguridad; no se sobrescribió.', 503);
                }
            }
            $result = $operation($state);
            if ($write) {
                $this->validate($state);
                $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
                $temporary = tempnam(dirname($this->path), '.sorteos-');
                if (!$temporary || !chmod($temporary, 0600)) throw new RaffleError('No se pudo preparar el guardado privado.', 503);
                $output = fopen($temporary, 'wb');
                if (!$output) throw new RaffleError('No se pudo guardar el JSON.', 503);
                try {
                    $offset = 0;
                    while ($offset < strlen($json)) {
                        $count = fwrite($output, substr($json, $offset));
                        if (!$count) throw new RaffleError('No se pudo completar el guardado del JSON.', 503);
                        $offset += $count;
                    }
                    if (!fflush($output) || !fsync($output)) throw new RaffleError('No se pudo confirmar el guardado del JSON.', 503);
                } finally { fclose($output); }
                if (!rename($temporary, $this->path)) throw new RaffleError('No se pudo reemplazar el JSON. Se conservó la versión anterior.', 503);
                $temporary = null;
            }
            return $result;
        } finally {
            if ($temporary && is_file($temporary)) unlink($temporary);
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    private function validate(mixed $state): void {
        $invalid = static function(): never { throw new RuntimeException('Invalid raffle JSON structure'); };
        if (!is_array($state) || ($state['version'] ?? null) !== 1
            || !is_array($state['next_ids'] ?? null) || !is_array($state['raffles'] ?? null)
            || !array_is_list($state['raffles'])) $invalid();
        $seen = ['raffle' => [], 'participant' => [], 'prize' => []];
        foreach ($seen as $kind => $_) if (!is_int($state['next_ids'][$kind] ?? null) || $state['next_ids'][$kind] < 1) $invalid();
        $identifier = static function(array $record, string $kind) use (&$seen, $state, $invalid): void {
            $id = $record['id'] ?? null;
            if (!is_int($id) || $id < 1 || $id >= $state['next_ids'][$kind] || isset($seen[$kind][$id])) $invalid();
            $seen[$kind][$id] = true;
        };
        foreach ($state['raffles'] as $r) {
            if (!is_array($r)) $invalid();
            $identifier($r, 'raffle');
            foreach (['title', 'description', 'created_at'] as $key) if (!is_string($r[$key] ?? null)) $invalid();
            if (!in_array($r['status'] ?? null, ['draft', 'drawn'], true)
                || !array_key_exists('drawn_at', $r) || !($r['drawn_at'] === null || is_string($r['drawn_at']))) $invalid();
            foreach (['participants', 'prizes', 'results'] as $key) if (!is_array($r[$key] ?? null) || !array_is_list($r[$key])) $invalid();
            if (count($r['participants']) > 5000 || count($r['prizes']) > 30) $invalid();
            $participants = []; $prizes = []; $names = [];
            foreach ($r['participants'] as $p) {
                if (!is_array($p) || !is_string($p['name'] ?? null) || !is_string($p['normalized_name'] ?? null)) $invalid();
                $identifier($p, 'participant');
                if (isset($names[$p['normalized_name']]) || mb_strtolower($p['name'], 'UTF-8') !== $p['normalized_name']) $invalid();
                $names[$p['normalized_name']] = true; $participants[$p['id']] = $p;
            }
            foreach ($r['prizes'] as $p) {
                if (!is_array($p) || !is_string($p['name'] ?? null) || !is_string($p['description'] ?? null)
                    || !array_key_exists('image_key', $p)
                    || !($p['image_key'] === null || (is_string($p['image_key']) && preg_match('/^[a-f0-9]{48}\.(jpg|png|webp)$/D', $p['image_key'])))) $invalid();
                $identifier($p, 'prize'); $prizes[$p['id']] = $p;
            }
            $winners = []; $awards = [];
            foreach ($r['results'] as $x) {
                if (!is_array($x) || !is_int($x['participant_id'] ?? null) || !is_int($x['prize_id'] ?? null)
                    || !isset($participants[$x['participant_id']], $prizes[$x['prize_id']])
                    || isset($winners[$x['participant_id']]) || isset($awards[$x['prize_id']])) $invalid();
                $p = $prizes[$x['prize_id']];
                if (($x['winner_name'] ?? null) !== $participants[$x['participant_id']]['name']
                    || ($x['prize_name'] ?? null) !== $p['name'] || ($x['prize_description'] ?? null) !== $p['description']) $invalid();
                $winners[$x['participant_id']] = true; $awards[$x['prize_id']] = true;
            }
            if ($r['status'] === 'draft' && ($r['results'] || $r['drawn_at'] !== null)) $invalid();
            if ($r['status'] === 'drawn' && (!$r['prizes'] || count($r['results']) !== count($r['prizes']) || !is_string($r['drawn_at']))) $invalid();
        }
    }
}
