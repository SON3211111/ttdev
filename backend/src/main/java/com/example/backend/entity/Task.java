package com.example.backend.entity;

import jakarta.persistence.*;
import java.time.*;

@Entity
@Table(name = "tasks")
public class Task {
    public enum Status { TODO, DOING, DONE }
    public enum Priority { LOW, NORMAL, HIGH }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "task_id")
    private Long id;
    @Column(nullable = false, length = 100)
    private String title;
    @Column(columnDefinition = "TEXT")
    private String description;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private Status status = Status.TODO;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private Priority priority;
    private LocalDate dueDate;
    private Instant completedAt;
    private LocalDate completedDate;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;

    protected Task() {}

    public Task(String title, String description, Priority priority, LocalDate dueDate, Instant now) {
        createdAt = now;
        edit(title, description, priority, dueDate, now);
    }

    public void edit(String title, String description, Priority priority, LocalDate dueDate, Instant now) {
        this.title = title;
        this.description = description;
        this.priority = priority;
        this.dueDate = dueDate;
        updatedAt = now;
    }

    // 완료 상태일 때만 완료 시각과 서울 기준 완료 날짜를 유지합니다. 완료 날짜는 주간 집계에 쓰입니다.
    public void changeStatus(Status next, Instant now, LocalDate seoulDate) {
        status = next;
        completedAt = next == Status.DONE ? now : null;
        completedDate = next == Status.DONE ? seoulDate : null;
        updatedAt = now;
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public Status getStatus() { return status; }
    public Priority getPriority() { return priority; }
    public LocalDate getDueDate() { return dueDate; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
