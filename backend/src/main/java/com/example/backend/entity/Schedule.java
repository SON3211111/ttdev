package com.example.backend.entity;

import jakarta.persistence.*;
import java.time.*;

// 일정 원본입니다. 기록과 독립적으로 저장하며 AI 호출이나 상태 자동 변경은 없습니다.
@Entity
@Table(name = "schedules")
public class Schedule {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "schedule_id") private Long id;
    @Column(nullable = false, length = 100) private String title;
    @Column(nullable = false) private LocalDate scheduleDate;
    // JDBC에서 서울 현지 시각을 직접 저장하여 JVM/UTC 변환으로 시간이 밀리지 않게 합니다.
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.LOCAL_TIME)
    private LocalTime scheduleTime;
    @Column(length = 200) private String location;
    @Column(columnDefinition = "TEXT") private String description;
    @Column(nullable = false, length = 10) private String status;
    @Column(nullable = false) private Instant createdAt;
    @Column(nullable = false) private Instant updatedAt;
    protected Schedule() {}
    public Schedule(String title, LocalDate date, LocalTime time, String location, String description, Instant now) {
        createdAt = now;
        revise(title, date, time, location, description, "PLANNED", now);
    }
    public void revise(String title, LocalDate date, LocalTime time, String location, String description, String status, Instant now) {
        this.title = title; scheduleDate = date; scheduleTime = time;
        this.location = location; this.description = description; this.status = status; updatedAt = now;
    }
    public Long getId() { return id; }
    public String getTitle() { return title; }
    public LocalDate getScheduleDate() { return scheduleDate; }
    public LocalTime getScheduleTime() { return scheduleTime; }
    public String getLocation() { return location; }
    public String getDescription() { return description; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
