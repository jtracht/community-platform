CREATE TABLE evaluation_github_links (
 evaluation_id CHAR(36) PRIMARY KEY, state ENUM('pending','created','uncertain') NOT NULL,
 issue_number INT NULL, issue_url VARCHAR(500) NULL, remote_state VARCHAR(40) NULL,
 title VARCHAR(200) NOT NULL, body TEXT NOT NULL, last_error VARCHAR(200) NULL,
 FOREIGN KEY(evaluation_id) REFERENCES evaluations(id)
) ENGINE=InnoDB;
CREATE TABLE rate_windows (
 bucket_hash CHAR(64) PRIMARY KEY, requests INT NOT NULL, expires_at DATETIME(3) NOT NULL, INDEX expiry(expires_at)
) ENGINE=InnoDB;
