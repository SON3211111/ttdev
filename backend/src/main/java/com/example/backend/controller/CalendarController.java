package com.example.backend.controller;

import com.example.backend.dto.ScheduleDtos;
import com.example.backend.dto.TaskDtos;
import com.example.backend.exception.RecordException;
import com.example.backend.service.ScheduleService;
import com.example.backend.service.TaskService;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

// 달력에서 사용할 약속과 할 일의 월간 요약을 제공합니다. 기록은 별도 기록 목록 API로 조회합니다.
@RestController
public class CalendarController {
    private final ScheduleService schedules;
    private final TaskService tasks;

    public CalendarController(ScheduleService schedules, TaskService tasks) {
        this.schedules = schedules;
        this.tasks = tasks;
    }

    @GetMapping("/api/calendar/schedules")
    public List<ScheduleDtos.CalendarItem> schedules(@RequestParam MultiValueMap<String, String> params) {
        return schedules.calendar(month(params));
    }

    @GetMapping("/api/calendar/tasks")
    public List<TaskDtos.CalendarItem> tasks(@RequestParam MultiValueMap<String, String> params) {
        return tasks.calendar(month(params));
    }

    private YearMonth month(MultiValueMap<String, String> params) {
        var months = params.get("month");
        if (params.size() != 1 || months == null || months.size() != 1 ||
            !months.get(0).matches("[1-9]\\d{3}-\\d{2}")) {
            throw RecordException.validation("month", "조회할 월은 YYYY-MM 형식으로 지정해주세요.");
        }
        try {
            return YearMonth.parse(months.get(0));
        } catch (DateTimeParseException error) {
            throw RecordException.validation("month", "유효한 월을 지정해주세요.");
        }
    }
}
