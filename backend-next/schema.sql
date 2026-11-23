CREATE TABLE records (
    record_id BIGINT IDENTITY(1,1) NOT NULL,
    record_type VARCHAR(10) NOT NULL,
    title NVARCHAR(100) NULL,
    content NVARCHAR(MAX) NOT NULL,
    record_date DATE NOT NULL,
    content_version BIGINT NOT NULL DEFAULT 1,
    embedding_status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    indexed_version BIGINT NULL,
    created_at DATETIME2(3) NOT NULL,
    updated_at DATETIME2(3) NOT NULL,
    PRIMARY KEY (record_id),
    CONSTRAINT chk_record_type CHECK (record_type IN ('MEMO', 'DIARY')),
    CONSTRAINT chk_embedding_status CHECK (embedding_status IN ('PENDING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_records_date ON records (record_date, created_at, record_id);
CREATE INDEX idx_records_type_date ON records (record_type, record_date, created_at, record_id);

CREATE TABLE schedules (
    schedule_id BIGINT IDENTITY(1,1) NOT NULL,
    title NVARCHAR(100) NOT NULL,
    schedule_date DATE NOT NULL,
    schedule_time TIME NULL,
    location NVARCHAR(200) NULL,
    description NVARCHAR(MAX) NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'PLANNED',
    created_at DATETIME2(3) NOT NULL,
    updated_at DATETIME2(3) NOT NULL,
    PRIMARY KEY (schedule_id),
    CONSTRAINT chk_schedule_status CHECK (status IN ('PLANNED', 'COMPLETED', 'CANCELLED'))
);
CREATE INDEX idx_schedules_status_date ON schedules (status, schedule_date, schedule_time, schedule_id);
CREATE INDEX idx_schedules_date ON schedules (schedule_date, schedule_time, schedule_id);

CREATE TABLE tasks (
    task_id BIGINT IDENTITY(1,1) NOT NULL,
    title NVARCHAR(100) NOT NULL,
    description NVARCHAR(MAX) NULL,
    status VARCHAR(10) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    due_date DATE NULL,
    completed_at DATETIME2(3) NULL,
    completed_date DATE NULL,
    created_at DATETIME2(3) NOT NULL,
    updated_at DATETIME2(3) NOT NULL,
    PRIMARY KEY (task_id),
    CONSTRAINT chk_task_status CHECK (status IN ('TODO', 'DOING', 'DONE')),
    CONSTRAINT chk_task_priority CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
    CONSTRAINT chk_task_completion CHECK (
        (status = 'DONE' AND completed_at IS NOT NULL AND completed_date IS NOT NULL)
        OR (status <> 'DONE' AND completed_at IS NULL AND completed_date IS NULL)
    )
);
CREATE INDEX idx_tasks_status_due ON tasks (status, due_date);
CREATE INDEX idx_tasks_completed_date ON tasks (completed_date);

CREATE TABLE task_transitions (
    transition_id BIGINT IDENTITY(1,1) NOT NULL,
    task_id BIGINT NOT NULL,
    previous_status VARCHAR(10) NOT NULL,
    next_status VARCHAR(10) NOT NULL,
    changed_at DATETIME2(3) NOT NULL,
    PRIMARY KEY (transition_id),
    CONSTRAINT fk_task_transitions_task FOREIGN KEY (task_id) REFERENCES tasks (task_id) ON DELETE CASCADE
);
CREATE INDEX idx_task_transitions_task_id ON task_transitions (task_id, transition_id);
