"""
Tileable procedural PBR textures, made with numpy (runs inside Blender's Python).

All noise is built in the frequency domain, so every texture tiles perfectly.
Arrays are (rows, cols) with row 0 at the BOTTOM of the image (Blender's
pixel order), so "+v" is "up".
"""
import math
import numpy as np


# ---------------------------------------------------------------- basics
def spectral_noise(h, w, beta, seed, stretch=(1.0, 1.0), fmin=0.0):
    """Zero-mean, unit-std periodic 1/f^beta noise.
    stretch=(sx, sy): sx > 1 makes features long along x (rows), sy > 1 long along y."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    f = np.sqrt((fx * stretch[0]) ** 2 + (fy * stretch[1]) ** 2)
    f[0, 0] = 1.0
    spec = (rng.standard_normal(f.shape) + 1j * rng.standard_normal(f.shape)) / f ** beta
    if fmin > 0:
        spec *= 1.0 - np.exp(-(f / fmin) ** 2)
    spec[0, 0] = 0
    n = np.fft.irfft2(spec, s=(h, w))
    return (n - n.mean()) / (n.std() + 1e-9)


def blur(img, sigma):
    """Periodic gaussian blur (works on 2D arrays)."""
    h, w = img.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(img) * g, s=(h, w))


def convolve(img, kernel):
    h, w = img.shape
    return np.fft.irfft2(np.fft.rfft2(img) * np.fft.rfft2(kernel), s=(h, w))


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


def rgb(h, w, c):
    return np.broadcast_to(np.array(c, dtype=np.float64), (h, w, 3)).copy()


def normal_from_height(height, strength):
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(height)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def periodic_blobs(h, w, count, rmin, rmax, seed, squash=(0.5, 1.0)):
    """Sum of soft elliptical blobs placed on a torus."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    out = np.zeros((h, w))
    for _ in range(count):
        cy, cx = rng.uniform(0, h), rng.uniform(0, w)
        r = rng.uniform(rmin, rmax)
        sq = rng.uniform(*squash)
        a = rng.uniform(0, math.pi)
        dy = (yy - cy + h / 2) % h - h / 2
        dx = (xx - cx + w / 2) % w - w / 2
        u = dx * math.cos(a) + dy * math.sin(a)
        v = (-dx * math.sin(a) + dy * math.cos(a)) / sq
        out += np.exp(-(u * u + v * v) / (r * r))
    return out


def random_walk_lines(h, w, count, steps, seed, turn=0.25, heading=None, branch=0.0, width=0.7):
    """Thin periodic crack lines (returns a 0..1 mask)."""
    rng = np.random.default_rng(seed)
    m = np.zeros((h, w))
    walkers = []
    for _ in range(count):
        ang = rng.uniform(0, 2 * math.pi) if heading is None else heading + rng.normal(0, 0.1)
        walkers.append([rng.uniform(0, h), rng.uniform(0, w), ang, steps])
    while walkers:
        y, x, ang, n = walkers.pop()
        for _ in range(int(n)):
            ang += rng.normal(0, turn)
            if heading is not None:
                ang += (heading - ang) * 0.08
            y += math.sin(ang)
            x += math.cos(ang)
            m[int(y) % h, int(x) % w] = 1.0
            if branch and rng.random() < branch:
                walkers.append([y, x, ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.1), n * 0.35])
    return np.clip(blur(m, width) * 3.0, 0, 1)


