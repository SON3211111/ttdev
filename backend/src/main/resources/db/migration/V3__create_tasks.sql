CREATE TABLE tasks (
    task_id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(100) NOT NULL,
    description TEXT NULL,
    status VARCHAR(10) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    due_date DATE NULL,
    completed_at DATETIME(6) NULL,
    completed_date DATE NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (task_id),
    CONSTRAINT chk_task_status CHECK (status IN ('TODO', 'DOING', 'DONE')),
    CONSTRAINT chk_task_priority CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
    CONSTRAINT chk_task_completion CHECK (
        (status = 'DONE' AND completed_at IS NOT NULL AND completed_date IS NOT NULL)
        OR (status <> 'DONE' AND completed_at IS NULL AND completed_date IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_tasks_status_due ON tasks (status, due_date);
CREATE INDEX idx_tasks_completed_date ON tasks (completed_date);

CREATE TABLE task_transitions (
    transition_id BIGINT NOT NULL AUTO_INCREMENT,
    task_id BIGINT NOT NULL,
    previous_status VARCHAR(10) NOT NULL,
    next_status VARCHAR(10) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    PRIMARY KEY (transition_id),
    CONSTRAINT fk_task_transitions_task FOREIGN KEY (task_id) REFERENCES tasks (task_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_task_transitions_task_id ON task_transitions (task_id, transition_id);
