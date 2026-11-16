
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
        // HTTP/1.1 유지
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();

        // AI 응답 대기 시간: 180초
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
            // 요청 데이터를 JSON 문자열로 변환
            String jsonBody = objectMapper.writeValueAsString(
                    Map.of("prompt", prompt)
            );

            // FastAPI 서버 호출
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