# ---------------------------------------------------------------- materials
def concrete_floor(size=1024, seed=10):
    """4 m x 4 m tile of old hangar concrete: slab joints, cracks, oil stains, desert dust."""
    H = W = size
    large = spectral_noise(H, W, 1.9, seed)
    mid = spectral_noise(H, W, 1.2, seed + 1)
    fine = spectral_noise(H, W, 0.35, seed + 2)
    tone = 0.40 + 0.035 * large + 0.02 * mid + 0.012 * fine
    col = tone[..., None] * np.array([1.03, 1.0, 0.94])

    dust = smoothstep(0.3, 1.6, large + 0.4 * mid)
    col = mix(col, rgb(H, W, (0.56, 0.49, 0.39)), dust * 0.55)

    stains = periodic_blobs(H, W, 9, 40, 130, seed + 3, (0.35, 0.9))
    stains += 0.5 * periodic_blobs(H, W, 8, 5, 14, seed + 4, (0.5, 1.0))
    stain = smoothstep(0.45, 0.95, stains + 0.3 * mid)
    col = mix(col, rgb(H, W, (0.07, 0.065, 0.058)), stain * 0.7)
    ring = smoothstep(0.2, 0.4, stains + 0.25 * mid) - stain
    col *= (1 - 0.18 * np.clip(ring, 0, 1))[..., None]

    cracks = random_walk_lines(H, W, 5, 700, seed + 5, turn=0.07, branch=0.002, width=0.45)
    col *= (1 - 0.4 * cracks)[..., None]

    joint = np.zeros((H, W))
    for k in (-1, 0, 1):
        joint[k % H, :] = 1
        joint[:, k % W] = 1
    joint = np.clip(blur(joint, 0.8) * 1.6, 0, 1)
    col *= (1 - 0.55 * joint)[..., None]

    pits = np.clip(blur((np.random.default_rng(seed + 6).random((H, W)) > 0.9985).astype(float), 1.0) * 6, 0, 1)
    col *= (1 - 0.35 * pits)[..., None]

    rough = np.clip(0.9 + 0.04 * mid - 0.5 * stain - 0.08 * dust * 0, 0.3, 1.0)
    height = 0.12 * fine + 0.25 * mid - 1.2 * cracks - 1.0 * joint - 0.8 * pits
    return {
        'color': np.clip(col, 0, 1),
        'roughness': rough,
        'normal': normal_from_height(height, 2.2),
    }


