// 테스트 전용 H2(메모리 DB)를 쓰고 실제 HTTP 요청으로 기록 API를 검사합니다. 사용자 MySQL 기록은 건드리지 않습니다.
// @SpringBootTest는 테스트 서버를 띄우고 RANDOM_PORT는 비어 있는 포트를 자동으로 골라 충돌을 피합니다.
// H2 테스트는 API 규칙을 검사합니다. MySQL 전용 테이블 생성 SQL의 성공 여부는 별도 검증이 필요합니다.
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
// HTTP 요청으로 기록 API의 저장, 조회, 변경과 유효성 검사를 확인합니다.
class RecordApiTests {
    @LocalServerPort int port;
    final HttpClient http = HttpClient.newHttpClient();
    final ObjectMapper json = new ObjectMapper();

    HttpResponse<String> request(String method, String path, Object body) throws Exception {
        // 반복되는 요청 코드를 모았습니다. body가 있으면 JSON으로 보내고 없으면 본문 없이 요청합니다.
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/records" + path))
                .header("Content-Type", "application/json");
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() :
                HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(), HttpResponse.BodyHandlers.ofString());
    }
    Map<String, String> memo(String content, String date) {
        return Map.of("recordType", "MEMO", "content", content, "recordDate", date);
    }

    // 등록→조회→동일 내용 저장→내용 변경→삭제 순으로 검사합니다.
    // assertEquals는 실제 값이 기대 값과 다르면 테스트를 실패시킵니다.
    @Test void createsReadsRevisesAndDeletesWithoutAi() throws Exception {
        var created = request("POST", "", memo("  첫 줄\r\n  둘째 줄 😀  ", "2020-01-02"));
        assertEquals(201, created.statusCode(), created.body());
        var data = json.readTree(created.body());
        String path = "/" + data.get("id").asText();
        try {
            assertEquals("/api/records" + path, created.headers().firstValue("Location").orElseThrow());
            assertEquals("첫 줄\n  둘째 줄 😀", data.get("content").asText());
            assertEquals("PENDING", data.get("embeddingStatus").asText());
            assertEquals(200, request("GET", path, null).statusCode());
            var list = request("GET", "?type=MEMO&size=100", null);
            assertEquals(200, list.statusCode());
            assertTrue(list.body().contains("preview"));
            assertFalse(list.body().contains("\"content\":"));
            var unchanged = request("PUT", path, Map.of("content", "첫 줄\n  둘째 줄 😀", "recordDate", "2020-01-02"));
            assertEquals(1, json.readTree(unchanged.body()).get("contentVersion").asInt());
            var changed = request("PUT", path, Map.of("content", "수정된 원문", "recordDate", "2020-01-01"));
            assertEquals(200, changed.statusCode(), changed.body());
            assertEquals(2, json.readTree(changed.body()).get("contentVersion").asInt());
            assertEquals("2020-01-01", json.readTree(changed.body()).get("recordDate").asText());
            assertEquals(204, request("DELETE", path, null).statusCode());
            assertEquals(404, request("GET", path, null).statusCode());
            assertEquals(404, request("DELETE", path, null).statusCode());
        // 검사 중 실패하더라도 이 테스트가 만든 기록을 정리합니다.
        } finally { request("DELETE", path, null); }
    }

    // 윤년의 2월 29일과 월 시작일이 범위에 포함되고, 수정/삭제가 다음 조회에 반영되는지 확인합니다.
    @Test void calendarIncludesMonthBoundariesAndReflectsChanges() throws Exception {
        String path = "/" + json.readTree(request("POST", "", memo("calendar-boundary", "2020-02-29")).body()).get("id").asText();
        String query = "?start=2020-02-01&end=2020-02-29&size=100";
        try {
            var february = request("GET", query, null);
            assertEquals(200, february.statusCode());
            assertTrue(february.body().contains("calendar-boundary"));
            assertFalse(request("GET", "?start=2020-03-01&end=2020-03-31", null).body().contains("calendar-boundary"));
            assertEquals(200, request("PUT", path, Map.of("content", "calendar-boundary", "recordDate", "2020-02-01")).statusCode());
            assertTrue(request("GET", query, null).body().contains("calendar-boundary"));
            assertEquals(204, request("DELETE", path, null).statusCode());
            assertFalse(request("GET", query, null).body().contains("calendar-boundary"));
            for (String invalid : new String[] {"?start=2020-02-01", "?end=2020-02-29", "?start=bad&end=2020-02-29", "?start=2020-03-01&end=2020-02-29"})
                assertEquals(400, request("GET", invalid, null).statusCode());
        } finally { request("DELETE", path, null); }
    }

    // 공백/너무 긴 본문/미래 날짜/잘못된 종류 등을 보냈을 때 저장하지 않고 400으로 거부하는지 확인합니다.
    @Test void rejectsInvalidInputsAndUnknownConditions() throws Exception {
        for (var body : new Object[] {
                memo(" \n\t", "2020-01-01"), memo("a".repeat(10001), "2020-01-01"),
                memo("future", LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(1).toString()),
                memo("bad date", "2026-02-30"),
                Map.of("recordType", "MEMO", "content", "missing date"),
                Map.of("recordType", "MEMO", "content", "title", "title", "not allowed", "recordDate", "2020-01-01"),
                Map.of("recordType", "OTHER", "content", "invalid", "recordDate", "2020-01-01"),
                Map.of("recordType", "MEMO", "content", "unknown", "other", "x", "recordDate", "2020-01-01")
        }) {
            var response = request("POST", "", body);
            assertEquals(400, response.statusCode(), response.body());
            assertTrue(json.readTree(response.body()).has("fieldErrors"));
        }
        for (String query : new String[] {"?page=-1", "?size=101", "?type=OTHER", "?keyword=test", "?keyword=", "?from=2020-01-01", "?to=2020-01-01", "?sort=id", "?page=0&page=1"})
            assertEquals(400, request("GET", query, null).statusCode(), query);
        assertEquals(400, request("GET", "/bad-id", null).statusCode());
    }

    @Test void diaryCrudAndRejectsRemovedSearch() throws Exception {
        var created = request("POST", "", Map.of("recordType", "DIARY", "title", " Stage3 AbC%_! ", "content", "본문", "recordDate", "2020-02-29"));
        assertEquals(201, created.statusCode(), created.body());
        String path = "/" + json.readTree(created.body()).get("id").asText();
        try {
            assertEquals("Stage3 AbC%_!", json.readTree(created.body()).get("title").asText());
            var listing = request("GET", "?type=DIARY&size=100", null);
            assertEquals(200, listing.statusCode(), listing.body());
            assertTrue(listing.body().contains("Stage3 AbC%_!"));
            var changed = request("PUT", path, Map.of("title", "새 제목", "content", "본문", "recordDate", "2020-02-29"));
            assertEquals(200, changed.statusCode());
            assertEquals(2, json.readTree(changed.body()).get("contentVersion").asInt());
            assertEquals(2, json.readTree(request("PUT", path, Map.of("title", "새 제목", "content", "본문", "recordDate", "2020-02-29")).body()).get("contentVersion").asInt());
            for (String query : new String[]{"?start=2020-01-01&end=2020-12-31&keyword=x", "?start=2020-01-01&end=2020-12-31&from=2020-01-01", "?start=2020-01-01&end=2020-12-31&type=DIARY", "?keyword=" + "a".repeat(101)})
                assertEquals(400, request("GET", query, null).statusCode(), query);
        } finally { assertEquals(204, request("DELETE", path, null).statusCode()); }
    }
}
