package com.example.backend.service;
import com.example.backend.dto.ScheduleDtos;
import com.example.backend.entity.Schedule;
import com.example.backend.exception.RecordException;
import com.example.backend.repository.ScheduleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import java.time.*;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class ScheduleService {
    private final ScheduleRepository repository;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public ScheduleService(ScheduleRepository repository) { this(repository, Clock.systemUTC()); }
    ScheduleService(ScheduleRepository repository, Clock clock) { this.repository = repository; this.clock = clock; }
    @Transactional
    public ScheduleDtos.Detail create(ScheduleDtos.Create request) {
        var input = validate(request.title(), request.scheduleDate(), request.scheduleTime(), request.location(), request.description());
        return ScheduleDtos.Detail.from(repository.save(new Schedule(input.title(), request.scheduleDate(), input.time(), input.location(), input.description(), now())));
    }
    public ScheduleDtos.Detail detail(long id) { return ScheduleDtos.Detail.from(find(id)); }
    @Transactional
    public ScheduleDtos.Detail update(long id, ScheduleDtos.Update request) {
        var schedule = find(id);
        var input = validate(request.title(), request.scheduleDate(), request.scheduleTime(), request.location(), request.description());
        validateStatus(request.status());
        schedule.revise(input.title(), request.scheduleDate(), input.time(), input.location(), input.description(), request.status(), now());
        return ScheduleDtos.Detail.from(schedule);
    }
    @Transactional
    public void delete(long id) { repository.delete(find(id)); }
    public ScheduleDtos.Listing list(LocalDate start, LocalDate end, String status, int page, int size) {
        // 기간 생략은 서울 오늘~6일 후입니다. 한쪽만 있으면 모호하므로 거부합니다.
        if ((start == null) != (end == null)) throw RecordException.invalid();
        if (start == null) { start = LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul"))); end = start.plusDays(6); }
        validDate(start); validDate(end);
        if (start.isAfter(end)) throw RecordException.invalid();
        if (status != null) validateStatus(status);
        if (page < 0 || size < 1 || size > 100 || (long)page * size > Integer.MAX_VALUE)
            throw RecordException.validation("page", "페이지는 0 이상, 크기는 1~100으로 지정해주세요.");
        var result = repository.list(start, end, status, PageRequest.of(page, size));
        return new ScheduleDtos.Listing(result.getContent().stream().map(ScheduleDtos.Detail::from).toList(), page, size, result.getTotalElements(), result.getTotalPages());
    }
    // MySQL DATETIME(6)의 마이크로초 정밀도와 등록/수정 응답을 일치시킵니다.
    private Instant now() { return clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS); }
    private Schedule find(long id) {
        return repository.findById(id).orElseThrow(() -> new RecordException(404, "SCHEDULE_NOT_FOUND", "일정을 찾을 수 없습니다.", null));
    }
    private void validateStatus(String status) {
        if (status == null || !Set.of("PLANNED", "COMPLETED", "CANCELLED").contains(status))
            throw RecordException.validation("status", "예정·완료·취소 중 선택해주세요.");
    }
    private void validDate(LocalDate date) {
        if (date == null || date.isBefore(LocalDate.of(1000, 1, 1)) || date.isAfter(LocalDate.of(9999, 12, 31)))
            throw RecordException.validation("scheduleDate", "일정 날짜는 1000년부터 9999년까지 지정해주세요.");
    }
    private String text(String value, int max, String field) {
        String normalized = value == null ? "" : value.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (normalized.length() > max) throw RecordException.validation(field, "입력 길이를 확인해주세요. 최대 " + max + "자입니다.");
        return normalized.isEmpty() ? null : normalized;
    }
    private record Input(String title, LocalTime time, String location, String description) {}
    private Input validate(String title, LocalDate date, String time, String location, String description) {
        String heading = text(title, 100, "title");
        if (heading == null) throw RecordException.validation("title", "일정명을 입력해주세요.");
        validDate(date);
        LocalTime parsed = null;
        if (time != null && !time.isEmpty()) {
            if (!time.matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw RecordException.validation("scheduleTime", "시간은 HH:mm 형식으로 입력해주세요.");
            parsed = LocalTime.parse(time);
        }
        return new Input(heading, parsed, text(location, 200, "location"), text(description, 2000, "description"));
    }
}