def _drips(points, h, w, length, width):
    """Smear point marks downwards (towards row 0) like rust streaks."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    dy = (-yy) % h  # rows *below* the origin (wrapping)
    dx = (xx + w / 2) % w - w / 2
    k = np.exp(-dy / length) * np.exp(-(dx * dx) / (width * width))
    k[dy > h * 0.7] = 0
    k /= k.max()
    return convolve(points, k)


def corrugated_metal(w=512, h=2048, seed=20, paint=(0.50, 0.51, 0.49), paint_metal=0.7,
                     ribs=26, rust_amount=0.0, peel=0.0, bottom_dust=0.08):
    """Corrugated sheet, tile = 2 m wide x 8 m tall (full wall height, row 0 = floor).
    Vertical ribs, horizontal sheet laps with bolts, rust rising from the bottom and
    streaking down from the bolts."""
    H, W = h, w
    v = (np.arange(H) / H)[:, None] * np.ones((1, W))
    u = (np.arange(W) / W)[None, :] * np.ones((H, 1))
    corr = np.sin(2 * math.pi * ribs * u)

    n1 = spectral_noise(H, W, 1.6, seed)
    n2 = spectral_noise(H, W, 1.1, seed + 1)
    fine = spectral_noise(H, W, 0.4, seed + 2)
    streak_n = spectral_noise(H, W, 1.3, seed + 3, stretch=(1.0, 9.0))

    col = rgb(H, W, paint) * (1 + 0.05 * n2[..., None] + 0.03 * fine[..., None])
    col *= (0.93 + 0.07 * corr)[..., None]  # crests catch a little more dust

    # sheet laps every 2.4 m (+ the tile edge), with a bolt on every rib crest
    lap_rows = [int(H * m / 8.0) for m in (2.4, 4.8, 7.2)]
    lap = np.zeros((H, W))
    bolts = np.zeros((H, W))
    for r in lap_rows:
        lap[r - 2:r + 2, :] = 1
        for k in range(ribs):
            c = int(((k + 0.25) / ribs) * W) % W
            bolts[(r + 6) % H, c] = 1
    seam = np.zeros((H, W)); seam[:, 0:3] = 1
    bolt_disc = np.clip(blur(bolts, 1.6) * 30, 0, 1)
    lap_soft = np.clip(blur(lap, 1.0) * 1.5, 0, 1)

    # rust: rises from the floor, gathers at laps, streaks down from bolts
    rise = (1 - v) ** 2.2
    drips = np.clip(_drips(bolts, H, W, length=55, width=2.5) * 0.9, 0, 1)
    streaks = smoothstep(0.9, 2.0, streak_n) * (0.4 + 0.6 * smoothstep(0.0, 1.0, n2 + 0.5))
    base_rust = 0.5 + 0.28 * n1 + 0.55 * rise + 0.35 * lap_soft - 0.55 + rust_amount
    rust = np.clip(smoothstep(0.35, 0.7, base_rust) + 0.75 * drips + 0.45 * streaks, 0, 1)
    rust_col = mix(rgb(H, W, (0.20, 0.09, 0.045)), rgb(H, W, (0.55, 0.25, 0.09)), smoothstep(-1.2, 1.2, n2 + 0.6 * fine))

    if peel > 0:
        flakes = smoothstep(0.55, 0.62, 0.5 + 0.22 * spectral_noise(H, W, 1.0, seed + 7) + 0.15 * rise + peel - 0.25)
        bare = rgb(H, W, (0.42, 0.42, 0.40))
        col = mix(col, bare, flakes * 0.8)
        rust = np.clip(rust + flakes * 0.35, 0, 1)

    col = mix(col, rust_col, rust)
    col *= (1 - 0.45 * lap_soft - 0.4 * seam)[..., None]
    col = mix(col, rgb(H, W, (0.12, 0.10, 0.08)), bolt_disc * 0.8)

    dust = smoothstep(bottom_dust, 0.0, v) * 0.8
    col = mix(col, rgb(H, W, (0.47, 0.40, 0.31)), dust)

    metal = np.clip(paint_metal * (1 - rust) * (1 - dust), 0, 1)
    rough = np.clip(0.48 + 0.08 * n2 + 0.42 * rust + 0.3 * dust, 0.25, 1.0)
    height = 1.0 * corr + 0.18 * fine * rust - 0.6 * lap_soft + 1.4 * bolt_disc - 0.4 * seam
    return {
        'color': np.clip(col, 0, 1),
        'roughness': rough,
        'metallic': metal,
        'normal': normal_from_height(height, 2.6),
    }


def weathered_wood(size=512, seed=30):
    """1 m tile of sun-bleached, checked timber. Grain runs along u (x)."""
    H = W = size
    grain = spectral_noise(H, W, 1.0, seed, stretch=(14.0, 1.0))
    warp = spectral_noise(H, W, 1.7, seed + 1, stretch=(4.0, 1.0))
    rings = np.sin(grain * 5.0 + warp * 2.5)
    bleach = smoothstep(-0.6, 1.0, spectral_noise(H, W, 1.8, seed + 2))
    col = mix(rgb(H, W, (0.34, 0.26, 0.18)), rgb(H, W, (0.50, 0.46, 0.40)), bleach * 0.75)
    col *= (0.86 + 0.14 * rings)[..., None]
    checks = random_walk_lines(H, W, 10, 380, seed + 3, turn=0.04, heading=0.0)
    col *= (1 - 0.6 * checks)[..., None]
    knots = smoothstep(0.55, 0.75, periodic_blobs(H, W, 3, 6, 12, seed + 4, (0.6, 0.9)))
    col = mix(col, rgb(H, W, (0.16, 0.10, 0.06)), knots * 0.8)
    rough = np.clip(0.82 + 0.06 * rings - 0.05 * knots, 0.5, 1.0)
    height = 0.35 * rings + 0.15 * spectral_noise(H, W, 0.5, seed + 5, stretch=(6, 1)) - 1.6 * checks
    return {
        'color': np.clip(col, 0, 1),
        'roughness': rough,
        'normal': normal_from_height(height, 2.0),
    }


def dusty_glass(size=256, seed=40):
    """Emission map for storm-lit, dust-caked window glass (whole window = 1 tile)."""
    H = W = size
    v = (np.arange(H) / H)[:, None] * np.ones((1, W))
    n = spectral_noise(H, W, 1.6, seed)
    smudge = smoothstep(0.4, 1.4, spectral_noise(H, W, 1.3, seed + 1))
    streak = smoothstep(0.6, 1.8, spectral_noise(H, W, 1.2, seed + 2, stretch=(1.0, 6.0)))
    light = 0.75 + 0.12 * n - 0.35 * smudge - 0.2 * streak
    light *= 0.55 + 0.45 * smoothstep(0.0, 0.35, v)  # dust banked against the sill
    col = light[..., None] * np.array([1.0, 0.86, 0.64])
    return {'color': np.clip(col, 0, 1)}


def painted_metal(size=512, seed=60, paint=(0.24, 0.29, 0.20), base_metal=0.0):
    """Enamel-painted steel (1 m tile): wear scratches, chipped paint, small rust spots."""
    H = W = size
    n1 = spectral_noise(H, W, 1.6, seed)
    n2 = spectral_noise(H, W, 1.0, seed + 1)
    fine = spectral_noise(H, W, 0.4, seed + 2)
    col = rgb(H, W, paint) * (1 + 0.07 * n1[..., None] + 0.03 * fine[..., None])
    scratches = random_walk_lines(H, W, 45, 35, seed + 3, turn=0.05, width=0.4)
    chips = smoothstep(0.66, 0.72, 0.5 + 0.22 * n2 + 0.1 * fine)
    rust = smoothstep(0.7, 0.82, 0.5 + 0.24 * n2 + 0.12 * fine + 0.08 * n1)
    bare = rgb(H, W, (0.46, 0.45, 0.43))
    worn = np.clip(scratches * 0.7 + chips, 0, 1)
    col = mix(col, bare, worn)
    col = mix(col, rgb(H, W, (0.30, 0.13, 0.05)), rust * 0.9)
    metallic = np.clip(worn * (1 - rust) * 0.9 + base_metal, 0, 1)
    rough = np.clip(0.5 + 0.08 * n1 - 0.15 * scratches + 0.4 * rust, 0.2, 1.0)
    height = 0.05 * fine - 0.6 * scratches - 0.4 * chips + 0.3 * rust * fine
    return {'color': np.clip(col, 0, 1), 'roughness': rough, 'metallic': metallic,
            'normal': normal_from_height(height, 1.5)}


def polished_wood(size=512, seed=70, base=(0.30, 0.17, 0.09)):
    """Varnished hardwood for office furniture (1 m tile, grain along u)."""
    H = W = size
    grain = spectral_noise(H, W, 1.0, seed, stretch=(14.0, 1.0))
    warp = spectral_noise(H, W, 1.7, seed + 1, stretch=(4.0, 1.0))
    rings = np.sin(grain * 6.0 + warp * 3.0)
    tone = 1 + 0.08 * spectral_noise(H, W, 1.8, seed + 2)
    col = rgb(H, W, base) * ((0.78 + 0.22 * rings) * tone)[..., None]
    wear = smoothstep(0.8, 1.6, spectral_noise(H, W, 1.5, seed + 3))
    rough = np.clip(0.38 + 0.05 * rings + 0.25 * wear, 0.2, 1.0)
    return {'color': np.clip(col, 0, 1), 'roughness': rough,
            'normal': normal_from_height(0.25 * rings, 1.0)}


def planks(size=512, seed=80, count=5, base_shift=(1.0, 1.0, 1.0)):
    """Weathered board wall/floor: 1 m tile, `count` horizontal boards with dark gaps."""
    w = weathered_wood(size, seed)
    H = W = size
    rng = np.random.default_rng(seed + 9)
    band = np.zeros((H, W))
    gaps = np.zeros((H, W))
    ph = H // count
    for i in range(count):
        band[i * ph:(i + 1) * ph, :] = rng.uniform(-0.12, 0.12)
        gaps[i * ph:i * ph + 3, :] = 1
    gaps = np.clip(blur(gaps, 0.8) * 1.5, 0, 1)
    col = w['color'] * (1 + band)[..., None] * np.array(base_shift)
    col *= (1 - 0.7 * gaps)[..., None]
    nrm_h = -2.0 * gaps
    n2 = normal_from_height(nrm_h, 2.0)
    normal = np.clip(w['normal'] + (n2 - 0.5), 0, 1)
    return {'color': np.clip(col, 0, 1), 'roughness': np.clip(w['roughness'] + 0.1 * gaps, 0, 1), 'normal': normal}


def paper(w=256, h=192, seed=90):
    """Cream note paper with illegible pencil lines (the real text is shown in the game's reader)."""
    rng = np.random.default_rng(seed)
    col = rgb(h, w, (0.86, 0.82, 0.71)) * (1 + 0.03 * spectral_noise(h, w, 1.5, seed)[..., None])
    marks = np.zeros((h, w))
    for row in range(h - 28, 14, -18):
        x = 16
        end = rng.uniform(150, w - 16)
        while x < end:
            seg = int(rng.uniform(8, 26))
            for k in range(seg):
                yy = int(row + 2.5 * math.sin((x + k) * 0.9 + rng.uniform(0, 0.4)))
                marks[yy % h, int(x + k) % w] = 1
            x += seg + 6
    marks = np.clip(blur(marks, 0.6) * 2.5, 0, 1)
    col = mix(col, rgb(h, w, (0.16, 0.14, 0.13)), marks * 0.8)
    return {'color': np.clip(col, 0, 1)}


# ------------------------------------------------------------------ open-world ground
def periodic_voronoi_edges(h, w, count, seed):
    """Distance (px) to the nearest cell border of a tileable Voronoi pattern (F2 - F1)."""
    rng = np.random.default_rng(seed)
    pts = np.stack([rng.uniform(0, h, count), rng.uniform(0, w, count)], axis=1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d1 = np.full((h, w), 1e9, np.float32)
    d2 = np.full((h, w), 1e9, np.float32)
    for py, px in pts:
        dy = np.abs(yy - py)
        dy = np.minimum(dy, h - dy)
        dx = np.abs(xx - px)
        dx = np.minimum(dx, w - dx)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d))
        d1 = np.where(closer, d, d1)
    return d2 - d1


