/**
 * '본문이 비었음', '기록이 없음'처럼 예상할 수 있는 오류 정보를 담는 예외입니다.
 * Service/Controller에서 throw하면 RecordErrorHandler가 잡아 HTTP 응답으로 바꿉니다.
 * status=HTTP 번호(예: 400), code=오류 이름, message=안내 문구, field=잘못 입력한 항목입니다.
 */
package com.example.backend.exception;

// 업무 규칙 위반에 HTTP 상태와 오류 코드, 해당하는 경우 입력 필드 이름을 담습니다.
public class RecordException extends RuntimeException {
    private final int status;
    private final String code;
    private final String field;

    public RecordException(int status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }
    public static RecordException validation(String field, String message) {
        return new RecordException(400, "VALIDATION_ERROR", message, field);
    }
    public static RecordException invalid() {
        return new RecordException(400, "INVALID_REQUEST", "요청 형식을 확인해주세요.", null);
    }

    // final 필드는 만든 뒤 바꿀 수 없습니다. getter는 오류 응답을 만들 때 값을 읽는 메서드입니다.
    public int getStatus() { return status; }
    public String getCode() { return code; }
    public String getField() { return field; }
}
