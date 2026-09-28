"""Record the mobile site's Drops → Open → Keep → Account → Ship flow.

Drives the real app (served from the repo) in a 390×844 iPhone-sized viewport
and grabs 2× frames back to back while it goes. Writes:

  screen.webm   — the recording resampled to a constant 30fps (VP9), which
                  index.html maps onto the 3D phone's screen
  taps.json     — when and where each tap landed (CSS px), so the scene can
                  draw the cursor and tap ripples exactly on the button
  frames/       — (scratch) the resampled JPEGs

The prize is pinned (FORCE_PRIZE) and a demo shipping address is pre-saved,
so every take pulls the same Legendary (the AJ1 '85 Chicago) and the ship form is already filled in.

  python record.py            # needs playwright (Chromium) and ffmpeg (FFMPEG or PATH)
"""
import base64, functools, http.server, json, os, shutil, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
# iPhone 17 Pro screen is 402×839pt; the top 54pt is the status bar index.html
# draws, so the page gets the rest.
VW, VH, DPR = 402, 785, 2
FPS = 30
# Added to the Sneakers pool for the take (not part of the app's catalog);
# its photo is a render of models/aj1-85.glb, the same shoe the box reveals.
FORCE_PRIZE = {
    "name": "Air Jordan 1 High '85 Chicago", "price": 895, "rarity": "legendary", "weight": 1.0,
    "image": "promo/phone/aj1-85-chicago.png", "category": "sneakers",
}
DEMO_ADDRESS = {
    "name": "Alex Rivera", "phone": "(555) 010-0142", "email": "alex@example.com",
    "line1": "221 Kent Ave", "line2": "", "city": "Brooklyn", "region": "NY",
    "postal": "11249", "country": "United States",
}


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


def patch_app_js(route):
    # Put FORCE_PRIZE in the crate you pick (the middle one), after pity and
    # the duplicate guard have run, so the fairness hash still covers it.
    body = route.fetch().text()
    anchor = "boxPrizes = boxPrizes.map((p) => player.rerollIfDuplicate(key, p, cat.pool));"
    assert anchor in body, "app.js changed: update the FORCE_PRIZE hook"
    body = body.replace(anchor, anchor + f"\n  if (key === 'sneakers') boxPrizes[1] = {json.dumps(FORCE_PRIZE)};")
    route.fulfill(body=body, headers={"content-type": "application/javascript"})


