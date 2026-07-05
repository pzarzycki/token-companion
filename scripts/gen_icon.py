"""
Generate resources/icon.icns + icon.png for Token Companion.
Pure Python (stdlib only) — renders a 1024x1024 RGBA canvas, then packs
a full multi-resolution ICNS.

macOS design conventions applied:
  * Squircle (superellipse) silhouette, NOT a plain rounded rect.
  * Icon art lives inside the ~824px "safe area" of the 1024 grid — the
    squircle is inset with transparent margin so macOS spacing looks right.
  * Vertical gradient fill for depth + a soft top highlight and inner shade.
  * Subpixel-ish antialiasing via supersampled coverage on the squircle edge.

Motif: a circular token-meter gauge (green→amber→red arc) with a needle.
"""

import struct
import zlib
import math
import os

SIZE = 1024

# ── canvas helpers ────────────────────────────────────────────────────────────

def make_canvas(w, h):
    return [[(0, 0, 0, 0)] * w for _ in range(h)]

def ensure4(c):
    return c if len(c) == 4 else c + (255,)

def over(bg, fg):
    """Straight alpha 'source-over' compositing. bg/fg are RGBA 0-255."""
    fa = fg[3] / 255
    ba = bg[3] / 255
    oa = fa + ba * (1 - fa)
    if oa == 0:
        return (0, 0, 0, 0)
    out = tuple(
        int((fg[i] * fa + bg[i] * ba * (1 - fa)) / oa) for i in range(3)
    )
    return out + (int(oa * 255),)

def put(canvas, x, y, rgba):
    if 0 <= y < len(canvas) and 0 <= x < len(canvas[0]):
        canvas[y][x] = over(canvas[y][x], ensure4(rgba))

def lerp(a, b, t):
    return a + (b - a) * t

def lerp_rgb(c0, c1, t):
    return tuple(int(lerp(c0[i], c1[i], t)) for i in range(3))

# ── superellipse (squircle) coverage ───────────────────────────────────────────

def squircle_coverage(px, py, cx, cy, half, n, ss=3):
    """
    Antialiased coverage [0,1] of pixel (px,py) inside a superellipse centered
    at (cx,cy) with half-size `half` and exponent `n`. Supersampled ss*ss.
    |x/half|^n + |y/half|^n <= 1
    """
    hit = 0
    total = ss * ss
    for sy in range(ss):
        for sx in range(ss):
            fx = px + (sx + 0.5) / ss - 0.5
            fy = py + (sy + 0.5) / ss - 0.5
            nx = abs(fx - cx) / half
            ny = abs(fy - cy) / half
            if nx ** n + ny ** n <= 1.0:
                hit += 1
    return hit / total

# ── primitive drawing (composited) ─────────────────────────────────────────────

