FROM golang:1.24.3-alpine3.21 AS build

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN mkdir -p /out/data/uploads \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/youbenpu-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/youbenpu-api /youbenpu-api
COPY --from=build --chown=65532:65532 /out/data /data
USER nonroot:nonroot
EXPOSE 8080
VOLUME ["/data/uploads"]
ENV APP_ENV=production \
    HTTP_ADDRESS=:8080 \
    UPLOAD_DIR=/data/uploads \
    SHUTDOWN_TIMEOUT=10s
ENTRYPOINT ["/youbenpu-api"]
