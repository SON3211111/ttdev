CREATE TABLE schedules (
    schedule_id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(100) NOT NULL,
    schedule_date DATE NOT NULL,
    schedule_time TIME NULL,
    location VARCHAR(200) NULL,
    description TEXT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'PLANNED',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (schedule_id),
    CONSTRAINT chk_schedule_status CHECK (status IN ('PLANNED', 'COMPLETED', 'CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_schedules_status_date ON schedules (status, schedule_date, schedule_time, schedule_id);
CREATE INDEX idx_schedules_date ON schedules (schedule_date, schedule_time, schedule_id);
