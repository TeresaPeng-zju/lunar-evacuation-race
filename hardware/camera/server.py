from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import json
import signal
import sys
import threading
import native_camera

import cv2
import numpy as np

PAGE = Path(__file__).with_name("index.html")
FAMILIES = ("36H11", "36H10", "25H9", "16H5")
cv2.setNumThreads(2)
params = cv2.aruco.DetectorParameters()
params.useAruco3Detection = True
params.minSideLengthCanonicalImg = 16
params.minMarkerLengthRatioOriginalImg = 0.012
detector = cv2.aruco.ArucoDetector([
    cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, "DICT_APRILTAG_" + name))
    for name in FAMILIES
], params)
primary_detector = cv2.aruco.ArucoDetector(
    cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36H11), params)
qr = cv2.QRCodeDetector()
lock = threading.Lock()


def detect(frame, mode):
    found = []
    if mode in ("tag", "tag36", "both"):
        if mode == "tag36":
            corners, ids, _ = primary_detector.detectMarkers(frame)
            dictionaries = np.zeros_like(ids) if ids is not None else None
        else:
            corners, ids, _, dictionaries = detector.detectMarkersMultiDict(frame)
        if ids is not None:
            for points, number, index in zip(corners, ids.ravel(), dictionaries.ravel()):
                family = FAMILIES[index]
                found.append({"label": f"ID {number} · {family.lower()}",
                              "points": points.reshape(4, 2).tolist(), "kind": "tag"})
    if mode in ("qr", "both"):
        ok, texts, corners, _ = qr.detectAndDecodeMulti(frame)
        if ok:
            for value, points in zip(texts, corners):
                if value:
                    found.append({"label": value, "points": points.tolist(), "kind": "qr"})
    return found


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == "/live-frame":
            return self.reply("application/json", json.dumps(native_camera.read()).encode())
        if urlsplit(self.path).path in ("/navigation.mjs", "/pilot.mjs", "/race-link.mjs"):
            return self.reply("text/javascript; charset=utf-8", PAGE.with_name(urlsplit(self.path).path[1:]).read_bytes())
        if urlsplit(self.path).path != "/":
            return self.send_error(404)
        self.reply("text/html; charset=utf-8", PAGE.read_bytes())

    def do_POST(self):
        mode = self.path.removeprefix("/detect/")
        if mode not in ("tag", "tag36", "qr", "both"):
            return self.send_error(404)
        if self.headers.get("Origin") not in (None, "http://127.0.0.1:4182", "http://localhost:4182"):
            return self.send_error(403)
        try:
            size = int(self.headers.get("Content-Length", 0))
            if not 0 < size <= 4_000_000:
                return self.send_error(413)
            frame = cv2.imdecode(np.frombuffer(self.rfile.read(size), np.uint8), cv2.IMREAD_GRAYSCALE)
            if frame is None:
                return self.send_error(400)
            if not lock.acquire(blocking=False):
                return self.reply("application/json", b"[]", 429)
            try:
                result = detect(frame, mode)
            finally:
                lock.release()
            self.reply("application/json", json.dumps(result).encode())
        except (ValueError, cv2.error):
            self.send_error(400)

    def reply(self, mime, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_request(self, code="-", size="-"):
        pass


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    ThreadingHTTPServer(("127.0.0.1", 4182), Handler).serve_forever()
