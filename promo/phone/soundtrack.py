"""Synthesize the phone spot's soundtrack from its cue list. Pure stdlib.

Every sound hangs off a cue that index.html computes from its own timeline
(window.CUES), so picture and sound can't drift apart:

  python ../render.py --page promo/phone/index.html --cues phone/cues.json   # from promo/
  python3 soundtrack.py [cues.json] [soundtrack.wav]

Each interaction gets its own sound, and they're musical rather than clicks:
taps are chimes that climb a scale over a soft kick; the phone's flip and
spin whoosh; page swooshes, sheets
sliding up, the crate charge and Legendary hit, Keep, Ship and the "Order
placed" chime, the phone set down (kick + bass), the lock bell, the
notification ding, buzz and bell, the swipe, the box falling and landing,
the charge tom roll, the flaps, the shoe rising, the light leaks, the
brackets locking on, the price counting up and the end card. Under it all
runs a half-time dubstep score with two drops (see "the score" below).
"""
import json, math, os, random, struct, sys, wave

HERE = os.path.dirname(os.path.abspath(__file__))
CUES = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "cues.json")))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "soundtrack.wav")

SR = 44100
DUR = CUES["duration"] + 0.2
N = int(SR * DUR)
L = [0.0] * N  # mono bus
PAD_L = [0.0] * N
PAD_R = [0.0] * N
rng = random.Random(11)
TAU = 2 * math.pi


def add(buf, t0, samples, gain=1.0):
    i0 = int(t0 * SR)
    for k, v in enumerate(samples):
        i = i0 + k
        if 0 <= i < N:
            buf[i] += v * gain


def noise():
    return rng.random() * 2 - 1


# ------------------------------------------------------------ instruments --
def kick(t0, g=1.0):
    out, ph = [], 0.0
    for k in range(int(0.4 * SR)):
        t = k / SR
        ph += TAU * (45 + 105 * math.exp(-t * 28)) / SR
        out.append(math.sin(ph) * math.exp(-t * 8) + noise() * math.exp(-t * 400) * 0.25)
    add(L, t0, out, 0.8 * g)


def snare(t0, g=1.0):
    out, lp = [], 0.0
    for k in range(int(0.2 * SR)):
        t = k / SR
        w = noise()
        lp += 0.35 * (w - lp)
        out.append((w - lp) * math.exp(-t * 19) * 0.8 + math.sin(TAU * 190 * t) * math.exp(-t * 30) * 0.45)
    add(L, t0, out, 0.45 * g)


def hat(t0, g=1.0, dec=60):
    out, prev = [], 0.0
    for k in range(int(0.07 * SR)):
        w = noise()
        out.append((w - prev) * math.exp(-dec * k / SR))
        prev = w
    add(L, t0, out, 0.11 * g)


def bass(t0, f, dur, g=1.0):
    out, ph = [], 0.0
    for k in range(int(dur * SR)):
        t = k / SR
        ph += TAU * f / SR
        a = min(1, t / 0.005) * math.exp(-t * 5)
        out.append(math.tanh((math.sin(ph) + 0.35 * math.sin(2 * ph)) * 1.4) * a)
    add(L, t0, out, 0.28 * g)


def whoosh(t0, dur, g=1.0, up=True):
    n = int(dur * SR)
    out, lp, lp2 = [], 0.0, 0.0
    for k in range(n):
        p = k / n
        c = 0.02 + 0.5 * (p if up else 1 - p) ** 2
        lp += c * (noise() - lp)
        lp2 += c * (lp - lp2)
        out.append(lp2 * math.sin(math.pi * p) ** 1.5)
    add(L, t0, out, 1.4 * g)


def impact(t0, g=1.0, tail=1.6):
    out, ph, lp = [], 0.0, 0.0
    for k in range(int(tail * SR)):
        t = k / SR
        ph += TAU * (28 + 70 * math.exp(-t * 9)) / SR
        lp += 0.08 * (noise() - lp)
        out.append(math.tanh(1.8 * math.sin(ph)) * math.exp(-t * 2.6) + lp * 3.2 * math.exp(-t * 7))
    add(L, t0, out, 0.8 * g)


