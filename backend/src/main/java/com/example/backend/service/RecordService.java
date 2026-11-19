/*
 * 기록을 저장해도 되는지 검사하고 DB 작업 순서를 정하는 곳입니다.
 * Controller가 요청을 넘기면 입력 정리 → 유효성 검사 → Repository로 DB 처리 → 응답 객체 생성 순으로 실행합니다.
 * 트랜잭션은 DB 작업을 하나로 묶는 단위입니다. 저장 도중 오류가 나면 DB 변경을 되돌리도록 합니다.
 * 메모를 저장할 때 AI 응답을 기다리지 않습니다. AI가 꺼져 있어도 원문 저장은 가능해야 하기 때문입니다.
 * PENDING은 '원문은 저장됐고 AI 검색 준비는 아직'이라는 뜻입니다. 검색 준비 기능은 이후 단계입니다.
 */
package com.example.backend.service;

import com.example.backend.repository.RecordRepository;
import com.example.backend.entity.MemoryRecord;
import com.example.backend.dto.RecordDtos;
import com.example.backend.exception.RecordException;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;

// 메모와 일기의 입력 검증 및 원문 저장을 담당합니다. 저장 과정에서 AI 서버를 호출하지 않습니다.
@Service
// 기본 메서드는 조회용입니다. 저장/수정/삭제 메서드에는 별도 @Transactional을 붙여 변경을 허용합니다.
@Transactional(readOnly = true)
public class RecordService {
    private final RecordRepository repository;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public RecordService(RecordRepository repository) {
        this(repository, Clock.systemUTC());
    }
    // Clock은 현재 시각을 알려주는 객체입니다. 별도 시계를 받도록 해두면 테스트에서 날짜를 고정할 수 있습니다.
    RecordService(RecordRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    // MEMO와 DIARY를 등록합니다. validate가 반환한 공백/줄바꿈 정리 결과를 저장합니다.
    // repository.save는 DB에 넣을 엔티티를 받고, Detail.from은 화면에 보낼 응답으로 바꿉니다.
    @Transactional
    public RecordDtos.Detail create(RecordDtos.Create request) {
        if (!"MEMO".equals(request.recordType()) && !"DIARY".equals(request.recordType()))
            throw RecordException.validation("recordType", "MEMO 또는 DIARY를 선택해주세요.");
        String content = validate(request.recordType(), request.title(), request.content(), request.recordDate());
        return RecordDtos.Detail.from(repository.save(new MemoryRecord(request.recordType(), normalizeTitle(request.title()), content, request.recordDate(), clock.instant())));
    }

    public RecordDtos.Detail detail(long id) { return RecordDtos.Detail.from(find(id)); }

    public RecordDtos.Listing list(String type, int page, int size) {
        return list(type, page, size, null, null);
    }

    public RecordDtos.Listing list(String type, int page, int size, LocalDate start, LocalDate end) {
        // 캘린더 기간 조회는 시작/끝을 함께 받아야 합니다. 현재는 종류 필터와 기간을 같이 지원하지 않습니다.
        if ((start == null) != (end == null) || (start != null && (start.isAfter(end) || type != null)))
            throw RecordException.invalid();
        if (type != null && !type.equals("MEMO") && !type.equals("DIARY"))
            throw RecordException.validation("type", "MEMO 또는 DIARY를 선택해주세요.");
        if (page < 0) throw RecordException.validation("page", "페이지는 0 이상이어야 합니다.");
        if (size < 1 || size > 100) throw RecordException.validation("size", "페이지 크기는 1~100입니다.");
        // page=2, size=5면 앞의 10개를 건너뛰고 읽습니다. 이 건너뛸 개수를 오프셋이라고 합니다.
        // 아주 큰 숫자가 int 범위를 넘어 잘못 계산되지 않게 long으로 곱하고 허용 범위를 확인합니다.
        if ((long) page * size > Integer.MAX_VALUE) throw RecordException.invalid();
        // 기록 날짜가 최신인 순서입니다. 같은 날짜면 실제 작성 시각, 그것도 같으면 ID가 큰 순서로 읽습니다.
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "recordDate", "createdAt", "id"));
        // 캘린더는 기간별, 최근 기록은 전체 또는 종류별로 조회합니다.
        var result = start != null ? repository.findByRecordDateBetween(start, end, pageable)
                : type == null ? repository.findAll(pageable) : repository.findByRecordType(type, pageable);

        return new RecordDtos.Listing(result.getContent().stream().map(RecordDtos.Item::from).toList(), page, size, result.getTotalElements(), result.getTotalPages());
    }
    @Transactional
    public RecordDtos.Detail update(long id, RecordDtos.Update request) {
        var record = find(id);
        String content = validate(record.getRecordType(), request.title(), request.content(), request.recordDate());
        record.revise(normalizeTitle(request.title()), content, request.recordDate(), clock.instant());
        return RecordDtos.Detail.from(record);
    }
    @Transactional
    public void delete(long id) { repository.delete(find(id)); }
    private MemoryRecord find(long id) {
        return repository.findById(id).orElseThrow(() -> new RecordException(404, "RECORD_NOT_FOUND", "기록을 찾을 수 없습니다.", null));
    }
    private String normalizeTitle(String title) { return title == null || title.strip().isEmpty() ? null : title.strip(); }
    // 메모의 제목 입력을 막고, 본문 줄바꿈을 통일한 뒤 길이와 서울 기준 날짜를 검사합니다.
    private String validate(String type, String title, String content, LocalDate date) {
        String heading = normalizeTitle(title);
        if ("MEMO".equals(type) && heading != null) throw RecordException.validation("title", "메모에는 제목을 입력하지 않습니다.");
        if (heading != null && heading.length() > 100) throw RecordException.validation("title", "제목은 100자 이내입니다.");
        String normalized = content == null ? "" : content.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (normalized.isBlank()) throw RecordException.validation("content", "본문을 입력해주세요.");
        if (normalized.length() > 10000) throw RecordException.validation("content", "본문은 10,000자 이내입니다.");
        if (date == null || date.isBefore(LocalDate.of(1000, 1, 1)) || date.isAfter(LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul")))))
            throw RecordException.validation("recordDate", "기록 날짜는 1000년 1월 1일부터 오늘까지 선택해주세요.");
        return normalized;
    }
}
