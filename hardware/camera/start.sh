#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec "${CAMERA_PYTHON:-python3}" server.py
