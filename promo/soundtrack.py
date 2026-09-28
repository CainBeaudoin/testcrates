"""Synthesize the spot's soundtrack: a 120 BPM track plus SFX locked to the
timeline in index.html. Pure stdlib (no numpy) — writes soundtrack.wav.

  python3 soundtrack.py [out.wav]
"""
import math, random, struct, sys, wave

SR = 44100
DUR = 30.0
N = int(SR * DUR)
L = [0.0] * N  # mono mix bus; stereo width comes from the pads below
PAD_L = [0.0] * N
PAD_R = [0.0] * N
rng = random.Random(7)
TAU = 2 * math.pi


def idx(t):
    return int(t * SR)


def add(buf, t0, samples, gain=1.0):
    i0 = idx(t0)
    for k, v in enumerate(samples):
        i = i0 + k
        if 0 <= i < N:
            buf[i] += v * gain


def env_exp(n, rate):
    return [math.exp(-rate * k / SR) for k in range(n)]


# ------------------------------------------------------------ instruments --
def kick(t0, g=1.0):
    n = int(0.42 * SR)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        f = 45 + 110 * math.exp(-t * 28)
        ph += TAU * f / SR
        out.append(math.sin(ph) * math.exp(-t * 7.5) + (rng.random() * 2 - 1) * math.exp(-t * 400) * 0.3)
    add(L, t0, out, 0.9 * g)


def snare(t0, g=1.0):
    n = int(0.22 * SR)
    out, lp = [], 0.0
    for k in range(n):
        t = k / SR
        w = rng.random() * 2 - 1
        lp += 0.35 * (w - lp)
        out.append((w - lp) * math.exp(-t * 18) * 0.8 + math.sin(TAU * 190 * t) * math.exp(-t * 30) * 0.5)
    add(L, t0, out, 0.5 * g)


def hat(t0, g=1.0, dec=60):
    n = int(0.08 * SR)
    out, prev = [], 0.0
    for k in range(n):
        w = rng.random() * 2 - 1
        out.append((w - prev) * math.exp(-dec * k / SR))
        prev = w
    add(L, t0, out, 0.13 * g)


def bass(t0, f, dur, g=1.0):
    n = int(dur * SR)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        ph += TAU * f / SR
        a = min(1, t / 0.005) * math.exp(-t * 5)
        v = math.sin(ph) + 0.35 * math.sin(2 * ph) + 0.12 * math.sin(3 * ph)
        out.append(math.tanh(v * 1.4) * a)
    add(L, t0, out, 0.32 * g)


def whoosh(t0, dur, g=1.0, up=True):
    n = int(dur * SR)
    out, lp, lp2 = [], 0.0, 0.0
    for k in range(n):
        p = k / n
        c = 0.02 + 0.5 * (p if up else 1 - p) ** 2
        w = rng.random() * 2 - 1
        lp += c * (w - lp)
        lp2 += c * (lp - lp2)
        out.append(lp2 * math.sin(math.pi * p) ** 1.5)
    add(L, t0, out, 1.4 * g)


def impact(t0, g=1.0, tail=1.6):
    n = int(tail * SR)
    out, ph, lp = [], 0.0, 0.0
    for k in range(n):
        t = k / SR
        f = 28 + 70 * math.exp(-t * 9)
        ph += TAU * f / SR
        w = rng.random() * 2 - 1
        lp += 0.08 * (w - lp)
        out.append(math.tanh(1.8 * math.sin(ph)) * math.exp(-t * 2.6) + lp * 3.2 * math.exp(-t * 7))
    add(L, t0, out, 0.85 * g)


def blip(t0, f, g=1.0, dur=0.07):
    n = int(dur * SR)
    add(L, t0, [math.sin(TAU * f * k / SR) * math.exp(-k / SR * 45) for k in range(n)], 0.22 * g)


def bell(t0, f, g=1.0, dur=1.2):
    n = int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        out.append(math.sin(TAU * f * t) * math.exp(-t * 4) + 0.5 * math.sin(TAU * f * 2.76 * t) * math.exp(-t * 7)
                   + 0.25 * math.sin(TAU * f * 5.4 * t) * math.exp(-t * 12))
    add(L, t0, out, 0.18 * g)


def coin(t0, g=1.0):
    bell(t0, 1318.5, 0.8 * g, 0.5)
    bell(t0 + 0.075, 1975.5, 1.0 * g, 0.9)


