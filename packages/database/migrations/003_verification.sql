CREATE TABLE participants (
 id CHAR(36) PRIMARY KEY, email_hash CHAR(64) NOT NULL UNIQUE, email_encrypted TEXT NOT NULL,
 verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), disabled BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;
CREATE TABLE verification_tokens (
 token_hash CHAR(64) PRIMARY KEY, poll_id CHAR(36) NOT NULL,
 mode ENUM('email','account') NOT NULL, email_hash CHAR(64) NOT NULL, email_encrypted TEXT NOT NULL,
 expires_at DATETIME(3) NOT NULL, consumed BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(poll_id) REFERENCES polls(id), INDEX recipient_limit(email_hash,created_at), INDEX token_expiry(expires_at)
) ENGINE=InnoDB;
CREATE TABLE participant_sessions (
 token_hash CHAR(64) PRIMARY KEY, identity_key VARCHAR(100) NOT NULL, poll_id CHAR(36) NULL,
 mode ENUM('email','account') NOT NULL, participant_id CHAR(36) NULL, expires_at DATETIME(3) NOT NULL,
 FOREIGN KEY(poll_id) REFERENCES polls(id), FOREIGN KEY(participant_id) REFERENCES participants(id), INDEX expiry(expires_at)
) ENGINE=InnoDB;
CREATE TABLE mail_jobs (
 id CHAR(36) PRIMARY KEY, verification_hash CHAR(64) NOT NULL UNIQUE,
 payload_encrypted TEXT NOT NULL, status ENUM('queued','sending','sent','uncertain','expired') NOT NULL DEFAULT 'queued',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), expires_at DATETIME(3) NOT NULL,
 last_error VARCHAR(200) NULL, INDEX pending(status,expires_at)
) ENGINE=InnoDB;
ALTER TABLE votes ADD COLUMN contribution_terms_hash CHAR(64) NULL;