def blip(t0, f, g=1.0, dur=0.07):
    add(L, t0, [math.sin(TAU * f * k / SR) * math.exp(-k / SR * 45) for k in range(int(dur * SR))], 0.2 * g)


def bell(t0, f, g=1.0, dur=1.2):
    out = []
    for k in range(int(dur * SR)):
        t = k / SR
        out.append(math.sin(TAU * f * t) * math.exp(-t * 4) + 0.5 * math.sin(TAU * f * 2.76 * t) * math.exp(-t * 7)
                   + 0.25 * math.sin(TAU * f * 5.4 * t) * math.exp(-t * 12))
    add(L, t0, out, 0.16 * g)


def thud(t0, g=1.0, f=85, dec=16):
    add(L, t0, [math.sin(TAU * f * k / SR * (1 + 0.6 * math.exp(-k / SR * 30))) * math.exp(-k / SR * dec)
                for k in range(int(0.3 * SR))], 0.65 * g)


def riser(t0, t1, f0=110, f1=880, g=1.0):
    n = int((t1 - t0) * SR)
    out, ph, lp = [], 0.0, 0.0
    for k in range(n):
        p = k / n
        ph += TAU * f0 * (f1 / f0) ** (p ** 1.6) / SR
        lp += (0.02 + 0.4 * p) * (noise() - lp)
        trem = 0.75 + 0.25 * math.sin(TAU * (4 + 20 * p) * k / SR)
        out.append(((math.sin(ph) + 0.4 * math.sin(2.01 * ph)) * trem * 0.5 + lp * 0.8) * p ** 1.8)
    add(L, t0, out, 0.45 * g)


def pad(t0, t1, freqs, g=1.0, att=0.8, rel=1.0):
    n = int((t1 - t0) * SR)
    phs = [[rng.random() * TAU for _ in range(2)] for _ in freqs]
    i0 = int(t0 * SR)
    for k in range(n):
        t = k / SR
        a = min(1, t / att) * min(1, (t1 - t0 - t) / rel)
        l = r = 0.0
        for j, f in enumerate(freqs):
            l += math.sin(TAU * f * 0.997 * t + phs[j][0]) + 0.3 * math.sin(TAU * 2 * f * 0.997 * t + phs[j][0])
            r += math.sin(TAU * f * 1.003 * t + phs[j][1]) + 0.3 * math.sin(TAU * 2 * f * 1.003 * t + phs[j][1])
        i = i0 + k
        if 0 <= i < N:
            PAD_L[i] += l * a * 0.04 * g
            PAD_R[i] += r * a * 0.04 * g


# ------------------------------------------------------------- the sounds --
def chime(t0, f, g=1.0):
    """A marimba-bell note: a warm fundamental, a woody 4th partial, a glassy
    shimmer on top. What a tap sounds like — a note, not a click."""
    out = []
    for k in range(int(1.1 * SR)):
        t = k / SR
        a = min(1, t / 0.003)
        out.append(a * (math.sin(TAU * f * t) * math.exp(-t * 5)
                        + 0.45 * math.sin(TAU * f * 4 * t) * math.exp(-t * 22)
                        + 0.25 * math.sin(TAU * f * 2.76 * t) * math.exp(-t * 9)))
    add(L, t0, out, 0.3 * g)


# The taps climb A minor pentatonic (it sits over the A–F–C–G bassline), so the
# flow plays as a rising melody: momentum you can hear.
PENTA = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98]


def tap_note(t0, i):
    f = PENTA[min(i, len(PENTA) - 1)]
    chime(t0, f, 0.8)
    chime(t0, f / 2, 0.25)      # an octave under, for body


def cardboard(t0, g=1.0):
    """A dull cardboard knock: band-limited noise plus a low body."""
    out, lp, lp2 = [], 0.0, 0.0
    for k in range(int(0.18 * SR)):
        t = k / SR
        lp += 0.25 * (noise() - lp)
        lp2 += 0.25 * (lp - lp2)
        out.append((lp - lp2) * 2.5 * math.exp(-t * 32))
    add(L, t0, out, 0.8 * g)
    thud(t0, 0.5 * g, 110, 28)


