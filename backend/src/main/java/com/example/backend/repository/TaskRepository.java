package com.example.backend.repository;

import com.example.backend.entity.Task;
import com.example.backend.entity.Task.Status;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import java.time.LocalDate;
import java.util.*;

public interface TaskRepository extends JpaRepository<Task, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Task t where t.id = :id")
    Optional<Task> findForUpdate(long id);

    @Query("""
        select t from Task t where (:status is null or t.status = :status)
        order by case when t.dueDate is null then 1 else 0 end, t.dueDate, t.id desc
        """)
    Page<Task> list(Status status, Pageable page);

    @Query("""
        select t from Task t where t.status <> 'DONE'
        order by case when t.dueDate is null then 1 else 0 end, t.dueDate, t.id desc
        """)
    List<Task> focus(Pageable page);

    List<Task> findByDueDateBetweenOrderByDueDateAscIdDesc(LocalDate start, LocalDate end);

    interface Counts {
        long getTotal();
        long getDone();
        long getDoing();
        long getOverdue();
    }

    @Query("""
        select count(t) as total,
            coalesce(sum(case when t.status = 'DONE' then 1 else 0 end), 0) as done,
            coalesce(sum(case when t.status = 'DOING' then 1 else 0 end), 0) as doing,
            coalesce(sum(case when t.status <> 'DONE' and t.dueDate < :today then 1 else 0 end), 0) as overdue
        from Task t
        """)
    Counts counts(LocalDate today);

    interface DayCount {
        LocalDate getDay();
        long getCount();
    }

    @Query("""
        select t.completedDate as day, count(t) as count from Task t
        where t.completedDate between :start and :end
        group by t.completedDate
        """)
    List<DayCount> completedByDay(LocalDate start, LocalDate end);

    @Query("""
        select t.dueDate as day, count(t) as count from Task t
        where t.status <> 'DONE' and t.dueDate between :start and :end
        group by t.dueDate
        """)
    List<DayCount> upcomingDueByDay(LocalDate start, LocalDate end);
}
