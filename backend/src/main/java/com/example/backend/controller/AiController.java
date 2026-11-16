
package com.example.backend.controller;

import com.example.backend.service.AiService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;

import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final AiService aiService;

    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/generate")
    public ResponseEntity<Map<String, Object>> generate(
            @RequestBody Map<String, String> request
    ) {
        String prompt = request.get("prompt");

        // 빈 질문 차단
        if (prompt == null || prompt.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of(
                            "error", "질문을 입력해주세요."
                    ));
        }

        try {
            Map<String, Object> response =
                    aiService.generate(prompt.trim());

            return ResponseEntity.ok(response);

        } catch (ResourceAccessException e) {

            // 연결 및 응답 타임아웃 구분
            Throwable cause = e;
            while (cause != null) {
                if (cause instanceof HttpTimeoutException
                        || cause instanceof SocketTimeoutException) {
                    return ResponseEntity
                            .status(HttpStatus.GATEWAY_TIMEOUT)
                            .body(Map.of(
                                    "error", "AI 서버 응답 시간이 초과되었습니다."
                            ));
                }
                cause = cause.getCause();
            }

            return ResponseEntity
                    .status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "error", "AI 서버에 연결할 수 없습니다."
                    ));

        } catch (RestClientException e) {

            return ResponseEntity
                    .status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of(
                            "error", "AI 서버 요청 처리에 실패했습니다."
                    ));

        } catch (Exception e) {

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of(
                            "error", "서버 내부 오류가 발생했습니다."
                    ));
        }
    }
}
