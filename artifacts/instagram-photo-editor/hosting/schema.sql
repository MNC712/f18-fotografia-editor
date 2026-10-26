-- Import once into a dedicated MySQL 5.7+/MariaDB 10.3+ database (InnoDB).
CREATE TABLE IF NOT EXISTS f18_raffles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '',
  status ENUM('draft','drawn') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  drawn_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS f18_participants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raffle_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  UNIQUE KEY participant_name (raffle_id, normalized_name),
  CONSTRAINT f18_participant_raffle FOREIGN KEY (raffle_id) REFERENCES f18_raffles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS f18_prizes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raffle_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '',
  image_key VARCHAR(80) NULL,
  CONSTRAINT f18_prize_raffle FOREIGN KEY (raffle_id) REFERENCES f18_raffles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS f18_results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raffle_id INT UNSIGNED NOT NULL,
  prize_id INT UNSIGNED NOT NULL,
  participant_id INT UNSIGNED NOT NULL,
  winner_name VARCHAR(100) NOT NULL,
  prize_name VARCHAR(120) NOT NULL,
  prize_description VARCHAR(600) NOT NULL DEFAULT '',
  UNIQUE KEY result_prize (raffle_id, prize_id),
  UNIQUE KEY result_winner (raffle_id, participant_id),
  CONSTRAINT f18_result_raffle FOREIGN KEY (raffle_id) REFERENCES f18_raffles(id) ON DELETE CASCADE,
  CONSTRAINT f18_result_prize FOREIGN KEY (prize_id) REFERENCES f18_prizes(id) ON DELETE CASCADE,
  CONSTRAINT f18_result_participant FOREIGN KEY (participant_id) REFERENCES f18_participants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
