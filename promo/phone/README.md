# CHOSEN phone spot

`chosen-phone.mp4` is a ~52-second 1920×1080, 60fps spot with no audio yet.
It plays the real mobile site on a 3D iPhone 17 Pro. A cursor taps through Drops → Sneakers → Open → Cash → crate, which pulls a Legendary AJ1 '85 Chicago, then Keep → Account → Ship → Confirm shipment.
Next the phone is set down on a table, the lock screen wakes with a "Delivered" notification and a ringing bell, and the CHOSEN crate drops onto the screen, charges and opens.
The 3D AJ1 '85 floats out with a slow spin, and the spot ends on "It's already chosen."

- `record.py` drives the site (served from this repo) in a 402×785 iPhone viewport. That's the 17 Pro's 402×839pt screen minus the 54pt status bar. It writes:
  - `screen.webm`: the take at 2×, 30fps, VP9. The frames are back-to-back screenshots, because headless Chromium's screencast only returns 1× frames.
  - `taps.json`: the time and position of every tap, which drives the cursor.

  The prize and the shipping address are fixed so every take is the same:
  - The recorder adds "Air Jordan 1 High '85 Chicago" to the Sneakers pool for the take only. The app's catalog is untouched.
  - A demo shipping address is pre-saved in localStorage.
- `index.html` is the scene. `window.renderFrame(t)` is async because it seeks the recording, and every pixel is a function of `t`. The screen is a canvas drawn each frame: the status bar, the recording, the cursor, and later the lock screen. Open the page directly to scrub: space plays or pauses, ←/→ steps a frame, shift steps 1s, and `?t=40` jumps to a time.
- `lab.html?shot` renders `models/aj1-85.glb` as the square product photo `aj1-85-chicago.png`, which the recording uses as the prize image. That way the card on the phone and the shoe out of the box are the same shoe. `lab.html?phone` shows the iPhone with a UV test grid on its screen.

Re-record, then re-render. This needs Playwright's Chromium, plus an ffmpeg with libx264 and libvpx in `FFMPEG` or on PATH:

    python record.py
    python ../render.py --page promo/phone/index.html --fps 60 --out phone/chosen-phone.mp4   # run from promo/
    python ../render.py --page promo/phone/index.html --stills 17.8,37.4,44 --stilldir phone/stills

## Models (CC-BY-4.0)

- `models/iphone-17-pro.glb`: "iPhone 17 Pro" by Ibrahim.Bhl (https://sketchfab.com/Ibrahim.Bhl)
- `models/aj1-85.glb`: "Air Jordan 1 1985" by gianpego (https://sketchfab.com/3d-models/air-jordan-1-1985-2614cef9a3724ec5852144446fbb726f). Its material was converted from spec-gloss to metal-rough, because three.js no longer reads spec-gloss.
- The crate is the repo's own `assets/models/box-chosen-od.glb`.