def click(t0, g=1.0):
    n = int(0.012 * SR)
    add(L, t0, [(rng.random() * 2 - 1) * math.exp(-k / SR * 500) for k in range(n)], 0.35 * g)


def thud(t0, g=1.0, f=85):
    n = int(0.25 * SR)
    add(L, t0, [math.sin(TAU * f * k / SR * (1 + 0.6 * math.exp(-k / SR * 30))) * math.exp(-k / SR * 16) for k in range(n)], 0.7 * g)


def riser(t0, t1, f0=110, f1=880, g=1.0):
    n = int((t1 - t0) * SR)
    out, ph, lp = [], 0.0, 0.0
    for k in range(n):
        p = k / n
        f = f0 * (f1 / f0) ** (p ** 1.6)
        ph += TAU * f / SR
        w = rng.random() * 2 - 1
        lp += (0.02 + 0.4 * p) * (w - lp)
        trem = 0.75 + 0.25 * math.sin(TAU * (4 + 20 * p) * k / SR)
        v = (math.sin(ph) + 0.4 * math.sin(2.01 * ph)) * trem * 0.5 + lp * 0.8
        out.append(v * p ** 1.8)
    add(L, t0, out, 0.5 * g)


def pad(t0, t1, freqs, g=1.0, att=0.8, rel=1.0):
    n = int((t1 - t0) * SR)
    phs = [[rng.random() * TAU for _ in range(2)] for _ in freqs]
    for k in range(n):
        t = k / SR
        a = min(1, t / att) * min(1, (t1 - t0 - t) / rel)
        l = r = 0.0
        for j, f in enumerate(freqs):
            for d, det in enumerate((0.997, 1.003)):
                v = math.sin(TAU * f * det * t + phs[j][d]) + 0.3 * math.sin(TAU * 2 * f * det * t + phs[j][d])
                if d == 0:
                    l += v
                else:
                    r += v
        i = idx(t0) + k
        if 0 <= i < N:
            PAD_L[i] += l * a * 0.045 * g
            PAD_R[i] += r * a * 0.045 * g


# ----------------------------------------------------------------- timeline --
A1, F1, C2, G1 = 55.0, 43.65, 65.41, 49.0
BARS = [A1, F1, C2, G1]  # a bar = 2s at 120 BPM

# intro: drone + riser into the landing
pad(0, 2.6, [110, 164.8, 220], 0.9, att=0.6, rel=0.4)
riser(0.15, 1.0, 80, 400, 0.6)
impact(1.0, 1.0)
whoosh(0.55, 0.45, 0.8)
whoosh(2.1, 0.35, 0.9)

