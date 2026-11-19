package com.example.backend.repository;

import com.example.backend.entity.TaskTransition;
import com.example.backend.entity.Task.Status;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

// 할 일별 변경 이력을 조회하고, 완료를 되돌릴 때 마지막 완료 이력을 찾습니다.
public interface TaskTransitionRepository extends JpaRepository<TaskTransition, Long> {
    List<TaskTransition> findByTaskIdOrderByIdDesc(long taskId);
    Optional<TaskTransition> findFirstByTaskIdAndNextStatusOrderByIdDesc(long taskId, Status status);
    void deleteByTaskId(long taskId);
}
