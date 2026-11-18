package com.example.backend.repository;

import com.example.backend.entity.TaskTransition;
import com.example.backend.entity.Task.Status;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface TaskTransitionRepository extends JpaRepository<TaskTransition, Long> {
    List<TaskTransition> findByTaskIdOrderByIdDesc(long taskId);
    Optional<TaskTransition> findFirstByTaskIdAndNextStatusOrderByIdDesc(long taskId, Status status);
    void deleteByTaskId(long taskId);
}
