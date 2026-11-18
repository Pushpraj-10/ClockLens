FROM golang:1.26 AS build
ARG CMD
WORKDIR /src
COPY go/ ./
RUN CGO_ENABLED=0 go build -o /out/app ./cmd/${CMD}

FROM gcr.io/distroless/static
COPY --from=build /out/app /app
ENTRYPOINT ["/app"]