def buzz(t0, dur, g=1.0):
    """Phone vibrating against a table: a 170Hz motor plus the case rattling."""
    out = []
    for k in range(int(dur * SR)):
        t = k / SR
        env = min(1, t / 0.02) * min(1, (dur - t) / 0.03)
        motor = math.tanh(3 * math.sin(TAU * 170 * t))
        rattle = noise() * max(0, math.sin(TAU * 85 * t)) ** 6
        out.append((motor * 0.5 + rattle * 0.8) * env)
    add(L, t0, out, 0.35 * g)


def handbell(t0, g=1.0):
    for i, (f, d) in enumerate([(1318.5, 0), (1568, 0.13), (1318.5, 0.26), (1568, 0.39)]):
        bell(t0 + d, f, g * (1 - i * 0.18), 0.9)


def shimmer(t0, t1, g=1.0):
    n = int((t1 - t0) * SR)
    out = []
    fs = [1760, 2217.5, 2637, 3520]
    for k in range(n):
        t, p = k / SR, k / n
        v = sum(math.sin(TAU * f * t * (1 + 0.002 * math.sin(TAU * 5 * t + j))) for j, f in enumerate(fs)) / len(fs)
        out.append(v * (0.5 + 0.5 * math.sin(TAU * (6 + 10 * p) * t)) * p ** 1.2 * min(1, (1 - p) * 8 + 0.4))
    add(L, t0, out, 0.1 * g)


def twinkles(t0, t1, g=1.0):
    t = t0
    notes = [1760, 2093, 2349.3, 2637, 3136]
    while t < t1:
        blip(t, rng.choice(notes), 0.35 * g, 0.12)
        t += 0.18 + rng.random() * 0.35


# ---------------------------------------------------------- the score -------
# A continuous half-time dubstep track, so the spot flows as music and the taps
# ride on top of it. The tempo is nudged (~140 BPM) so both drops land on a
# downbeat: drop 1 on the Legendary flash, drop 2 on the box opening. It's
# written to its own bus (MUSIC) and mixed louder than the effects.
MUSIC = [0.0] * N
SFX = L
L = MUSIC  # the instruments write to L; point it at the music bus for now

rec0, rec1 = CUES["rec"]
T_BURST, T_FLASH = CUES["burst"], CUES["flash"]
T_PUT, T_SWIPE, T_LAND = CUES["put"], CUES["swipe"], CUES["land"]
T_OPEN, T_END = CUES["open"], CUES["end"]
n_beats = max(1, round((T_OPEN - T_FLASH) / (60 / 140)))
BEAT = (T_OPEN - T_FLASH) / n_beats          # ≈ 60/140
BAR = BEAT * 4
ROOTS = [55.0, 43.65, 65.41, 49.0]           # A  F  C  G  (one per bar)
CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]]


def beats(t0, t1):
    """Beat times on the grid (anchored to the flash) inside [t0, t1)."""
    k = math.ceil((t0 - T_FLASH) / BEAT - 1e-6)
    while T_FLASH + k * BEAT < t1 - 1e-6:
        yield k, T_FLASH + k * BEAT
        k += 1


