/**
 * Java 백엔드에서 Python AI 서버(FastAPI)에 질문을 전달하는 파일입니다.
 * RestClient는 다른 서버에 HTTP 요청을 보내는 도구입니다. baseUrl 뒤에 /generate를 붙여 호출합니다.
 * 흐름: AiController → 이 파일 → FastAPI → Ollama(실제 모델 실행) → 답변 반환.
 * 질문과 답변을 MySQL/Qdrant에 저장하거나 기존 메모를 검색하지 않습니다.
 */

package com.example.backend.service;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.core.JacksonException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

@Service
public class AiService {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public AiService(
            @Value("${AI_SERVER_URL:http://localhost:8000}") String aiServerUrl,
            ObjectMapper objectMapper
    ) {
        // 기존 연결 방식인 HTTP/1.1을 사용합니다. 서버와 연결을 맺는 데에는 최대 10초를 기다립니다.
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();

        // 연결 후 답변을 읽는 시간은 최대 180초입니다. 연결 제한 10초와는 별도 설정입니다.
        JdkClientHttpRequestFactory requestFactory =
                new JdkClientHttpRequestFactory(httpClient);

        requestFactory.setReadTimeout(Duration.ofSeconds(180));

        this.restClient = RestClient.builder()
                .baseUrl(aiServerUrl)
                .requestFactory(requestFactory)
                .build();

        this.objectMapper = objectMapper;
    }

    public Map<String, Object> generate(String prompt) {

        try {
            // Map을 {"prompt":"질문"} 형태의 JSON 문자열로 바꿔 Python 서버가 읽을 수 있게 합니다.
            String jsonBody = objectMapper.writeValueAsString(
                    Map.of("prompt", prompt)
            );

            // POST로 JSON을 보내고, 받은 JSON을 Map으로 읽습니다.
            // ParameterizedTypeReference는 Map의 키/값 타입을 응답 변환 도구에 알려줍니다.
            Map<String, Object> response = restClient.post()
                    .uri("/generate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(jsonBody)
                    .retrieve()
                    .body(
                            new ParameterizedTypeReference<
                                    Map<String, Object>
                            >() {}
                    );

            if (response == null) {
                throw new IllegalStateException(
                        "AI 서버 응답이 비어 있습니다."
                );
            }

            return response;

        } catch (JacksonException e) {
            throw new IllegalStateException(
                    "AI 요청 JSON 생성 실패", e
            );
        }
    }
}
