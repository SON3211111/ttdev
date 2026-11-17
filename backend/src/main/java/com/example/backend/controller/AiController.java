/**
 * AI 테스트 화면이 POST /api/ai/generate로 보낸 질문을 받습니다.
 * prompt(질문)가 비었는지 검사 → AiService로 전달 → 모델 답변을 화면으로 반환합니다.
 * 기록 검색이 아니라 일반 질문 전달 테스트입니다. 메모 DB 저장 기능과는 별개입니다.
 */

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

        // null은 질문 항목 자체가 없는 경우, isBlank는 공백/줄바꿈만 있는 경우도 포함합니다.
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

            // 타임아웃은 정해진 시간 안에 응답을 못 받은 경우입니다(504).
            // 예외가 다른 예외를 감싸고 있을 수 있어 getCause로 원인을 하나씩 따라갑니다.
            // 시간 초과가 아니면 서버에 연결하지 못한 경우로 안내합니다(503).
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
