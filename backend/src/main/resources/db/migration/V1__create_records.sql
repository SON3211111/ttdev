CREATE TABLE records (
    record_id BIGINT NOT NULL AUTO_INCREMENT,
    record_type VARCHAR(10) NOT NULL,
    title VARCHAR(100) NULL,
    content TEXT NOT NULL,
    record_date DATE NOT NULL,
    content_version BIGINT NOT NULL DEFAULT 1,
    embedding_status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    indexed_version BIGINT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (record_id),
    CONSTRAINT chk_record_type CHECK (record_type IN ('MEMO', 'DIARY')),
    CONSTRAINT chk_embedding_status CHECK (embedding_status IN ('PENDING', 'COMPLETED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_records_date ON records (record_date, created_at, record_id);
CREATE INDEX idx_records_type_date ON records (record_type, record_date, created_at, record_id);