def salt_crust(size=1024, seed=100):
    """Cracked salt-flat crust, 1 tile = 6 m: polygon plates with raised rims and dusty cracks."""
    H = W = size
    big = periodic_voronoi_edges(H, W, 70, seed)
    small = periodic_voronoi_edges(H, W, 420, seed + 1)
    wob = spectral_noise(H, W, 1.4, seed + 2)
    crack = np.clip(1 - smoothstep(0.0, 2.6, big + 0.8 * wob), 0, 1)
    fine = np.clip(1 - smoothstep(0.0, 1.4, small + 0.6 * wob), 0, 1) * 0.55
    rim = np.exp(-np.clip(big - 2.0, 0, None) / 9.0)
    n1 = spectral_noise(H, W, 1.8, seed + 3)
    n2 = spectral_noise(H, W, 0.6, seed + 4)
    col = rgb(H, W, (0.80, 0.77, 0.70)) * (1 + 0.04 * n1[..., None] + 0.03 * n2[..., None])
    col = mix(col, rgb(H, W, (0.86, 0.84, 0.79)), np.clip(rim * 0.6, 0, 1))            # bright crusted rims
    col = mix(col, rgb(H, W, (0.62, 0.55, 0.45)), smoothstep(0.6, 1.8, n1) * 0.45)       # wind-blown dust
    col = mix(col, rgb(H, W, (0.38, 0.32, 0.25)), np.clip(crack + fine, 0, 1) * 0.85)    # cracks filled with dust
    height = 0.9 * rim - 1.8 * crack - 0.6 * fine + 0.08 * n2
    rough = np.clip(0.9 - 0.1 * rim + 0.05 * n2, 0.6, 1.0)
    return {'color': np.clip(col, 0, 1), 'roughness': rough, 'normal': normal_from_height(height, 2.4)}


