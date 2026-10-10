CREATE TABLE polls (
 id CHAR(36) PRIMARY KEY, title VARCHAR(200) NOT NULL, description TEXT NOT NULL,
 rules JSON NOT NULL, starts_at DATETIME(3) NOT NULL, ends_at DATETIME(3) NOT NULL,
 status ENUM('draft','scheduled','active','closed','archived') NOT NULL DEFAULT 'draft',
 released BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX phase_window(status, starts_at, ends_at)
) ENGINE=InnoDB;
CREATE TABLE platform_state (
 id TINYINT PRIMARY KEY, current_poll_id CHAR(36) NULL,
 transition_mode ENUM('waiting','results') NOT NULL DEFAULT 'waiting',
 waiting_message VARCHAR(500) NOT NULL DEFAULT 'Die nächste Umfrage wird vorbereitet.',
 FOREIGN KEY(current_poll_id) REFERENCES polls(id)
) ENGINE=InnoDB;
INSERT INTO platform_state(id) VALUES(1);
CREATE TABLE votes (
 id CHAR(36) PRIMARY KEY, poll_id CHAR(36) NOT NULL, voter_hash CHAR(64) NOT NULL,
 answer JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY one_vote(poll_id,voter_hash), FOREIGN KEY(poll_id) REFERENCES polls(id)
) ENGINE=InnoDB;
CREATE TABLE admins (
 id CHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 totp_secret VARCHAR(255) NOT NULL, last_totp_step BIGINT NOT NULL DEFAULT -1,
 role ENUM('owner','moderator','viewer') NOT NULL DEFAULT 'viewer', disabled BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;
CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY, admin_id CHAR(36) NOT NULL, expires_at DATETIME(3) NOT NULL,
 FOREIGN KEY(admin_id) REFERENCES admins(id), INDEX expiry(expires_at)
) ENGINE=InnoDB;
CREATE TABLE ideas (
 id CHAR(36) PRIMARY KEY, poll_id CHAR(36) NOT NULL, vote_id CHAR(36) NOT NULL UNIQUE,
 original TEXT NOT NULL, content TEXT NOT NULL, category VARCHAR(100) NOT NULL DEFAULT '',
 status ENUM('pending','approved','rejected','merged') NOT NULL DEFAULT 'pending',
 spam_flag BOOLEAN NOT NULL DEFAULT FALSE, duplicate_of CHAR(36) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(poll_id) REFERENCES polls(id), FOREIGN KEY(vote_id) REFERENCES votes(id),
 FOREIGN KEY(duplicate_of) REFERENCES ideas(id), INDEX moderation(status,created_at)
) ENGINE=InnoDB;
CREATE TABLE idea_history (
 id CHAR(36) PRIMARY KEY, idea_id CHAR(36) NOT NULL, admin_id CHAR(36) NOT NULL,
 previous_content TEXT NOT NULL, next_content TEXT NOT NULL, reason VARCHAR(500) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(idea_id) REFERENCES ideas(id), FOREIGN KEY(admin_id) REFERENCES admins(id)
) ENGINE=InnoDB;
CREATE TABLE decisions (
 id CHAR(36) PRIMARY KEY, poll_id CHAR(36) NOT NULL UNIQUE, title VARCHAR(200) NOT NULL,
 result JSON NOT NULL, status ENUM('recorded','clarification','planned','released') NOT NULL DEFAULT 'recorded',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(poll_id) REFERENCES polls(id)
) ENGINE=InnoDB;
CREATE TABLE development_tasks (
 id CHAR(36) PRIMARY KEY, decision_id CHAR(36) NOT NULL, title VARCHAR(200) NOT NULL,
 priority INT NOT NULL DEFAULT 0, status ENUM('requirements','planned','implementation','review','ready','released') NOT NULL DEFAULT 'requirements',
 test_status ENUM('pending','passed','failed') NOT NULL DEFAULT 'pending', version VARCHAR(40) NULL,
 FOREIGN KEY(decision_id) REFERENCES decisions(id)
) ENGINE=InnoDB;
CREATE TABLE github_links (
 decision_id CHAR(36) PRIMARY KEY, state ENUM('pending','created','uncertain') NOT NULL,
 issue_number INT NULL, issue_url VARCHAR(500) NULL, remote_state VARCHAR(40) NULL,
 title VARCHAR(200) NOT NULL, body TEXT NOT NULL, last_error VARCHAR(200) NULL,
 FOREIGN KEY(decision_id) REFERENCES decisions(id)
) ENGINE=InnoDB;
CREATE TABLE audit_events (
 sequence BIGINT AUTO_INCREMENT PRIMARY KEY, id CHAR(36) NOT NULL UNIQUE, actor_id CHAR(36) NULL, action VARCHAR(100) NOT NULL, target_id VARCHAR(100) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), previous_hash CHAR(64) NOT NULL, event_hash CHAR(64) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE modules (
 id VARCHAR(100) PRIMARY KEY, version VARCHAR(30) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
 decision_id CHAR(36) NULL, FOREIGN KEY(decision_id) REFERENCES decisions(id)
) ENGINE=InnoDB;
INSERT INTO modules(id,version,enabled) VALUES('polls','1.0.0',TRUE);
