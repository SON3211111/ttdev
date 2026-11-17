package com.example.backend.controller;
import com.example.backend.dto.ScheduleDtos;
import com.example.backend.service.ScheduleService;
import com.example.backend.exception.RecordException;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.Set;

@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {
    private final ScheduleService service;
    public ScheduleController(ScheduleService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<ScheduleDtos.Detail> create(@RequestBody ScheduleDtos.Create request) {
        var result = service.create(request);
        return ResponseEntity.created(URI.create("/api/schedules/" + result.id())).body(result);
    }
    @GetMapping
    public ScheduleDtos.Listing list(@RequestParam MultiValueMap<String, String> params) {
        if (params.entrySet().stream().anyMatch(e -> !Set.of("page", "size").contains(e.getKey()) || e.getValue().size() != 1))
            throw RecordException.invalid();
        try {
            return service.list(Integer.parseInt(params.getFirst("page") == null ? "0" : params.getFirst("page")),
                Integer.parseInt(params.getFirst("size") == null ? "20" : params.getFirst("size")));
        } catch (NumberFormatException e) { throw RecordException.invalid(); }
    }
    @GetMapping("/{id}") public ScheduleDtos.Detail detail(@PathVariable String id) { return service.detail(id(id)); }
    @PutMapping("/{id}") public ScheduleDtos.Detail update(@PathVariable String id, @RequestBody ScheduleDtos.Update request) { return service.update(id(id), request); }
    @DeleteMapping("/{id}") public ResponseEntity<Void> delete(@PathVariable String id) { service.delete(id(id)); return ResponseEntity.noContent().build(); }
    private long id(String value) {
        try { long parsed = Long.parseLong(value); if (parsed < 1) throw RecordException.invalid(); return parsed; }
        catch (NumberFormatException e) { throw RecordException.invalid(); }
    }
}
