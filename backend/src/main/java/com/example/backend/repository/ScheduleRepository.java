package com.example.backend.repository;
import com.example.backend.entity.Schedule;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {
    // 같은 날 시간 미정은 뒤에 놓습니다. ID까지 정렬하여 페이지 사이 순서를 고정합니다.
    @Query("SELECT s FROM Schedule s WHERE s.scheduleDate BETWEEN :start AND :end " +
           "AND (:status IS NULL OR s.status = :status) " +
           "ORDER BY s.scheduleDate ASC, CASE WHEN s.scheduleTime IS NULL THEN 1 ELSE 0 END ASC, s.scheduleTime ASC, s.id ASC")
    Page<Schedule> list(@Param("start") LocalDate start, @Param("end") LocalDate end,
                        @Param("status") String status, Pageable pageable);
}
