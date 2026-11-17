/*
 * DB records 테이블의 한 행을 Java 객체로 표현합니다. 이런 객체를 엔티티(Entity)라고 합니다.
 * @Entity는 JPA가 DB와 연결해 관리할 클래스, @Table은 실제 테이블 이름을 지정합니다.
 * @Column은 필드가 저장될 열의 이름/길이/빈 값 허용 여부를 설명합니다.
 * 테이블 생성 SQL은 resources/db/migration/V1__create_records.sql에 있습니다.
 * 이미 적용한 SQL 파일은 Flyway가 변경 여부를 검사하므로 주석만 바꾸더라도 수정하면 안 됩니다.
 */
package com.example.backend.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;

@Entity
@Table(name = "records")
public class MemoryRecord {
    @Id
    // IDENTITY는 DB의 AUTO_INCREMENT를 사용합니다. 새 메모 번호는 DB가 자동으로 정합니다.
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "record_id")
    private Long id;
    @Column(nullable = false, length = 10)
    // 기록 종류입니다. MEMO와 DIARY를 지원하며 수정 시 종류는 바꾸지 않습니다.
    private String recordType;
    @Column(length = 100)
    private String title;
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;
    @Column(nullable = false)
    // 실제 경험한 날입니다. 오늘 작성한 어제의 메모라면 recordDate는 어제, createdAt은 오늘입니다.
    private LocalDate recordDate;
    @Column(nullable = false)
    private long contentVersion;
    // AI 검색 준비 상태입니다. PENDING=대기, COMPLETED=완료, FAILED=실패. 처리 기능은 아직 없습니다.
    @Column(nullable = false, length = 10)
    private String embeddingStatus;
    // AI 검색용 데이터에 마지막으로 반영한 원문 버전입니다. 아직 처리하지 않았으면 null입니다.
    private Long indexedVersion;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;

    // JPA가 DB에서 읽은 값으로 객체를 만들 때 쓰는 기본 생성자입니다.
    protected MemoryRecord() {}

    // 새 기록은 버전 1로 시작합니다. 검색용 숫자 데이터(임베딩)를 아직 만들지 않았으므로 PENDING입니다.
    // Instant는 특정 시점을 나타냅니다. createdAt/updatedAt은 UTC 기준으로 저장합니다.
    public MemoryRecord(String content, LocalDate date, Instant now) {
        this("MEMO", null, content, date, now);
    }

    public MemoryRecord(String type, String title, String content, LocalDate date, Instant now) {
        recordType = type;
        this.title = title;
        this.content = content;
        recordDate = date;
        contentVersion = 1;
        embeddingStatus = "PENDING";
        createdAt = now;
        updatedAt = now;
    }

    // 똑같은 내용/날짜로 저장했다면 할 일이 없습니다. 바뀌었을 때만 버전과 수정 시각을 갱신합니다.
    // PENDING으로 돌려놓는 이유는 기존 AI 검색 데이터가 수정 전 본문을 가리킬 수 있기 때문입니다.
    public void revise(String title, String content, LocalDate date, Instant now) {
        if (Objects.equals(this.title, title) && Objects.equals(this.content, content) && Objects.equals(recordDate, date)) return;
        this.content = content;
        recordDate = date;
        this.title = title;
        contentVersion++;
        embeddingStatus = "PENDING";
        updatedAt = now;
    }

    public Long getId() { return id; }
    public String getRecordType() { return recordType; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public LocalDate getRecordDate() { return recordDate; }
    public long getContentVersion() { return contentVersion; }
    public String getEmbeddingStatus() { return embeddingStatus; }
    public Long getIndexedVersion() { return indexedVersion; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
