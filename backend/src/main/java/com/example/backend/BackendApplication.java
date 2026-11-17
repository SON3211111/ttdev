// Java 백엔드가 시작되는 파일입니다. main을 실행하면 Spring Boot가 서버를 띄웁니다.
// @SpringBootApplication이 이 패키지 아래의 Controller/Service/Repository를 찾아 연결합니다.
package com.example.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(BackendApplication.class, args);
	}

}
