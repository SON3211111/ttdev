package com.example.backend.dto;

import com.example.backend.entity.Task;
import com.example.backend.entity.Task.Priority;
import com.example.backend.entity.Task.Status;
import com.example.backend.entity.TaskTransition;
import java.time.*;
import java.util.List;

public final class TaskDtos {
    private TaskDtos() {}

    public record Input(String title, String description, Priority priority, LocalDate dueDate) {}
    public record StatusInput(Status status) {}
    public record Item(String id, String title, String description, Status status, Priority priority,
                       LocalDate dueDate, Instant completedAt, Instant createdAt, Instant updatedAt, boolean overdue) {
        public static Item from(Task task, LocalDate today) {
            LocalDate due = task.getDueDate();
            boolean overdue = task.getStatus() != Status.DONE && due != null && due.isBefore(today);
            return new Item(task.getId().toString(), task.getTitle(), task.getDescription(), task.getStatus(),
                task.getPriority(), due, task.getCompletedAt(), task.getCreatedAt(), task.getUpdatedAt(), overdue);
        }
    }
    public record Listing(List<Item> items, int page, int totalPages) {}
    public record CalendarItem(String id, String title, LocalDate dueDate, Status status) {
        public static CalendarItem from(Task task) {
            return new CalendarItem(task.getId().toString(), task.getTitle(), task.getDueDate(), task.getStatus());
        }
    }
    public record Transition(Status previousStatus, Status nextStatus, Instant changedAt) {
        public static Transition from(TaskTransition event) {
            return new Transition(event.getPreviousStatus(), event.getNextStatus(), event.getChangedAt());
        }
    }
    public record Day(LocalDate date, long count) {}
    public record Dashboard(long total, long done, long doing, long overdue, List<Day> trend, List<Day> upcomingDue) {}
}
