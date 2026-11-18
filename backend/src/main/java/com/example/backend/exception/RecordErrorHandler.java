/*
 * 기록 API에서 던진 예외를 잡아 브라우저가 읽을 JSON 오류 응답으로 바꿉니다.
 * 이 오류 응답은 기록·일정·캘린더 API에서 사용합니다.
 * code는 프로그램이 구분할 오류 이름, message는 사용자 안내, fieldErrors는 잘못된 입력 항목 목록입니다.
 * 사용자는 안내만 받습니다. 내부 SQL이나 예외 전체 내용을 응답으로 보내지 않습니다.
 */
package com.example.backend.exception;

import com.example.backend.controller.CalendarController;
import com.example.backend.controller.RecordController;
import com.example.backend.controller.ScheduleController;
import com.example.backend.controller.TaskController;

import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.util.List;

@RestControllerAdvice(assignableTypes = {RecordController.class, ScheduleController.class, CalendarController.class, TaskController.class})
public class RecordErrorHandler {
    public record FieldError(String field, String message) {}
    public record ErrorBody(String code, String message, List<FieldError> fieldErrors) {}

    @ExceptionHandler(RecordException.class)
    // Service가 만든 오류 번호/메시지를 사용합니다. 특정 입력 항목(field)이 없으면 빈 배열을 보냅니다.
    public ResponseEntity<ErrorBody> domain(RecordException exception) {
        var fields = exception.getField() == null ? List.<FieldError>of() :
                List.of(new FieldError(exception.getField(), exception.getMessage()));
        return ResponseEntity.status(exception.getStatus()).body(new ErrorBody(exception.getCode(), exception.getMessage(), fields));
    }
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    // 역직렬화는 받은 JSON을 Java 객체로 바꾸는 과정입니다.
    // JSON 문법 오류, 잘못된 날짜, 허용하지 않은 필드가 있으면 요청 형식 오류(400)로 응답합니다.
    public ResponseEntity<ErrorBody> malformed() { return domain(RecordException.invalid()); }

    @ExceptionHandler({DataAccessResourceFailureException.class, CannotCreateTransactionException.class})
    // DB 연결을 못 하거나 DB 작업을 시작할 수 없을 때는 일시적 저장소 장애(503)를 안내합니다.
    public ResponseEntity<ErrorBody> unavailable() {
        return ResponseEntity.status(503).body(new ErrorBody("STORAGE_UNAVAILABLE", "저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.", List.of()));
    }
    @ExceptionHandler(Exception.class)
    // 위에서 다루지 않은 예외는 500으로 응답합니다. 내부 오류 내용이나 사용자의 본문은 보내지 않습니다.
    public ResponseEntity<ErrorBody> unexpected() {
        return ResponseEntity.internalServerError().body(new ErrorBody("INTERNAL_ERROR", "요청 처리 중 오류가 발생했습니다.", List.of()));
    }
}
