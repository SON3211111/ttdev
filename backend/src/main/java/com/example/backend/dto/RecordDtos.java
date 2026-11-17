/*
 * 브라우저와 주고받을 데이터의 모양을 정의합니다. 이런 전달용 객체를 DTO라고 합니다.
 * Entity는 DB 저장용, DTO는 요청/응답용입니다. 분리하면 DB 내부 필드가 그대로 노출되지 않습니다.
 * Java의 record 문법은 값을 담는 클래스와 읽기 메서드를 간단히 만들어 줍니다. DB의 '기록'과는 다른 뜻입니다.
 * Create=등록 요청, Update=수정 요청, Detail=상세 응답, Item=목록 한 건, Listing=페이지 응답입니다.
 * 구조를 바꿀 때는 프론트 types/record.ts와 api/records.ts도 맞춰야 합니다.
 */
package com.example.backend.dto;

import com.example.backend.entity.MemoryRecord;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class RecordDtos {
    private RecordDtos() {}
    // 등록할 때 종류를 정합니다. 수정 데이터에는 recordType이 없어 메모를 일기로 바꿀 수 없습니다.
    public record Create(String recordType, String title, String content, LocalDate recordDate) {}
    public record Update(String title, String content, LocalDate recordDate) {}
    // 전체 본문(content)은 상세에서만 보냅니다. from은 엔티티 값을 응답용 객체로 옮기는 함수입니다.
    // DB의 큰 정수 ID는 JavaScript number로 옮기면 정확하지 않을 수 있어 문자열('12')로 보냅니다.
    public record Detail(String id, String recordType, String title, String content, LocalDate recordDate,
                         long contentVersion, String embeddingStatus, Long indexedVersion,
                         Instant createdAt, Instant updatedAt) {
        public static Detail from(MemoryRecord record) {
            return new Detail(record.getId().toString(), record.getRecordType(), record.getTitle(),
                    record.getContent(), record.getRecordDate(), record.getContentVersion(),
                    record.getEmbeddingStatus(), record.getIndexedVersion(), record.getCreatedAt(), record.getUpdatedAt());
        }
    }
    public record Item(String id, String recordType, String title, String preview, LocalDate recordDate,
                       long contentVersion, String embeddingStatus, Long indexedVersion,
                       Instant createdAt, Instant updatedAt) {
        public static Item from(MemoryRecord record) {
            String content = record.getContent().replace('\n', ' ');
            // 목록 미리보기는 줄바꿈을 공백으로 바꾼 앞 120개 문자입니다.
            // codePointCount/offsetByCodePoints는 😀처럼 UTF-16 두 칸을 쓰는 문자도 중간에서 자르지 않습니다.
            // 저장 길이 제한(UTF-16 10,000)과 목록 미리보기 길이는 서로 다른 규칙입니다.
            int end = content.offsetByCodePoints(0, Math.min(120, content.codePointCount(0, content.length())));
            return new Item(record.getId().toString(), record.getRecordType(), record.getTitle(),
                    content.substring(0, end), record.getRecordDate(), record.getContentVersion(),
                    record.getEmbeddingStatus(), record.getIndexedVersion(), record.getCreatedAt(), record.getUpdatedAt());
        }
    }
    public record Listing(List<Item> items, int page, int size, long totalElements, int totalPages) {}
}
