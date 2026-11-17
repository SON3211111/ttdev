package com.example.backend.dto;
import com.example.backend.entity.Schedule;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.List;

public final class ScheduleDtos {
    private ScheduleDtos() {}
    // 시간은 HH:mm만 받으며 등록 상태는 항상 예정입니다.
    public record Create(String title, LocalDate scheduleDate, String scheduleTime, String location, String description) {}
    public record Update(String title, LocalDate scheduleDate, String scheduleTime, String location, String description, String status) {}
    public record Detail(String id, String title, LocalDate scheduleDate, String scheduleTime, String location,
                         String description, String status, Instant createdAt, Instant updatedAt) {
        public static Detail from(Schedule value) {
            return new Detail(value.getId().toString(), value.getTitle(), value.getScheduleDate(),
                value.getScheduleTime() == null ? null : value.getScheduleTime().format(DateTimeFormatter.ofPattern("HH:mm")),
                value.getLocation(), value.getDescription(), value.getStatus(), value.getCreatedAt(), value.getUpdatedAt());
        }
    }
    public record Listing(List<Detail> items, int page, int size, long totalElements, int totalPages) {}
}
