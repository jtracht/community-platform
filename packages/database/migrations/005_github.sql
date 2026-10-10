ALTER TABLE github_links ADD COLUMN remote_updated_at VARCHAR(50) NULL;
ALTER TABLE github_links ADD COLUMN remote_snapshot JSON NULL;
ALTER TABLE github_links ADD COLUMN last_synced_at DATETIME(3) NULL;
ALTER TABLE github_links ADD COLUMN next_retry_at DATETIME(3) NULL;
ALTER TABLE github_links ADD COLUMN attempts INT NOT NULL DEFAULT 0;
ALTER TABLE github_links ADD COLUMN conflict BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE github_pr_links (
 decision_id CHAR(36) NOT NULL, pull_number INT NOT NULL, url VARCHAR(500) NOT NULL,
 remote_state VARCHAR(40) NULL, merged BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(decision_id,pull_number), FOREIGN KEY(decision_id) REFERENCES decisions(id)
) ENGINE=InnoDB;
CREATE TABLE github_deliveries (
 delivery_id VARCHAR(100) PRIMARY KEY, event VARCHAR(50) NOT NULL,
 received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
ALTER TABLE platform_state ADD COLUMN github_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
