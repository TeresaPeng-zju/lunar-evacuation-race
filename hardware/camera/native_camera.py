"""Latest-frame USB capture shared by local navigation pages on macOS."""
import atexit
import base64
import shutil
import subprocess
import threading
import time

import cv2
import numpy as np

WIDTH, HEIGHT = 800, 450
frame_size = WIDTH * HEIGHT * 3
lock = threading.Lock()
worker = latest = active_process = None
last_request = 0
problem = "正在启动 USB 相机"
params = cv2.aruco.DetectorParameters()
params.adaptiveThreshWinSizeMin = 3
params.adaptiveThreshWinSizeMax = 33
params.adaptiveThreshWinSizeStep = 5
params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
params.cornerRefinementWinSize = 3
detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36H11), params)


def capture():
    global latest, problem, active_process
    ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    args = [ffmpeg, "-nostdin", "-loglevel", "error", "-f", "avfoundation",
            "-framerate", "30", "-video_size", "1920x1080", "-i", "icspring camera:none",
            "-an", "-filter_threads", "1", "-vf", f"fps=20,scale={WIDTH}:{HEIGHT}:flags=fast_bilinear", "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1"]
    try:
        with subprocess.Popen(args, stdout=subprocess.PIPE) as proc:
            active_process = proc
            try:
                while time.monotonic() - last_request < 6:
                    data = proc.stdout.read(frame_size)
                    if len(data) != frame_size:
                        raise RuntimeError("USB 相机没有返回完整画面")
                    with lock:
                        latest = (time.monotonic(), data)
            finally:
                proc.kill()
                active_process = None
    except (OSError, RuntimeError) as err:
        with lock:
            problem = str(err)
    finally:
        with lock:
            latest = None


def read():
    global worker, last_request
    with lock:
        last_request = time.monotonic()
        if not worker or not worker.is_alive():
            worker = threading.Thread(target=capture, daemon=True)
            worker.start()
        frame = latest
    if not frame or time.monotonic() - frame[0] > 0.25:
        return {"error": problem}
    stamp, data = frame
    image = np.frombuffer(data, np.uint8).reshape(HEIGHT, WIDTH, 3)
    corners, ids, _ = detector.detectMarkers(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
    items = [] if ids is None else [
        {"kind":"tag", "label":f"ID {int(i)} · 36h11", "points":p.reshape(4,2).tolist()}
        for i,p in zip(ids.ravel(),corners)]
    ok, jpg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 76])
    if not ok:
        return {"error":"无法编码画面"}
    encoded = base64.b64encode(jpg).decode("ascii")
    return {"stamp":stamp*1000, "age":(time.monotonic()-stamp)*1000,
            "items":items, "image":encoded}


def shutdown():
    if active_process and active_process.poll() is None:
        active_process.kill()


atexit.register(shutdown)
