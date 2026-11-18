package com.example.backend.entity;

import jakarta.persistence.*;
import com.example.backend.entity.Task.Status;
import java.time.Instant;

@Entity
@Table(name = "task_transitions")
public class TaskTransition {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "transition_id")
    private Long id;
    @Column(nullable = false)
    private Long taskId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private Status previousStatus;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private Status nextStatus;
    @Column(nullable = false)
    private Instant changedAt;

    protected TaskTransition() {}

    public TaskTransition(Long taskId, Status previousStatus, Status nextStatus, Instant changedAt) {
        this.taskId = taskId;
        this.previousStatus = previousStatus;
        this.nextStatus = nextStatus;
        this.changedAt = changedAt;
    }

    public Status getPreviousStatus() { return previousStatus; }
    public Status getNextStatus() { return nextStatus; }
    public Instant getChangedAt() { return changedAt; }
}
