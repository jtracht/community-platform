CREATE TABLE security_reports (
 id CHAR(36) PRIMARY KEY, created_by CHAR(36) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), snapshot JSON NOT NULL,
 FOREIGN KEY(created_by) REFERENCES admins(id), INDEX reports_recent(created_at,id)
) ENGINE=InnoDB;
CREATE TABLE security_reviews (
 id CHAR(36) PRIMARY KEY, report_id CHAR(36) NOT NULL, assigned_to CHAR(36) NOT NULL,
 created_by CHAR(36) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 topic VARCHAR(30) NOT NULL, title VARCHAR(160) NOT NULL,
 outcome ENUM('passed','attention','failed') NOT NULL, notes TEXT NOT NULL,
 supersedes_id CHAR(36) NULL UNIQUE,
 FOREIGN KEY(report_id) REFERENCES security_reports(id),
 FOREIGN KEY(assigned_to) REFERENCES admins(id), FOREIGN KEY(created_by) REFERENCES admins(id),
 FOREIGN KEY(supersedes_id) REFERENCES security_reviews(id), INDEX report_history(report_id,created_at,id)
) ENGINE=InnoDB;
