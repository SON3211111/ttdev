# 이 파일은 백엔드 컨테이너 이미지를 만드는 순서입니다. FROM이 두 번이므로 두 단계로 나눠 만듭니다.
# 첫 단계는 JDK(컴파일 도구 포함)로 실행 파일 JAR를 만들고, 마지막 단계는 JRE(실행 도구)와 JAR만 담습니다.

FROM eclipse-temurin:17-jdk AS build

WORKDIR /app

COPY . .

RUN chmod +x gradlew
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:17-jre

WORKDIR /app

COPY --from=build /app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]

