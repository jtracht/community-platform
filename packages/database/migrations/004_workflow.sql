CREATE TABLE admin_grants (
 admin_id CHAR(36) NOT NULL, permission VARCHAR(100) NOT NULL, PRIMARY KEY(admin_id,permission),
 FOREIGN KEY(admin_id) REFERENCES admins(id)
) ENGINE=InnoDB;
CREATE TABLE idea_appeals (
 id CHAR(36) PRIMARY KEY, idea_id CHAR(36) NOT NULL, content TEXT NOT NULL,
 status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending', response TEXT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(idea_id) REFERENCES ideas(id), INDEX pending(status)
) ENGINE=InnoDB;
ALTER TABLE decisions ADD COLUMN workflow_step VARCHAR(100) NOT NULL DEFAULT 'requirement_clarification';
ALTER TABLE decisions ADD COLUMN requirements TEXT NULL;
CREATE TABLE decision_events (
 sequence BIGINT AUTO_INCREMENT PRIMARY KEY, decision_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 previous_step VARCHAR(100) NOT NULL, next_step VARCHAR(100) NOT NULL, reason VARCHAR(1000) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(decision_id) REFERENCES decisions(id), FOREIGN KEY(actor_id) REFERENCES admins(id)
) ENGINE=InnoDB;
CREATE TABLE evaluations (
 id CHAR(36) PRIMARY KEY, decision_id CHAR(36) NOT NULL, sentiment ENUM('positive','neutral','negative') NOT NULL,
 content TEXT NOT NULL, origin VARCHAR(200) NOT NULL, status ENUM('recorded','reviewed','accepted','rejected') NOT NULL DEFAULT 'recorded',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(decision_id) REFERENCES decisions(id)
) ENGINE=InnoDB;
ALTER TABLE development_tasks ADD COLUMN requirements TEXT NULL;
ALTER TABLE development_tasks ADD COLUMN release_approved BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE task_dependencies (
 task_id CHAR(36) NOT NULL, depends_on CHAR(36) NOT NULL, PRIMARY KEY(task_id,depends_on),
 FOREIGN KEY(task_id) REFERENCES development_tasks(id), FOREIGN KEY(depends_on) REFERENCES development_tasks(id)
) ENGINE=InnoDB;
CREATE TABLE workflow_config (
 id TINYINT PRIMARY KEY, steps JSON NOT NULL
) ENGINE=InnoDB;
INSERT INTO workflow_config VALUES(1,'["idea_collection","precheck","owner_approval","shortlist","prioritization","requirement_clarification","planning","implementation","review","release","evaluation"]');
CREATE TABLE schedule_history (
 sequence BIGINT AUTO_INCREMENT PRIMARY KEY, poll_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
 previous_start DATETIME(3) NOT NULL, previous_end DATETIME(3) NOT NULL, next_start DATETIME(3) NOT NULL, next_end DATETIME(3) NOT NULL,
 reason VARCHAR(1000) NOT NULL, changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(poll_id) REFERENCES polls(id)
) ENGINE=InnoDB;
CREATE TABLE module_history (
 sequence BIGINT AUTO_INCREMENT PRIMARY KEY, module_id VARCHAR(100) NOT NULL, previous_version VARCHAR(30) NOT NULL,
 next_version VARCHAR(30) NOT NULL, previous_enabled BOOLEAN NOT NULL, next_enabled BOOLEAN NOT NULL, actor_id CHAR(36) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(module_id) REFERENCES modules(id)
) ENGINE=InnoDB;
CREATE TABLE legal_versions (
 hash CHAR(64) PRIMARY KEY, content TEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