def draw_circle(canvas, cx, cy, r, color, ss=3):
    color = ensure4(color)
    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r - 2), int(cx + r + 3)):
            if not (0 <= y < len(canvas) and 0 <= x < len(canvas[0])):
                continue
            hit = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x + (sx + 0.5) / ss - 0.5
                    fy = y + (sy + 0.5) / ss - 0.5
                    if (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r:
                        hit += 1
            cov = hit / (ss * ss)
            if cov > 0:
                put(canvas, x, y, (color[0], color[1], color[2], int(color[3] * cov)))

def draw_thick_line(canvas, pts, thickness, color, ss=2):
    color = ensure4(color)
    r = thickness / 2
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        length = math.hypot(x1 - x0, y1 - y0)
        if length == 0:
            continue
        dx, dy = (x1 - x0) / length, (y1 - y0) / length
        bx0 = int(min(x0, x1) - r - 2); bx1 = int(max(x0, x1) + r + 3)
        by0 = int(min(y0, y1) - r - 2); by1 = int(max(y0, y1) + r + 3)
        for py in range(max(0, by0), min(len(canvas), by1)):
            for px in range(max(0, bx0), min(len(canvas[0]), bx1)):
                hit = 0
                for sy in range(ss):
                    for sx in range(ss):
                        fx = px + (sx + 0.5) / ss - 0.5
                        fy = py + (sy + 0.5) / ss - 0.5
                        t = max(0, min(length, (fx - x0) * dx + (fy - y0) * dy))
                        cxp = x0 + t * dx; cyp = y0 + t * dy
                        if math.hypot(fx - cxp, fy - cyp) <= r:
                            hit += 1
                cov = hit / (ss * ss)
                if cov > 0:
                    put(canvas, px, py, (color[0], color[1], color[2], int(color[3] * cov)))

def draw_glow(canvas, cx, cy, outer_r, inner_r, core, glow):
    core = ensure4(core); glow = ensure4(glow)
    for y in range(int(cy - outer_r - 2), int(cy + outer_r + 3)):
        for x in range(int(cx - outer_r - 2), int(cx + outer_r + 3)):
            if not (0 <= y < len(canvas) and 0 <= x < len(canvas[0])):
                continue
            d = math.hypot(x - cx, y - cy)
            if d > outer_r:
                continue
            if d <= inner_r:
                put(canvas, x, y, core)
            else:
                a = 1.0 - (d - inner_r) / (outer_r - inner_r)
                a = a ** 1.8
                put(canvas, x, y, (glow[0], glow[1], glow[2], int(glow[3] * a)))

def _ang_in(a, start, end):
    """Is angle a (radians, any range) within the CCW sweep start→end?"""
    twopi = 2 * math.pi
    a = (a - start) % twopi
    span = (end - start) % twopi
    return a <= span

def draw_arc(canvas, cx, cy, radius, width, start, sweep, color_fn, ss=3, cap=True):
    """
    Antialiased annular arc. radius = centerline radius, width = stroke width.
    start in radians (math convention, 0=east, CCW positive). sweep is the
    signed angular length in radians: positive = CCW, negative = CW.
    color_fn(frac)->rgba where frac is 0..1 from start toward the sweep end.
    """
    r_out = radius + width / 2
    r_in = radius - width / 2
    aspan = abs(sweep)
    sign = 1.0 if sweep >= 0 else -1.0
    end = start + sweep
    y0 = int(cy - r_out - 2); y1 = int(cy + r_out + 3)
    x0 = int(cx - r_out - 2); x1 = int(cx + r_out + 3)
    for y in range(max(0, y0), min(len(canvas), y1)):
        for x in range(max(0, x0), min(len(canvas[0]), x1)):
            hit = 0
            acc_frac = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x + (sx + 0.5) / ss - 0.5
                    fy = y + (sy + 0.5) / ss - 0.5
                    d = math.hypot(fx - cx, fy - cy)
                    if d < r_in or d > r_out:
                        continue
                    ang = math.atan2(-(fy - cy), fx - cx)  # y flipped: screen→math
                    # signed offset from start in the sweep direction, 0..2pi
                    rel = ((ang - start) * sign) % (2 * math.pi)
                    if rel <= aspan:
                        hit += 1
                        acc_frac += rel / aspan
                    elif cap:
                        for capang, capf in ((start, 0.0), (end, 1.0)):
                            capx = cx + radius * math.cos(capang)
                            capy = cy - radius * math.sin(capang)
                            if math.hypot(fx - capx, fy - capy) <= width / 2:
                                hit += 1
                                acc_frac += capf
                                break
            if hit:
                frac = acc_frac / hit
                col = ensure4(color_fn(frac))
                cov = hit / (ss * ss)
                put(canvas, x, y, (col[0], col[1], col[2], int(col[3] * cov)))

# ── render ──────────────────────────────────────────────────────────────────

def render():
    S = SIZE
    canvas = make_canvas(S, S)

    # macOS safe area: art inset ~10% each side → squircle spans ~80% of grid.
    inset = int(S * 0.10)
    half = (S - 2 * inset) / 2
    cx = cy = S / 2
    N = 5.0  # superellipse exponent ~ Apple's continuous-corner squircle

    # Gradient palette (top → bottom): deep indigo-navy, subtle.
    TOP = (30, 27, 58)     # #1E1B3A  indigo-tinted top
    BOT = (13, 15, 26)     # #0D0F1A  near-black bottom
    top_y = cy - half
    bot_y = cy + half

    # Fill the squircle with vertical gradient + edge AA.
    y0 = int(cy - half - 2); y1 = int(cy + half + 3)
    x0 = int(cx - half - 2); x1 = int(cx + half + 3)
    for y in range(max(0, y0), min(S, y1)):
        t = (y - top_y) / (bot_y - top_y)
        t = max(0.0, min(1.0, t))
        base = lerp_rgb(TOP, BOT, t)
        for x in range(max(0, x0), min(S, x1)):
            cov = squircle_coverage(x, y, cx, cy, half, N)
            if cov > 0:
                put(canvas, x, y, (base[0], base[1], base[2], int(255 * cov)))

    # Top sheen: a soft light band across the upper third for a glassy feel.
    sheen_top = cy - half
    sheen_bot = cy - half * 0.15
    for y in range(int(sheen_top), int(sheen_bot)):
        ty = (y - sheen_top) / (sheen_bot - sheen_top)
        a = (1 - ty) ** 2 * 0.10
        for x in range(int(cx - half), int(cx + half)):
            cov = squircle_coverage(x, y, cx, cy, half, N)
            if cov > 0:
                put(canvas, x, y, (255, 255, 255, int(255 * a * cov)))

    # Inner bottom shade for depth.
    shade_top = cy + half * 0.2
    shade_bot = cy + half
    for y in range(int(shade_top), int(shade_bot)):
        ty = (y - shade_top) / (shade_bot - shade_top)
        a = ty ** 2 * 0.18
        for x in range(int(cx - half), int(cx + half)):
            cov = squircle_coverage(x, y, cx, cy, half, N)
            if cov > 0:
                put(canvas, x, y, (0, 0, 0, int(255 * a * cov)))

    # ── token-meter gauge ─────────────────────────────────────────────────────
    # A 270° dial: open at the bottom, sweeping from lower-left CCW around to
    # lower-right. Track (unfilled) is faint; the "spend" fill is a warm
    # green→amber→red gradient. A needle points to the current reading.
    gx, gy = cx, cy - half * 0.04        # gauge center, nudged up a touch
    radius = half * 0.62
    stroke = half * 0.20

    # Math convention (0=east, CCW+). Open at the BOTTOM, arcing over the top:
    # start lower-left (225°), sweep CW (negative) 270° → ends lower-right (-45°).
    start = math.radians(225)            # lower-left
    total_deg = 270
    sweep = math.radians(-total_deg)     # clockwise, over the top

    def frac_ang(g):                     # gauge fraction 0..1 → absolute angle
        return start + math.radians(-total_deg * g)

    # Track: faint full sweep.
    draw_arc(canvas, gx, gy, radius, stroke, start, sweep,
             lambda f: (120, 130, 165, 55))

    # Fill: from empty end to the reading (≈72% → clearly "high spend").
    reading = 0.72
    fill_sweep = math.radians(-total_deg * reading)
    fill_end = frac_ang(reading)

    def spend_color(f):
        # f 0..1 across the *fill* portion → map onto the gauge fraction.
        g = f * reading
        if g < 0.5:
            c = lerp_rgb((52, 211, 153), (250, 204, 21), g / 0.5)   # green→amber
        else:
            c = lerp_rgb((250, 204, 21), (239, 68, 68), (g - 0.5) / 0.5)  # amber→red
        return c + (255,)

    draw_arc(canvas, gx, gy, radius, stroke, start, fill_sweep, spend_color)

    # Tick marks around the dial.
    for i in range(0, total_deg + 1, total_deg // 6):
        a = start + math.radians(-i)
        r0 = radius + stroke * 0.62
        r1 = radius + stroke * 0.95
        tx0 = gx + r0 * math.cos(a); ty0 = gy - r0 * math.sin(a)
        tx1 = gx + r1 * math.cos(a); ty1 = gy - r1 * math.sin(a)
        draw_thick_line(canvas, [(tx0, ty0), (tx1, ty1)], S * 0.010,
                        (150, 160, 195, 150))

    # Needle pointing at the reading.
    needle_a = fill_end
    nlen = radius - stroke * 0.15
    nx = gx + nlen * math.cos(needle_a)
    ny = gy - nlen * math.sin(needle_a)
    # back tail (short, opposite side)
    tail = radius * 0.22
    bx = gx - tail * math.cos(needle_a)
    by = gy + tail * math.sin(needle_a)
    draw_thick_line(canvas, [(bx, by), (nx, ny)], S * 0.024, (236, 240, 255))

    # Center hub.
    draw_circle(canvas, gx, gy, half * 0.11, (30, 34, 58))
    draw_circle(canvas, gx, gy, half * 0.075, (226, 232, 255))

    # Glowing tip where the needle meets the fill (the "live" point).
    draw_glow(canvas, nx, ny, half * 0.14, half * 0.05,
              (253, 186, 116), (234, 88, 12))
    draw_circle(canvas, nx, ny, half * 0.045, (255, 237, 213))

    return canvas

# ── PNG encoder ──────────────────────────────────────────────────────────────

def encode_png(canvas):
    w = len(canvas[0]); h = len(canvas)

    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", c)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # RGBA
    rows = [b'\x00' + bytes(c for px in row for c in ensure4(px)) for row in canvas]
    comp = zlib.compress(b''.join(rows), 9)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', comp) + chunk(b'IEND', b''))

# ── downscale (box filter) for smaller ICNS entries ────────────────────────────

def downscale(canvas, target):
    src = len(canvas)
    if src == target:
        return canvas
    ratio = src / target
    out = make_canvas(target, target)
    for ty in range(target):
        sy0 = int(ty * ratio); sy1 = max(sy0 + 1, int((ty + 1) * ratio))
        for tx in range(target):
            sx0 = int(tx * ratio); sx1 = max(sx0 + 1, int((tx + 1) * ratio))
            r = g = b = a = 0; n = 0
            for yy in range(sy0, min(sy1, src)):
                for xx in range(sx0, min(sx1, src)):
                    px = ensure4(canvas[yy][xx])
                    af = px[3] / 255
                    r += px[0] * af; g += px[1] * af; b += px[2] * af
                    a += px[3]; n += 1
            if n == 0:
                out[ty][tx] = (0, 0, 0, 0)
            else:
                aa = a / n
                if aa == 0:
                    out[ty][tx] = (0, 0, 0, 0)
                else:
                    wsum = sum(ensure4(canvas[yy][xx])[3] / 255
                               for yy in range(sy0, min(sy1, src))
                               for xx in range(sx0, min(sx1, src))) or 1
                    out[ty][tx] = (int(r / wsum), int(g / wsum), int(b / wsum), int(aa))
    return out

# ── ICNS packer (multi-resolution) ─────────────────────────────────────────────

def make_icns(canvas_1024, out_path):
    # OSType → pixel size. Modern PNG-based ICNS types.
    types = [
        (b'ic07', 128),
        (b'ic08', 256),
        (b'ic09', 512),
        (b'ic10', 1024),
        (b'ic11', 32),
        (b'ic12', 64),
        (b'ic13', 256),
        (b'ic14', 512),
    ]
    chunks = b''
    cache = {1024: canvas_1024}
    for ostype, size in types:
        if size not in cache:
            cache[size] = downscale(canvas_1024, size)
        png = encode_png(cache[size])
        chunks += ostype + struct.pack(">I", len(png) + 8) + png
    total = 8 + len(chunks)
    with open(out_path, 'wb') as f:
        f.write(b'icns' + struct.pack(">I", total) + chunks)
    print(f"Wrote {out_path}  ({total} bytes, {len(types)} sizes)")

# ── main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Rendering icon …")
    canvas = render()
    print("Encoding PNG …")
    png_data = encode_png(canvas)

    resources = os.path.join(os.path.dirname(__file__), '..', 'resources')
    os.makedirs(resources, exist_ok=True)

    png_path = os.path.join(resources, 'icon.png')
    with open(png_path, 'wb') as f:
        f.write(png_data)
    print(f"Wrote {png_path}")

    make_icns(canvas, os.path.join(resources, 'icon.icns'))
    print("Done.")
