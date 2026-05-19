# verify-pssh — Makefile
#
# Builds against an ffmpeg install discovered via pkg-config. By default
# uses the system pkg-config path. To target a specific build (e.g. the
# media-player project's local ffmpeg checkout), set FFMPEG_PREFIX:
#
#   make                                              # uses system ffmpeg
#   make FFMPEG_PREFIX=/path/to/ffmpeg                # uses that build
#   make FFMPEG_PREFIX=/Users/maciz/www/ela.city/media-player/build/lib/ffmpeg
#
# Tested with native ffmpeg n7.1 (Homebrew) on macOS arm64.

CC      ?= cc
CFLAGS  ?= -O2 -Wall -Wextra -Wno-unused-parameter -std=c11

FFMPEG_PREFIX ?=

ifeq ($(FFMPEG_PREFIX),)
PKG_CONFIG_PATH_OVERRIDE :=
else
PKG_CONFIG_PATH_OVERRIDE := PKG_CONFIG_PATH=$(FFMPEG_PREFIX)/lib/pkgconfig
endif

LIBAV_CFLAGS := $(shell $(PKG_CONFIG_PATH_OVERRIDE) pkg-config --cflags libavformat libavcodec libavutil)
LIBAV_LIBS   := $(shell $(PKG_CONFIG_PATH_OVERRIDE) pkg-config --libs   libavformat libavcodec libavutil)

BIN := verify-pssh

.PHONY: all clean run

all: $(BIN)

$(BIN): verify-pssh.c
	@if [ -z "$(LIBAV_CFLAGS)" ]; then \
	  echo "ERROR: pkg-config could not find libavformat/libavcodec/libavutil."; \
	  echo "  Install ffmpeg dev headers (e.g. 'brew install ffmpeg' on macOS)"; \
	  echo "  or set FFMPEG_PREFIX=/path/to/your/ffmpeg/install"; \
	  exit 1; \
	fi
	$(CC) $(CFLAGS) $(LIBAV_CFLAGS) -o $@ verify-pssh.c $(LIBAV_LIBS)

# Quick smoke run — `make run INPUT=/path/to/init.mp4`
run: $(BIN)
	@if [ -z "$(INPUT)" ]; then echo "usage: make run INPUT=<init.mp4|stream.mpd|URL>"; exit 2; fi
	./$(BIN) $(INPUT)

fmt:
	@clang-format -i verify-pssh.c

clean:
	rm -f $(BIN)
