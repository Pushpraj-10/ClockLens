.PHONY: test test-go test-ts up
test: test-go test-ts
test-go:
	cd go && go test ./...
test-ts:
	pnpm test
up:
	docker compose up --build
