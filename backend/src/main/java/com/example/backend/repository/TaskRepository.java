package com.example.backend.repository;

import com.example.backend.entity.Task;
import com.example.backend.entity.Task.Status;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import java.time.LocalDate;
import java.util.*;

public interface TaskRepository extends JpaRepository<Task, Long> {
    // 상태 변경이나 삭제 전에 행을 잠가 같은 할 일에 대한 쓰기 요청을 순서대로 처리합니다.
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

    // 전체와 상태별 건수, 마감일이 오늘보다 이른 미완료 건수를 한 쿼리에서 읽습니다.
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

    // 두 주간 그래프가 공유하는 날짜별 집계 결과입니다. 결과에 없는 날짜는 서비스에서 채웁니다.
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
