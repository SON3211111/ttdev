package com.example.backend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
// 할 일의 직접 상태 변경, 이력과 주간 집계 결과를 API 응답으로 확인합니다.
class TaskApiTests {
    @LocalServerPort int port;
    final HttpClient http = HttpClient.newHttpClient();
    final ObjectMapper json = new ObjectMapper();

    HttpRequest request(String method, String path, Map<String, String> body) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/tasks" + path))
            .header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
    }

    HttpResponse<String> send(String method, String path, Map<String, String> body) throws Exception {
        return http.send(request(method, path, body), HttpResponse.BodyHandlers.ofString());
    }

    @Test void taskTransitionsAndDashboardStayConsistent() throws Exception {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        var before = json.readTree(send("GET", "/dashboard", null).body());
        var created = send("POST", "", Map.of("title", "검증 작업", "priority", "HIGH", "dueDate", today.minusDays(1).toString()));
        assertEquals(201, created.statusCode(), created.body());
        String path = "/" + json.readTree(created.body()).get("id").asText();
        try {
            assertEquals(400, send("POST", "", Map.of("title", " ")).statusCode());
            assertEquals(400, send("GET", "?status=PLANNED", null).statusCode());
            assertEquals(400, send("GET", "/bad", null).statusCode());
            assertTrue(send("GET", "?status=TODO", null).body().contains("검증 작업"));
            var doing = send("PUT", path + "/status", Map.of("status", "DOING"));
            assertEquals(200, doing.statusCode(), doing.body());
            var overdue = json.readTree(send("GET", "/dashboard", null).body());
            assertEquals(before.get("doing").asLong() + 1, overdue.get("doing").asLong());
            assertEquals(before.get("overdue").asLong() + 1, overdue.get("overdue").asLong());

            var complete = request("PUT", path + "/status", Map.of("status", "DONE"));
            var first = http.sendAsync(complete, HttpResponse.BodyHandlers.ofString());
            var second = http.sendAsync(complete, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, first.get().statusCode(), first.get().body());
            assertEquals(200, second.get().statusCode(), second.get().body());
            var firstDate = json.readTree(first.get().body()).get("completedAt");
            assertFalse(firstDate.isNull());
            assertEquals(firstDate, json.readTree(second.get().body()).get("completedAt"));
            assertEquals(2, json.readTree(send("GET", path + "/history", null).body()).size());
            var dashboard = json.readTree(send("GET", "/dashboard", null).body());
            assertEquals(before.get("done").asLong() + 1, dashboard.get("done").asLong());
            assertEquals(before.get("overdue"), dashboard.get("overdue"));
            assertEquals(7, dashboard.get("trend").size());
            assertEquals(today.toString(), dashboard.get("trend").get(6).get("date").asText());
            assertEquals(before.get("trend").get(6).get("count").asLong() + 1, dashboard.get("trend").get(6).get("count").asLong());
            var fromDone = send("PUT", path + "/status", Map.of("status", "TODO"));
            assertEquals(200, fromDone.statusCode(), fromDone.body());
            assertEquals("TODO", json.readTree(fromDone.body()).get("status").asText());
            assertTrue(json.readTree(fromDone.body()).get("completedAt").isNull());
            assertEquals(200, send("PUT", path + "/status", Map.of("status", "DOING")).statusCode());
            assertEquals(200, send("PUT", path + "/status", Map.of("status", "DONE")).statusCode());

            var reopened = json.readTree(send("PUT", path + "/reopen", null).body());
            assertEquals("DOING", reopened.get("status").asText());
            assertTrue(reopened.get("completedAt").isNull());
            var backToTodo = send("PUT", path + "/status", Map.of("status", "TODO"));
            assertEquals(200, backToTodo.statusCode(), backToTodo.body());
            assertEquals("TODO", json.readTree(backToTodo.body()).get("status").asText());
            var latestEvent = json.readTree(send("GET", path + "/history", null).body()).get(0);
            assertEquals("DOING", latestEvent.get("previousStatus").asText());
            assertEquals("TODO", latestEvent.get("nextStatus").asText());
            var edited = send("PUT", path, Map.of("title", "수정한 작업", "dueDate", today.toString()));
            assertEquals(200, edited.statusCode(), edited.body());
            assertFalse(json.readTree(edited.body()).get("overdue").asBoolean());
            var due = json.readTree(send("GET", "/dashboard", null).body()).get("upcomingDue");
            assertEquals(7, due.size());
            assertEquals(today.toString(), due.get(0).get("date").asText());
            assertEquals(today.plusDays(6).toString(), due.get(6).get("date").asText());
            long originalToday = before.get("upcomingDue").get(0).get("count").asLong();
            assertEquals(originalToday + 1, due.get(0).get("count").asLong());
            assertEquals(200, send("PUT", path + "/status", Map.of("status", "DONE")).statusCode());
            var afterCompletion = json.readTree(send("GET", "/dashboard", null).body()).get("upcomingDue");
            assertEquals(originalToday, afterCompletion.get(0).get("count").asLong());
            var calendarUri = URI.create("http://localhost:" + port + "/api/calendar/tasks?month=" + YearMonth.from(today));
            var calendar = http.send(HttpRequest.newBuilder(calendarUri).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(200, calendar.statusCode(), calendar.body());
            var item = json.readTree(calendar.body()).get(0);
            assertEquals(path.substring(1), item.get("id").asText());
            assertEquals("DONE", item.get("status").asText());
        } finally {
            assertEquals(204, send("DELETE", path, null).statusCode());
        }
        assertEquals(404, send("GET", path + "/history", null).statusCode());
    }
}
