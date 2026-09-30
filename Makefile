.PHONY: all dev test build clean tauri

all: dev

dev:
	./run.sh dev

test:
	./run.sh test

build:
	./run.sh build

tauri:
	./run.sh tauri

clean:
	rm -rf engine-py/.venv engine-py/session_cache src-ui/node_modules src-ui/dist src-tauri/target
