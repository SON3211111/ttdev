package com.example.backend.controller;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

// H2로 HTTP 계약과 정렬을 검증합니다. 실제 MySQL 마이그레이션은 별도로 확인합니다.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ScheduleApiTests {
    @LocalServerPort int port;
    final HttpClient http = HttpClient.newHttpClient();
    final ObjectMapper json = new ObjectMapper();
    HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/schedules" + path)).header("Content-Type", "application/json");
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(), HttpResponse.BodyHandlers.ofString());
    }
    Map<String,Object> input(String title, String date, String time) {
        var result = new HashMap<String,Object>();
        result.put("title", title); result.put("scheduleDate", date); result.put("scheduleTime", time);
        result.put("location", "  장소  "); result.put("description", " 첫 줄\r\n둘째 줄 "); return result;
    }
    String create(Map<String,Object> body) throws Exception {
        var response = request("POST", "", body);
        assertEquals(201, response.statusCode(), response.body());
        String id = json.readTree(response.body()).get("id").asText();
        assertEquals("/api/schedules/" + id, response.headers().firstValue("Location").orElseThrow());
        return "/" + id;
    }
    @Test void crudOptionalFieldsAndExplicitStatus() throws Exception {
        String path = create(input("  일정  ", "2020-02-29", null));
        try {
            var detail = json.readTree(request("GET", path, null).body());
            assertEquals(0, Instant.parse(detail.get("createdAt").asText()).getNano() % 1000);
            assertEquals("일정", detail.get("title").asText());
            assertEquals("PLANNED", detail.get("status").asText());
            assertTrue(detail.get("scheduleTime").isNull());
            assertEquals("장소", detail.get("location").asText());
            assertEquals("첫 줄\n둘째 줄", detail.get("description").asText());
            assertTrue(detail.get("createdAt").asText().endsWith("Z"));
            var body = input("수정", "2020-03-01", "09:05"); body.put("status", "COMPLETED"); body.put("location", " "); body.put("description", "");
            var changed = request("PUT", path, body);
            assertEquals(200, changed.statusCode(), changed.body());
            detail = json.readTree(changed.body());
            assertEquals("09:05", detail.get("scheduleTime").asText());
            assertEquals("COMPLETED", detail.get("status").asText());
            assertTrue(detail.get("location").isNull()); assertTrue(detail.get("description").isNull());
            body.put("status", "CANCELLED"); assertEquals(200, request("PUT", path, body).statusCode());
            assertFalse(request("GET", "", null).body().contains("수정"));
            assertEquals(204, request("DELETE", path, null).statusCode());
            assertEquals(404, request("GET", path, null).statusCode());
            assertEquals(404, request("PUT", path, body).statusCode());
            assertEquals(404, request("DELETE", path, null).statusCode());
        } finally { request("DELETE", path, null); }
    }
    @Test void upcomingBoundariesStatusOrderingAndPagination() throws Exception {
        var paths = new ArrayList<String>();
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        String marker = "schedule-test-" + UUID.randomUUID();
        try {
            paths.add(create(input(marker + "-before", today.minusDays(1).toString(), null)));
            paths.add(create(input(marker + "-unknown", today.toString(), null)));
            paths.add(create(input(marker + "-late", today.toString(), "23:59")));
            paths.add(create(input(marker + "-early", today.toString(), "00:00")));
            paths.add(create(input(marker + "-tie", today.toString(), "00:00")));
            paths.add(create(input(marker + "-end", today.plusDays(6).toString(), null)));
            paths.add(create(input(marker + "-after", today.plusDays(7).toString(), null)));
            String cancelled = create(input(marker + "-cancelled", today.toString(), null)); paths.add(cancelled);
            var body = input(marker + "-cancelled", today.toString(), null); body.put("status", "CANCELLED");
            assertEquals(200, request("PUT", cancelled, body).statusCode());
            var response = request("GET", "?size=100", null);
            assertEquals(200, response.statusCode(), response.body());
            var list = json.readTree(response.body());
            var names = new ArrayList<String>(); list.get("items").forEach(item -> names.add(item.get("title").asText()));
            assertEquals(List.of(marker + "-early", marker + "-tie", marker + "-late", marker + "-unknown", marker + "-end"), names);
            var paged = json.readTree(request("GET", "?size=2&page=1", null).body());
            assertEquals(5, paged.get("totalElements").asInt()); assertEquals(3, paged.get("totalPages").asInt());
            assertEquals(marker + "-late", paged.get("items").get(0).get("title").asText());
            assertEquals("CANCELLED", json.readTree(request("GET", cancelled, null).body()).get("status").asText());
        } finally { for (String path : paths) request("DELETE", path, null); }
    }
    @Test void calendarRejectsInvalidMonthsWithFieldError() throws Exception {
        for (String query : List.of("", "?month=2026-13", "?month=0999-12", "?month=2026-11&month=2026-12", "?month=2026-11&status=PLANNED")) {
            var uri = URI.create("http://localhost:" + port + "/api/calendar/schedules" + query);
            var response = http.send(HttpRequest.newBuilder(uri).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(400, response.statusCode(), response.body());
            assertEquals("month", json.readTree(response.body()).get("fieldErrors").get(0).get("field").asText());
        }
    }
    @Test void rejectsBadInputsAndQueryConditions() throws Exception {
        var invalid = new ArrayList<Map<String,Object>>();
        invalid.add(input(" ", "2020-01-01", null)); invalid.add(input("a".repeat(101), "2020-01-01", null));
        invalid.add(input("bad", null, null)); invalid.add(input("bad", "2020-02-30", null)); invalid.add(input("bad", "0999-01-01", null));
        for (String time : List.of("24:00", "9:00", "12:00:00", "12:00:01", "12:60", " ")) invalid.add(input("bad", "2020-01-01", time));
        var location = input("bad", "2020-01-01", null); location.put("location", "a".repeat(201)); invalid.add(location);
        var description = input("bad", "2020-01-01", null); description.put("description", "a".repeat(2001)); invalid.add(description);
        var status = input("bad", "2020-01-01", null); status.put("status", "COMPLETED"); invalid.add(status);
        for (var body : invalid) {
            var response = request("POST", "", body); assertEquals(400, response.statusCode(), response.body());
            assertTrue(json.readTree(response.body()).has("fieldErrors"));
        }
        for (String query : List.of("?start=2020-01-01", "?end=2020-01-01", "?start=2020-03-01&end=2020-02-29", "?start=bad&end=2020-01-01", "?status=OTHER", "?status=PLANNED", "?status=", "?start=2020-01-01&end=2020-01-07", "?page=-1", "?size=101", "?page=2147483647&size=100", "?page=0&page=1", "?keyword=x"))
            assertEquals(400, request("GET", query, null).statusCode(), query);
        assertEquals(400, request("GET", "/bad", null).statusCode());
        String path = create(input("valid", "2020-01-01", ""));
        try {
            assertTrue(json.readTree(request("GET", path, null).body()).get("scheduleTime").isNull());
            var body = input("bad", "2020-01-01", null); body.put("status", "OTHER");
            assertEquals(400, request("PUT", path, body).statusCode());
            body.remove("status"); assertEquals(400, request("PUT", path, body).statusCode());
        } finally { request("DELETE", path, null); }
    }
}
