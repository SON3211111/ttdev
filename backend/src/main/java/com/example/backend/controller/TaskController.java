package com.example.backend.controller;

import com.example.backend.dto.TaskDtos;
import com.example.backend.entity.Task.Status;
import com.example.backend.exception.RecordException;
import com.example.backend.service.TaskService;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.*;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService service;

    public TaskController(TaskService service) { this.service = service; }

    @GetMapping
    public TaskDtos.Listing list(@RequestParam MultiValueMap<String, String> params) {
        if (params.entrySet().stream().anyMatch(entry -> !Set.of("status", "page").contains(entry.getKey()) || entry.getValue().size() != 1))
            throw RecordException.invalid();
        try {
            String status = params.getFirst("status");
            String page = params.getFirst("page");
            return service.list(status == null ? null : Status.valueOf(status), page == null ? 0 : Integer.parseInt(page));
        } catch (IllegalArgumentException error) {
            throw RecordException.invalid();
        }
    }

    @GetMapping("/focus") public List<TaskDtos.Item> focus() { return service.focus(); }
    @GetMapping("/dashboard") public TaskDtos.Dashboard dashboard() { return service.dashboard(); }

    @PostMapping
    public ResponseEntity<TaskDtos.Item> create(@RequestBody TaskDtos.Input request) {
        var item = service.create(request);
        return ResponseEntity.created(URI.create("/api/tasks/" + item.id())).body(item);
    }

    @GetMapping("/{id}") public TaskDtos.Item detail(@PathVariable long id) { return service.detail(validId(id)); }
    @PutMapping("/{id}") public TaskDtos.Item edit(@PathVariable long id, @RequestBody TaskDtos.Input request) {
        return service.edit(validId(id), request);
    }
    @PutMapping("/{id}/status") public TaskDtos.Item status(@PathVariable long id, @RequestBody TaskDtos.StatusInput request) {
        return service.status(validId(id), request.status());
    }
    @PutMapping("/{id}/reopen") public TaskDtos.Item reopen(@PathVariable long id) { return service.reopen(validId(id)); }
    @GetMapping("/{id}/history") public List<TaskDtos.Transition> history(@PathVariable long id) { return service.history(validId(id)); }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        service.delete(validId(id));
        return ResponseEntity.noContent().build();
    }

    private long validId(long id) {
        if (id < 1) throw RecordException.invalid();
        return id;
    }
}