def main():
    port = serve()
    frames_dir = os.path.join(HERE, "frames")
    shutil.rmtree(frames_dir, ignore_errors=True)
    os.makedirs(frames_dir)
    frames, taps, marks = [], [], {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
        ctx = browser.new_context(
            viewport={"width": VW, "height": VH}, device_scale_factor=DPR, is_mobile=True, has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        )
        ctx.add_init_script(f"""
          if (!localStorage.getItem('gotcha_player_v5'))
            localStorage.setItem('gotcha_player_v5', JSON.stringify({{ shippingAddress: {json.dumps(DEMO_ADDRESS)} }}));
          // Chrome's blue tap flash reads as a glitch on the phone; iOS doesn't show it
          addEventListener('DOMContentLoaded', () => document.head.insertAdjacentHTML('beforeend',
            '<style>*{{-webkit-tap-highlight-color:transparent!important}}</style>'));
        """)
        page = ctx.new_page()
        page.route("**/js/app.js", patch_app_js)
        page.on("pageerror", lambda e: print("[pageerror]", e, file=sys.stderr))

        page.goto(f"http://127.0.0.1:{port}/")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2500)

        # Frames are grabbed with back-to-back 2× screenshots (~34fps) rather
        # than the DevTools screencast, which headless Chromium only sends at
        # 1× CSS pixels (so does captureScreenshot unless the clip asks for
        # scale 2). Every wait below pumps frames while it waits.
        cdp = ctx.new_cdp_session(page)
        t0 = time.time()

        def pump():
            ts = time.time()
            data = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 90, "optimizeForSpeed": True,
                             "clip": {"x": 0, "y": 0, "width": VW, "height": VH, "scale": DPR}})["data"]
            frames.append(((ts + time.time()) / 2, base64.b64decode(data)))

        def hold(ms):
            end = time.time() + ms / 1000
            while time.time() < end:
                pump()

        def until(loc, timeout=20):
            end = time.time() + timeout
            while not loc.is_visible():
                if time.time() > end:
                    page.screenshot(path=os.path.join(HERE, "debug.png"))
                    raise TimeoutError(f"never became visible: {loc}")
                pump()

        def tap(locator, label, lead=0.9):
            loc = page.locator(locator).first if isinstance(locator, str) else locator
            until(loc)
            b = loc.bounding_box()
            if b["y"] < 0 or b["y"] + b["height"] > VH:
                # off screen (the ship form is taller than the phone): glide it into view
                marks["scroll"] = round(time.time() - t0, 3)
                loc.evaluate("el => el.scrollIntoView({ behavior: 'smooth', block: 'center' })")
                hold(900)
            hold(lead * 1000)  # the cursor glides in during this beat
            box = loc.bounding_box()  # measured after the beat: cards animate into place
            x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            taps.append({"t": round(time.time() - t0, 3), "x": round(x, 1), "y": round(y, 1), "label": label})
            page.touchscreen.tap(x, y)
            print(f"{time.time() - t0:6.2f}s  tap {label} @ {x:.0f},{y:.0f}", file=sys.stderr)

        def mark(name):
            marks[name] = round(time.time() - t0, 3)

        hold(1200)
        tap(".nav-tab[data-nav='screen-category']", "drops")
        until(page.get_by_text("Time to Choose"))
        hold(1800)
        # the Sneakers drop card (its box art, not its Open button)
        tap(page.locator(".category-wrap[data-tier='sneakers'] .category-box-canvas"), "drop")
        hold(2200)
        tap(page.locator(".category-wrap[data-tier='sneakers'] .category-open-btn"), "open")
        hold(600)
        tap(page.get_by_text("Cash", exact=True), "cash")
        hold(2400)
        mark("boxes")
        # three crates; YOUR BOX is the middle one
        tap(page.locator(".box-slot[data-index='1']"), "crate")
        mark("opening")
        until(page.locator(".reveal-flash, .reveal-vortex, .reveal-rays").first)
        mark("burst")  # the rarity FX start (index.html hits the Legendary sound here)
        until(page.get_by_role("button", name="Keep"))
        mark("reveal")
        hold(2600)
        tap(page.get_by_role("button", name="Keep"), "keep")
        hold(2200)
        tap(page.locator(".nav-tab[data-nav='screen-account']:not([data-account-group])"), "account")
        until(page.locator("[data-item-action='ship']").first)
        hold(2000)
        tap(page.locator("[data-item-action='ship']").first, "ship")
        hold(1400)
        tap(page.locator("#shipForm button[type='submit']"), "confirm")
        mark("shipped")
        hold(3200)
        mark("end")
        browser.close()

    # ---- resample to constant fps and encode --------------------------------
    base = frames[0][0]
    wall0 = t0
    print(f"{len(frames)} frames, first frame at +{base - wall0:.3f}s", file=sys.stderr)
    dur = marks["end"]
    n = int(dur * FPS)
    j = 0
    for i in range(n):
        t = wall0 + i / FPS
        while j + 1 < len(frames) and frames[j + 1][0] <= t:
            j += 1
        with open(os.path.join(frames_dir, f"{i:05d}.jpg"), "wb") as f:
            f.write(frames[j][1])
    ffmpeg = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(frames_dir, "%05d.jpg"),
                    # JPEGs are full range; Chromium's VP9 decoder rejects a full-range stream
                    "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-color_range", "tv",
                    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-g", "10", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
                    os.path.join(HERE, "screen.webm")], check=True)
    # The Legendary flash (after the dark build-up) has no DOM hook worth
    # polling, so find it in the take: the first big jump in brightness after
    # the burst starts.
    probe = subprocess.run([ffmpeg, "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(frames_dir, "%05d.jpg"),
                            "-vf", "scale=40:80,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"],
                           capture_output=True, text=True, check=True).stdout
    luma = [float(l.split("=")[1]) for l in probe.splitlines() if "YAVG" in l]
    for i in range(int(marks["burst"] * FPS) + 5, len(luma)):
        if luma[i] - luma[i - 1] > 30:
            marks["flash"] = round(i / FPS, 3)
            break
    with open(os.path.join(HERE, "taps.json"), "w") as f:
        json.dump({"viewport": [VW, VH], "fps": FPS, "duration": round(n / FPS, 3), "taps": taps, "marks": marks}, f, indent=1)
    print("wrote screen.webm and taps.json", file=sys.stderr)


if __name__ == "__main__":
    main()
