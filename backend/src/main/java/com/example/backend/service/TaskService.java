package com.example.backend.service;

import com.example.backend.dto.TaskDtos;
import com.example.backend.entity.Task;
import com.example.backend.entity.Task.Priority;
import com.example.backend.entity.Task.Status;
import com.example.backend.entity.TaskTransition;
import com.example.backend.exception.RecordException;
import com.example.backend.repository.TaskRepository;
import com.example.backend.repository.TaskTransitionRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class TaskService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final TaskRepository tasks;
    private final TaskTransitionRepository transitions;

    public TaskService(TaskRepository tasks, TaskTransitionRepository transitions) {
        this.tasks = tasks;
        this.transitions = transitions;
    }

    public TaskDtos.Listing list(Status status, int page) {
        if (page < 0 || (long) page * 20 > Integer.MAX_VALUE)
            throw RecordException.validation("page", "올바른 페이지를 지정해주세요.");
        var result = tasks.list(status, PageRequest.of(page, 20));
        LocalDate today = LocalDate.now(SEOUL);
        return new TaskDtos.Listing(result.map(task -> TaskDtos.Item.from(task, today)).getContent(), page, result.getTotalPages());
    }

    public List<TaskDtos.Item> focus() {
        LocalDate today = LocalDate.now(SEOUL);
        return tasks.focus(PageRequest.of(0, 3)).stream().map(task -> TaskDtos.Item.from(task, today)).toList();
    }

    public TaskDtos.Item detail(long id) {
        return TaskDtos.Item.from(tasks.findById(id).orElseThrow(TaskService::missing), LocalDate.now(SEOUL));
    }

    public List<TaskDtos.CalendarItem> calendar(YearMonth month) {
        return tasks.findByDueDateBetweenOrderByDueDateAscIdDesc(month.atDay(1), month.atEndOfMonth())
            .stream().map(TaskDtos.CalendarItem::from).toList();
    }

    @Transactional
    public TaskDtos.Item create(TaskDtos.Input request) {
        var input = validate(request);
        var task = tasks.save(new Task(input.title(), input.description(), input.priority(), input.dueDate(), now()));
        return TaskDtos.Item.from(task, LocalDate.now(SEOUL));
    }

    @Transactional
    public TaskDtos.Item edit(long id, TaskDtos.Input request) {
        var input = validate(request);
        Task task = findForUpdate(id);
        task.edit(input.title(), input.description(), request.priority() == null ? task.getPriority() : input.priority(), input.dueDate(), now());
        return TaskDtos.Item.from(task, LocalDate.now(SEOUL));
    }

    @Transactional
    public TaskDtos.Item status(long id, Status requested) {
        if (requested == null) throw RecordException.validation("status", "변경할 상태를 골라주세요.");
        // 한 작업을 동시에 완료해도 먼저 처리된 요청의 완료 시각과 이력만 남깁니다.
        Task task = findForUpdate(id);
        Status previous = task.getStatus();
        if (previous == requested) return TaskDtos.Item.from(task, LocalDate.now(SEOUL));
        return changeStatus(task, requested);
    }

    @Transactional
    public TaskDtos.Item reopen(long id) {
        Task task = findForUpdate(id);
        if (task.getStatus() != Status.DONE) return TaskDtos.Item.from(task, LocalDate.now(SEOUL));
        Status previous = transitions.findFirstByTaskIdAndNextStatusOrderByIdDesc(id, Status.DONE)
            .map(TaskTransition::getPreviousStatus).orElse(Status.TODO);
        return changeStatus(task, previous);
    }

    private TaskDtos.Item changeStatus(Task task, Status next) {
        Instant now = now();
        LocalDate today = now.atZone(SEOUL).toLocalDate();
        var event = new TaskTransition(task.getId(), task.getStatus(), next, now);
        task.changeStatus(next, now, today);
        transitions.save(event);
        return TaskDtos.Item.from(task, today);
    }

    public List<TaskDtos.Transition> history(long id) {
        if (!tasks.existsById(id)) throw missing();
        return transitions.findByTaskIdOrderByIdDesc(id).stream().map(TaskDtos.Transition::from).toList();
    }

    @Transactional
    public void delete(long id) {
        Task task = findForUpdate(id);
        transitions.deleteByTaskId(id);
        tasks.delete(task);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public TaskDtos.Dashboard dashboard() {
        LocalDate today = LocalDate.now(SEOUL);
        LocalDate start = today.minusDays(6);
        LocalDate end = today.plusDays(6);
        var totals = tasks.counts(today);
        var trend = fillDates(start, today, tasks.completedByDay(start, today));
        var upcomingDue = fillDates(today, end, tasks.upcomingDueByDay(today, end));
        return new TaskDtos.Dashboard(totals.getTotal(), totals.getDone(), totals.getDoing(), totals.getOverdue(), trend, upcomingDue);
    }

    private List<TaskDtos.Day> fillDates(LocalDate start, LocalDate end, List<TaskRepository.DayCount> rows) {
        Map<LocalDate, Long> byDay = new HashMap<>();
        for (var row : rows) byDay.put(row.getDay(), row.getCount());
        return start.datesUntil(end.plusDays(1))
            .map(date -> new TaskDtos.Day(date, byDay.getOrDefault(date, 0L))).toList();
    }

    private Task findForUpdate(long id) { return tasks.findForUpdate(id).orElseThrow(TaskService::missing); }

    private static RecordException missing() {
        return new RecordException(404, "TASK_NOT_FOUND", "일정을 찾을 수 없습니다.", null);
    }

    private static Instant now() { return Instant.now().truncatedTo(ChronoUnit.MICROS); }

    private TaskDtos.Input validate(TaskDtos.Input input) {
        String title = input.title() == null ? "" : input.title().strip();
        String description = input.description() == null ? "" : input.description().strip();
        if (title.isEmpty() || title.length() > 100) throw RecordException.validation("title", "일정 이름을 1~100자로 입력해주세요.");
        if (description.length() > 2000) throw RecordException.validation("description", "설명은 2,000자까지 입력할 수 있습니다.");
        LocalDate due = input.dueDate();
        if (due != null && (due.getYear() < 1000 || due.getYear() > 9999))
            throw RecordException.validation("dueDate", "마감일은 1000년부터 9999년까지 입력해주세요.");
        return new TaskDtos.Input(title, description.isEmpty() ? null : description,
            input.priority() == null ? Priority.NORMAL : input.priority(), due);
    }
}
