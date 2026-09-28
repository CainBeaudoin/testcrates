"""Render promo/index.html frame-by-frame to an H.264 MP4.

The page exposes window.__ready (Promise) and window.renderFrame(t) — every
pixel is a pure function of t, so the output is deterministic at any fps.

  python render.py --fps 60 --out chosen-launch.mp4 [--start 0 --end 30] [--stills 1,5.5,9]
  python render.py --page promo/phone/index.html --out phone/chosen-phone.mp4
renderFrame may return a Promise (the phone spot seeks a video); it's awaited.
  python render.py --page promo/phone/index.html --cues phone/cues.json   # sound cue list for phone/soundtrack.py
Needs: playwright (Chromium) and an ffmpeg with libx264 (FFMPEG env var or PATH).
"""
import argparse, functools, json, http.server, os, shutil, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
W, H = 1920, 1080

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--out", default="chosen-launch.mp4")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--stills", default=None, help="comma list of times → PNGs, no video")
    ap.add_argument("--stilldir", default="stills")
    ap.add_argument("--page", default="promo/index.html", help="page to render, relative to the repo root")
    ap.add_argument("--crf", default="19", help="x264 quality (higher = smaller file)")
    ap.add_argument("--cues", default=None, help="write the page's window.CUES (its sound cue list) to this JSON file and exit")
    args = ap.parse_args()

    port = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.on("console", lambda m: print("[page]", m.text, file=sys.stderr))
        page.on("pageerror", lambda e: print("[pageerror]", e, file=sys.stderr))
        page.goto(f"http://127.0.0.1:{port}/{args.page}")
        page.wait_for_function("window.__ready", timeout=60000)
        page.evaluate("window.__ready.then(() => true)")
        duration = page.evaluate("window.DURATION")
        print("renderer:", page.evaluate("window.__glInfo"), file=sys.stderr)

        if args.cues:
            with open(args.cues, "w") as f:
                json.dump(page.evaluate("window.CUES"), f, indent=1)
            print("wrote", args.cues, file=sys.stderr)
            browser.close()
            return

        if args.stills:
            os.makedirs(args.stilldir, exist_ok=True)
            for s in args.stills.split(","):
                t = float(s)
                page.evaluate(f"window.renderFrame({t})")
                page.screenshot(path=os.path.join(args.stilldir, f"t{t:06.2f}.png"))
            browser.close()
            return

        end = duration if args.end is None else args.end
        n = int(round((end - args.start) * args.fps))
        ffmpeg = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
        cmd = [ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(args.fps), "-c:v", "mjpeg", "-i", "-"]
        if args.audio:
            cmd += ["-ss", str(args.start), "-i", args.audio, "-c:a", "aac", "-b:a", "192k", "-shortest"]
        cmd += ["-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p",
                "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
                "-c:v", "libx264", "-preset", "slow", "-crf", args.crf, "-r", str(args.fps), "-movflags", "+faststart", args.out]
        ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        t0 = time.time()
        for i in range(n):
            t = args.start + i / args.fps
            page.evaluate(f"window.renderFrame({t})")
            ff.stdin.write(page.screenshot(type="jpeg", quality=96))
            if i % 60 == 0:
                el = time.time() - t0
                print(f"frame {i}/{n}  {el:.0f}s elapsed  eta {el / (i + 1) * (n - i - 1):.0f}s", file=sys.stderr)
        ff.stdin.close()
        ff.wait()
        browser.close()
        print("wrote", args.out, file=sys.stderr)

if __name__ == "__main__":
    main()