def bar_of(k):
    return ROOTS[(k // 4) % 4], CHORDS[(k // 4) % 4]


def wobble(t0, dur, f, rate, g=1.0):
    """Wobble bass: two detuned saws through a resonant low-pass whose cutoff
    an LFO swings `rate` times per beat, then driven into saturation."""
    n = int(dur * SR)
    out, p1, p2, lo, band = [], 0.0, 0.0, 0.0, 0.0
    for k in range(n):
        t = k / SR
        p1 = (p1 + f / SR) % 1
        p2 = (p2 + f * 1.007 / SR) % 1
        saw = (2 * p1 - 1) + (2 * p2 - 1)
        lfo = 0.5 - 0.5 * math.cos(TAU * rate * t / BEAT)
        cut = 90 + 2600 * lfo ** 1.6
        fc = 2 * math.sin(math.pi * min(cut, SR / 6) / SR)
        lo += fc * band
        hi = saw - lo - 0.35 * band
        band += fc * hi
        env = min(1, t / 0.004) * min(1, (dur - t) / 0.01)
        out.append(math.tanh(2.2 * lo) * env + 0.6 * math.sin(TAU * f * t) * env)  # + sub
    add(L, t0, out, 0.75 * g)


def sub(t0, dur, f, g=1.0):
    add(L, t0, [math.sin(TAU * f * k / SR) * min(1, k / 200) * min(1, (dur - k / SR) / 0.02) for k in range(int(dur * SR))], 0.5 * g)


def pluck(t0, f, g=1.0):
    out, lo = [], 0.0
    for k in range(int(0.3 * SR)):
        t = k / SR
        saw = 2 * ((f * t) % 1) - 1
        lo += (0.05 + 0.4 * math.exp(-t * 25)) * (saw - lo)
        out.append(lo * math.exp(-t * 9))
    add(L, t0, out, 0.22 * g)


def half_time(t0, t1, g=1.0, hats16=False):
    """Kick on 1 (and the and-of-3), snare on 3, hats on 8ths (or 16ths)."""
    for k, b in beats(t0, t1):
        pos = k % 4
        if pos == 0:
            kick(b, 1.0 * g)
        if pos == 2:
            snare(b, 1.2 * g)
            thud(b, 0.4 * g, 180, 30)
        if pos == 3:
            kick(b + BEAT / 2, 0.7 * g)
        hat(b + BEAT / 2, 0.9 * g)
        if hats16:
            hat(b + BEAT / 4, 0.5 * g)
            hat(b + BEAT * 3 / 4, 0.5 * g)


# intro: a reverse swell into the first bar
riser(0, rec0 + 0.1, 80, 500, 0.6)
pad(0, rec0 + 1.5, [110, 164.8, 220], 0.9, att=0.4, rel=1.0)

# A — the app flow: half-time groove, sub, and a plucked chord riff
half_time(rec0, T_BURST, 0.95, hats16=False)
for k, b in beats(rec0, T_BURST):
    root, chord = bar_of(k)
    if k % 4 == 0:
        sub(b, BAR * 0.95, root, 0.6)
        pad(b, b + BAR, chord, 0.18, att=0.05, rel=0.3)
    for e in range(2):  # 8th-note arpeggio
        pluck(b + e * BEAT / 2, chord[(k * 2 + e) % 3] * 2, 0.8)

# build — snare roll + sweep up to the flash (the "build" cue adds its riser)
t = T_BURST
while t < T_FLASH - 0.03:
    p = (t - T_BURST) / (T_FLASH - T_BURST)
    snare(t, 0.35 + 0.8 * p)
    t += BEAT / 2 if p < 0.4 else BEAT / 4 if p < 0.75 else BEAT / 8
riser(T_BURST, T_FLASH, 120, 2000, 0.8)

# DROP 1 — the Legendary flash through Ship
impact(T_FLASH, 1.0, 1.5)
half_time(T_FLASH, T_PUT, 1.0, hats16=True)
for k, b in beats(T_FLASH, T_PUT):
    root, _ = bar_of(k)
    rate = [2, 2, 3, 4][(k // 4 + k) % 4]  # 8ths, 8ths, triplets, 16ths
    wobble(b, BEAT, root, rate, 1.0)
riser(T_PUT - BAR / 2, T_PUT, 200, 900, 0.4)

# breakdown — the table: pad, sub, half-speed hats, a riser into the landing
pad(T_PUT, T_OPEN, [55, 110, 164.8, 220], 1.0, att=0.3, rel=0.2)
for k, b in beats(T_PUT, T_LAND):
    root, _ = bar_of(k)
    if k % 4 == 0:
        sub(b, BAR, root, 1.0)
        kick(b, 0.8)
    if k % 2 == 1:
        hat(b, 0.8)
riser(T_SWIPE - 0.3, T_LAND, 100, 1600, 0.9)
impact(T_LAND, 0.8, 0.8)
# the charge: 16th kicks into the second drop
for k, b in beats(T_LAND, T_OPEN):
    kick(b, 0.7)
    kick(b + BEAT / 2, 0.5)

# DROP 2 — the box opens: faster wobble, everything on
impact(T_OPEN, 1.2, 2.0)
half_time(T_OPEN, T_END + 0.2, 1.1, hats16=True)
for k, b in beats(T_OPEN, T_END + 0.2):
    root, chord = bar_of(k)
    rate = [4, 3, 4, 6][k % 4]
    wobble(b, BEAT, root, rate, 1.1)
    if k % 4 == 0:
        pad(b, b + BAR, [c * 2 for c in chord], 0.4, att=0.05, rel=0.4)

# end card: one last hit and let it ring
impact(T_END + 0.3, 1.2, 2.0)
pad(T_END + 0.3, DUR, [220, 277.2, 329.6, 440], 1.0, att=0.05, rel=1.5)

L = SFX  # back to the effects bus for the cues

# ------------------------------------------------------------ the cues ------
tap_i = 0
for c in CUES["cues"]:
    t, k = c["t"], c["kind"]
    if k == "intro":
        whoosh(t, 0.9, 0.9)
        riser(t, t + 1.4, 70, 300, 0.4)
    elif k == "flip":
        whoosh(t, c["dur"], 1.0)
        chime(t + c["dur"] * 0.8, 880, 0.7)
        chime(t + c["dur"] * 0.8, 1318.51, 0.5)
    elif k == "spin":
        whoosh(t, c["dur"] * 0.5, 0.8)
        whoosh(t + c["dur"] * 0.45, c["dur"] * 0.55, 0.8, up=False)
    elif k == "settle":
        impact(t, 0.5, 1.2)
    elif k == "tap":
        tap_note(t, tap_i)
        tap_i += 1
    elif k == "page":
        whoosh(t, 0.3, 0.8, up=False)
    elif k == "sheet":
        whoosh(t, 0.32, 0.9)
        blip(t + 0.22, 880, 1.0, 0.06)
    elif k == "pay":
        bell(t, 1318.5, 0.6, 0.4)
        bell(t + 0.07, 1975.5, 0.7, 0.6)
    elif k == "crates":
        for i, f in enumerate([110, 130.81, 164.81]):  # three tuned hits as the crates slide in
            thud(t + i * 0.11, 0.6, f, 18)
            chime(t + i * 0.11, f * 4, 0.3)
            whoosh(t + i * 0.11 - 0.08, 0.2, 0.25)
    elif k == "crateOpen":
        for i, f in enumerate([220, 261.63, 329.63]):  # a quick rising arpeggio as the crate cracks
            chime(t + i * 0.07, f, 0.6)
    elif k == "build":
        t1 = c["until"]
        riser(t, t1, 90, 1100, 0.6)  # the score carries the snare roll on its own grid
    elif k == "legendary":
        impact(t, 1.3, 2.2)
        pad(t, t + 2.4, [220, 277.2, 329.6, 440, 554.4], 1.2, att=0.05, rel=1.2)
        for i, f in enumerate([880, 1108.7, 1318.5, 1760, 2217.5]):
            bell(t + 0.05 + i * 0.06, f, 0.8)
    elif k == "card":
        whoosh(t - 0.15, 0.3, 0.6)
        for i in range(14):
            blip(t + 0.1 + i * 0.045, 1300 + i * 40, 0.35, 0.03)
        bell(t + 0.75, 1568, 0.7, 0.6)
    elif k == "keep":
        thud(t, 0.7, 120)
        bell(t + 0.02, 659.3, 0.9)
        bell(t + 0.04, 987.8, 0.7)
    elif k == "scroll":
        for i, f in enumerate([659.25, 783.99, 880.0, 1046.5, 1174.66]):  # an arpeggio that runs with the scroll
            chime(t + i * 0.1, f, 0.35)
    elif k == "confirm":
        blip(t + 0.03, 784, 0.8)
        blip(t + 0.1, 1175, 0.8)
    elif k == "order":
        whoosh(t - 0.1, 0.25, 0.4)
        bell(t, 1046.5, 0.8, 0.8)
        bell(t + 0.1, 1568, 0.9, 1.0)
    elif k == "caption":
        whoosh(t - 0.05, 0.3, 0.3)
        impact(t + 0.1, 0.18, 0.4)
    elif k == "lift":
        whoosh(t, c["until"] - t, 0.7)
    elif k == "phoneDown":
        kick(t, 1.0)
        bass(t, 55.0, 0.6, 1.2)
        thud(t + 0.11, 0.25, 110, 30)
    elif k == "lock":
        bell(t, 440, 0.6, 0.8)
    elif k == "wake":
        riser(t - 0.2, t + 0.3, 400, 900, 0.25)
    elif k == "notify":
        bell(t, 1568, 1.0, 0.9)
        bell(t + 0.13, 2093, 1.0, 1.1)
    elif k == "buzz":
        buzz(t, c["dur"])
    elif k == "bell":
        handbell(t, 0.8)
    elif k == "swipe":
        whoosh(t + 0.05, c["dur"], 1.1)
        add(L, t, [noise() * math.exp(-j / SR * 12) * 0.3 for j in range(int(0.25 * SR))], 0.25)  # slides off the table
    elif k == "fall":
        whoosh(t, c["until"] - t + 0.05, 1.0, up=True)
    elif k == "land":
        impact(t, 1.0, 1.2)
        cardboard(t, 1.3)
        cardboard(t + 0.16, 0.45)  # a little bounce
        add(L, t, [noise() * math.exp(-j / SR * 5) * 0.2 for j in range(int(0.8 * SR))], 0.3)  # dust
    elif k == "charge":
        t1 = c["until"]
        riser(t, t1, 60, 700, 0.8)
        s = t
        while s < t1:  # a tom roll that speeds up with the shaking
            p = (s - t) / (t1 - t)
            thud(s, 0.3 + 0.5 * p, 90 + 80 * p, 22)
            snare(s, 0.15 + 0.35 * p)
            s += 0.14 - 0.08 * p
    elif k == "open":
        for i, f in enumerate([220, 261.63, 329.63, 440]):  # the flaps: a quick rising arpeggio
            chime(t + i * 0.06, f, 0.7)
        impact(t + 0.1, 1.3, 2.4)
        for i, f in enumerate([880, 1108.7, 1318.5, 1760, 2217.5]):
            bell(t + 0.15 + i * 0.07, f, 0.8, 1.4)
    elif k == "rise":
        shimmer(t, c["until"] + 0.3, 1.0)
        riser(t, c["until"], 200, 800, 0.35)
    elif k == "hover":
        bell(t, 1318.5, 0.6, 1.4)
        twinkles(t + 0.3, T_END + 0.5, 0.8)
    elif k == "leak":
        whoosh(t - 0.1, 0.4, 0.6)
        riser(t - 0.12, t + 0.05, 600, 2400, 0.25)
    elif k == "lockon":
        chime(t, 1567.98, 0.8)
        chime(t + 0.07, 2093.0, 0.8)
        kick(t, 0.5)
    elif k == "count":
        s = t
        while s < c["until"]:
            blip(s, 1600 + 900 * (s - t) / (c["until"] - t), 0.3, 0.025)
            s += 0.04
    elif k == "endcard":
        impact(t, 1.3, 2.5)
        for i, f in enumerate([880, 1108.7, 1318.5, 1760]):
            bell(t + 0.05 + i * 0.08, f, 0.7, 1.6)
        kick(t, 0.8)

# --------------------------------------------------------------- master ----
MUSIC_GAIN, SFX_GAIN = 1.0, 0.6  # the score leads; effects sit on top of it
L = [MUSIC_GAIN * MUSIC[i] + SFX_GAIN * SFX[i] for i in range(N)]
peak = max(max(abs(L[i] + PAD_L[i]), abs(L[i] + PAD_R[i])) for i in range(0, N, 7)) or 1
g = 1.5 / peak
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for i in range(N):
        fade = min(1, (DUR - i / SR) / 0.5, i / SR / 0.05)
        l = math.tanh((L[i] + PAD_L[i]) * g) * 0.89 * fade
        r = math.tanh((L[i] + PAD_R[i]) * g) * 0.89 * fade
        frames += struct.pack("<hh", int(l * 32767), int(r * 32767))
    w.writeframes(bytes(frames))
print("wrote", OUT, f"({len(CUES['cues'])} cues, {DUR:.1f}s)")