def macro_variation(size=512, seed=110):
    """Very large-scale brightness/tint variation (1 tile = 300 m) to hide tiling."""
    n = spectral_noise(size, size, 2.2, seed)
    n2 = spectral_noise(size, size, 1.4, seed + 1)
    v = 0.5 + 0.22 * n + 0.08 * n2
    return {'color': np.clip(np.repeat(v[..., None], 3, axis=2), 0, 1)}


def gravel_strip(w=512, h=1024, seed=120, ruts=(), base=(0.52, 0.44, 0.33), edge=0.07):
    """Dirt-and-gravel strip. u runs ALONG the strip (tiles), v ACROSS it (0..1 = full width).
    ruts: centres of wheel ruts as fractions of the width."""
    H, W = h, w
    v = (np.arange(H) / H)[:, None] * np.ones((1, W))
    n1 = spectral_noise(H, W, 1.7, seed)
    n2 = spectral_noise(H, W, 1.1, seed + 1, stretch=(1.0, 3.0))
    col = rgb(H, W, base) * (1 + 0.08 * n1[..., None] + 0.05 * n2[..., None])
    rng = np.random.default_rng(seed + 2)
    stones = np.zeros((H, W))
    idx = rng.integers(0, H * W, int(H * W * 0.012))
    stones.flat[idx] = rng.uniform(0.4, 1.0, idx.size)
    stones = np.clip(blur(stones, 0.9) * 4.0, 0, 1)
    pale = np.zeros((H, W))
    idx = rng.integers(0, H * W, int(H * W * 0.006))
    pale.flat[idx] = 1
    pale = np.clip(blur(pale, 0.7) * 5.0, 0, 1)
    col = mix(col, rgb(H, W, (0.30, 0.26, 0.21)), stones * 0.6)
    col = mix(col, rgb(H, W, (0.74, 0.70, 0.62)), pale * 0.5)
    rut = np.zeros((H, W))
    for c in ruts:
        rut += np.exp(-((v - c) / 0.022) ** 2) * (0.75 + 0.25 * smoothstep(-1, 1, n2))
    rut = np.clip(rut, 0, 1)
    col = mix(col, rgb(H, W, (0.36, 0.30, 0.23)), rut * 0.55)
    edges = smoothstep(edge, 0.0, v) + smoothstep(1 - edge, 1.0, v)
    col = mix(col, rgb(H, W, (0.74, 0.70, 0.62)), np.clip(edges, 0, 1) * 0.6)
    height = 0.5 * stones + 0.3 * pale + 0.1 * n1 - 0.9 * rut
    rough = np.clip(0.92 - 0.25 * rut, 0.5, 1.0)
    return {'color': np.clip(col, 0, 1), 'roughness': rough, 'normal': normal_from_height(height, 2.0)}
