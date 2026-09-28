# CHOSEN.WIN launch spot

`chosen-launch.mp4`: a 30-second, 1920×1080, 60fps ad for the chosen.win launch, with a synthesized soundtrack.
It runs through the whole loop: pick a crate, open it, pull a Legendary, then Cash Back / Keep / List / Ship, then cash in and open again, ending on the end card.

- `index.html`: the motion graphics. The CHOSEN box (`assets/models/box-chosen-od.glb`, using its baked Charge/Open clips) is drawn with three.js. Particles go on a 2D canvas and the type and UI are DOM overlays. Everything is a pure function of time through `window.renderFrame(t)`. Open it directly to scrub: space plays or pauses, ←/→ steps a frame, shift steps 1s, and `?t=7.2` jumps to a time.
- `soundtrack.py`: builds `soundtrack.wav` using only the standard library. It's a 120 BPM track with SFX timed to the same timeline.
- `render.py`: steps headless Chromium frame by frame and pipes the frames to ffmpeg (libx264).

Re-render (needs Playwright's Chromium, plus an ffmpeg with libx264 in `FFMPEG` or on PATH):

    python3 soundtrack.py
    FFMPEG=/path/to/ffmpeg python render.py --fps 60 --audio soundtrack.wav --out chosen-launch.mp4
    python render.py --stills 1.5,7.2,26   # PNG stills for checking
