/**
 * records 테이블을 읽고 저장하는 DB 창구입니다. Service가 이 인터페이스를 호출합니다.
 * JpaRepository<MemoryRecord, Long>은 '대상 엔티티는 MemoryRecord, ID 타입은 Long'이라는 뜻입니다.
 * findAll/save/findById/delete 같은 기본 메서드는 Spring Data JPA가 구현해 줍니다.
 * 아래 findBy... 메서드도 이름을 보고 조회 SQL을 만듭니다. Between은 시작/끝 날짜를 모두 포함합니다.
 * Pageable에는 페이지 번호/크기/정렬을 넣고, Page에는 결과 목록과 전체 개수가 담깁니다.
 */
package com.example.backend.repository;

import com.example.backend.entity.MemoryRecord;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecordRepository extends JpaRepository<MemoryRecord, Long> {
    Page<MemoryRecord> findByRecordDateBetween(java.time.LocalDate start, java.time.LocalDate end, Pageable pageable);
    Page<MemoryRecord> findByRecordType(String recordType, Pageable pageable);
}