# groove: kick on the beat, bass on eighths, hats on the off-beats
def groove(t0, t1, claps=True, hats16=False):
    b = math.ceil(t0 * 2) / 2
    while b < t1 - 1e-6:
        kick(b)
        root = BARS[int(b // 2) % 4]
        bass(b, root, 0.24)
        bass(b + 0.25, root * (2 if int(b * 2) % 2 else 1), 0.22, 0.8)
        hat(b + 0.25, 1.0)
        if hats16:
            hat(b + 0.125, 0.5)
            hat(b + 0.375, 0.5)
        if claps and int(b * 2) % 2 == 1:
            snare(b, 0.8)
        b += 0.5

groove(2.5, 4.8, claps=False)
# pick: slide-ins, the selection
whoosh(2.4, 0.5, 0.9)
bell(3.7, 880, 0.9)
click(3.7)
whoosh(4.15, 0.6, 0.9)

# the charge: snare roll accelerating, riser, rarity ticks as the glow cycles
riser(4.9, 6.65, 90, 1100, 1.0)
t = 5.0
while t < 6.55:
    p = (t - 5.0) / 1.55
    snare(t, 0.35 + 0.5 * p)
    t += 0.25 if p < 0.35 else 0.125 if p < 0.7 else 0.0625
last = -1
for k in range(0, int(1.7 * SR / 100)):
    tt = 4.95 + k * 100 / SR
    ch = min(1, max(0, (tt - 4.95) / 1.7))
    cyc = int((ch ** 1.6) * 22)
    if cyc != last and tt < 6.6:
        blip(tt, [523, 659, 784, 988, 1175][cyc % 5], 0.9)
        last = cyc
# LEGENDARY
impact(6.72, 1.3, 2.2)
pad(6.72, 9.2, [220, 277.2, 329.6, 440, 554.4], 1.2, att=0.05, rel=1.2)
for i, f in enumerate([880, 1108.7, 1318.5, 1760, 2217.5]):
    bell(6.8 + i * 0.06, f, 0.8)
groove(7.0, 9.0)
for k in range(16):  # price counter
    blip(7.95 + k * 0.045, 1400 + k * 40, 0.35, 0.03)

# montage: a hit per word
groove(9.0, 11.0, hats16=True)
for w in (9.0, 9.5, 10.0, 10.5):
    impact(w, 0.35, 0.4)
    snare(w, 0.6)
whoosh(8.7, 0.35, 0.9)

# your call
groove(11.0, 25.0)
for i in range(4):
    blip(11.3 + i * 0.1, 660 + i * 110, 0.8)
click(12.1, 1.2)
whoosh(12.2, 0.3, 0.8)
# cash back
whoosh(12.6, 0.7, 1.0)
coin(13.35, 1.2)
for k in range(14):
    blip(13.3 + k * 0.055, 1200 + k * 30, 0.3, 0.03)
bell(14.02, 1568, 0.7, 0.6)
# keep
whoosh(14.85, 0.3, 0.7)
whoosh(15.45, 0.65, 0.9)
thud(16.1, 0.7, 120)
bell(16.1, 659.3, 1.0)
bell(16.12, 987.8, 0.7)
blip(16.3, 880, 0.6)
# list
whoosh(17.25, 0.3, 0.7)
for k in range(6):
    click(17.85 + k * 0.09, 0.9)
click(18.55, 1.3)
blip(18.72, 1046.5, 0.8)
blip(18.8, 1568, 0.8)
impact(19.0, 0.6, 0.6)
thud(19.0, 1.0, 70)
coin(19.12, 1.1)
# ship
whoosh(19.65, 0.35, 0.8)
whoosh(20.15, 0.45, 0.7, up=False)
thud(20.6, 0.7, 110)
thud(21.0, 0.6, 95)
thud(21.22, 0.9, 80)
click(21.22, 1.5)
def inout(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
done = set()
for k in range(int(1.8 * SR / 50)):
    tt = 20.4 + k * 50 / SR
    tp = inout(min(1, (tt - 20.4) / 1.8))
    for s in range(4):
        if s not in done and tp >= s / 3 - 0.001:
            done.add(s)
            bell(tt, [784, 880, 988, 1318.5][s], 0.6, 0.5)
whoosh(21.8, 0.55, 1.0)
# cash in, run it back
blip(22.62, 988, 0.8)
coin(22.85, 0.6)
for i in range(5):
    kick(22.9 + abs(i - 2) * 0.07, 0.25)
opens = [23.55 + d for d in (0.12, 0.3, 0.0, 0.42, 0.22)]
tones = {"uncommon": 659.3, "epic": 987.8, "legendary": 1318.5, "rare": 784}
for o, r in zip(opens, ["uncommon", "epic", "legendary", "rare", "legendary"]):
    snare(o, 0.35)
    bell(o + 0.05, tones[r], 0.8, 0.7)

# end card
riser(24.3, 25.4, 200, 1600, 0.6)
impact(25.45, 1.4, 2.5)
pad(25.45, 30.0, [110, 220, 277.2, 329.6, 440], 1.3, att=0.1, rel=3.2)
for i, f in enumerate([880, 1108.7, 1318.5, 1760]):
    bell(25.5 + i * 0.08, f, 0.7, 1.5)
for i in range(10):
    blip(26.15 + i * 0.045, 1760, 0.18, 0.03)
bell(26.72, 1318.5, 0.6, 1.2)
kick(26.2, 0.6)
kick(27.2, 0.4)

# --------------------------------------------------------------- master ----
out = sys.argv[1] if len(sys.argv) > 1 else "soundtrack.wav"
peak = max(max(abs(L[i] + PAD_L[i]), abs(L[i] + PAD_R[i])) for i in range(0, N, 7)) or 1
g = 1.6 / peak
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for i in range(N):
        fade = min(1, (DUR - i / SR) / 0.35)
        l = math.tanh((L[i] + PAD_L[i]) * g) * 0.89 * fade
        r = math.tanh((L[i] + PAD_R[i]) * g) * 0.89 * fade
        frames += struct.pack("<hh", int(l * 32767), int(r * 32767))
    w.writeframes(bytes(frames))
print("wrote", out)
