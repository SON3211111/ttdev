/*
 * 브라우저가 /api/records로 보낸 요청을 처음 받는 곳입니다.
 * CRUD는 등록(Create), 조회(Read), 수정(Update), 삭제(Delete)를 줄인 말입니다.
 * Controller는 주소/입력 형식을 확인하고 Service에 실제 처리를 맡긴 뒤 응답을 보냅니다.
 * 전체 흐름: 프론트 recordsApi → 이 Controller → RecordService → RecordRepository → DB.
 * HTTP 상태 번호: 200=성공, 201=등록 성공, 204=성공/응답 본문 없음, 400=잘못된 요청, 404=기록 없음.
 */
package com.example.backend.controller;

import com.example.backend.service.RecordService;
import com.example.backend.dto.RecordDtos;
import com.example.backend.exception.RecordException;

import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.Set;

// 기록 API의 입력을 해석하고 목록·상세·변경 요청을 RecordService로 전달합니다.
@RestController
// 이 클래스 안의 모든 주소 앞에 /api/records가 붙습니다.
@RequestMapping("/api/records")
public class RecordController {
    private final RecordService service;
    // Spring이 만들어 둔 RecordService를 생성자로 전달합니다. 직접 new로 만들 필요가 없습니다.
    public RecordController(RecordService service) { this.service = service; }

    @PostMapping
    public ResponseEntity<RecordDtos.Detail> create(@RequestBody RecordDtos.Create request) {
        var result = service.create(request);
        // @RequestBody는 브라우저가 보낸 JSON을 Create 객체로 바꿉니다.
        // Location은 새 기록을 다시 조회할 주소입니다. 예: /api/records/12.
        return ResponseEntity.created(URI.create("/api/records/" + result.id())).body(result);
    }
    @GetMapping
    public RecordDtos.Listing list(@RequestParam MultiValueMap<String, String> params) {
        // 쿼리는 주소의 ? 뒤 조건입니다. 예: ?type=MEMO&page=0&size=5.
        // MultiValueMap은 같은 이름의 값 여러 개도 담습니다. page=0&page=1처럼 모호한 요청은 거부합니다.
        // 지원하지 않는 검색어를 그냥 무시하면 검색된 줄 오해하므로 허용한 이름만 받습니다.
        if (params.entrySet().stream().anyMatch(entry ->
                !Set.of("type", "page", "size", "start", "end").contains(entry.getKey()) || entry.getValue().size() != 1))
            throw RecordException.invalid();
        try {
            // 쿼리는 문자열로 들어옵니다. 숫자/날짜로 바꾸고, 생략한 page/size에는 기본값 0/20을 줍니다.
            return service.list(params.getFirst("type"),
                    Integer.parseInt(params.getFirst("page") == null ? "0" : params.getFirst("page")),
                    Integer.parseInt(params.getFirst("size") == null ? "20" : params.getFirst("size")),
                    params.getFirst("start") == null ? null : java.time.LocalDate.parse(params.getFirst("start")),
                    params.getFirst("end") == null ? null : java.time.LocalDate.parse(params.getFirst("end")));
        } catch (NumberFormatException | java.time.format.DateTimeParseException exception) { throw RecordException.invalid(); }
    }
    @GetMapping("/{id}")
    public RecordDtos.Detail detail(@PathVariable String id) { return service.detail(parseId(id)); }
    @PutMapping("/{id}")
    public RecordDtos.Detail update(@PathVariable String id, @RequestBody RecordDtos.Update request) {
        return service.update(parseId(id), request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(parseId(id));
        return ResponseEntity.noContent().build();
    }
    // /api/records/12의 12가 ID입니다. DB를 찾기 전에 양의 정수인지 검사합니다.
    // 'abc'나 0은 400, 숫자는 맞지만 DB에 없는 ID는 Service에서 404로 처리합니다.
    private long parseId(String value) {
        try {
            long id = Long.parseLong(value);
            if (id < 1) throw RecordException.invalid();
            return id;
        } catch (NumberFormatException exception) { throw RecordException.invalid(); }
    }
}
