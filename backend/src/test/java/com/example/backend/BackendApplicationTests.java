// 테스트 설정으로 Spring 서버 구성 요소를 만들 수 있는지 확인합니다. 이런 구성 묶음을 컨텍스트라고 합니다.
// 메서드가 비어 있어도 @SpringBootTest가 서버 구성을 시도하므로, 설정/객체 연결이 잘못되면 테스트가 실패합니다.
package com.example.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
