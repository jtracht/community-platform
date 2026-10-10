CREATE TABLE security_events (
 id CHAR(36) PRIMARY KEY, status INT NOT NULL, path VARCHAR(200) NOT NULL,
 source_hash CHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX recent(created_at)
) ENGINE=InnoDB;
ALTER TABLE github_pr_links ADD COLUMN remote_updated_at VARCHAR(50) NULL;
