"""
Draws the Toy cover (4:3, 1200x900) as pixel art and writes it to public/cover.png, so the build
copies it into dist/ and the upload page can offer it as the cover.

    python3 scripts/cover.py        (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LW, LH, SCALE = 300, 225, 4
FONT = ImageFont.truetype(str(ROOT / 'src/assets/fusion-pixel-12px.woff2'), 12)

BG, INK, WHITE, DIM = '#12121c', '#14141f', '#f4f4f4', '#9a9ab4'
PINK, BLUE, YELLOW, GREEN, RED, PURPLE = '#fb7299', '#00aeec', '#ffd24a', '#5fe08a', '#ff5a6e', '#b48cff'

img = Image.new('RGB', (LW, LH), BG)
d = ImageDraw.Draw(img)
d.fontmode = '1'  # no anti-aliasing: keep the pixels square


def text(s, x, y, color, scale=1, shadow='#000000', anchor='l'):
    """Pixel text; scaled text is drawn small and enlarged with nearest-neighbour."""
    w = int(d.textlength(s, font=FONT))
    tile = Image.new('RGBA', (w + 1, 14), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.fontmode = '1'
    if shadow:
        td.text((1, 1), s, font=FONT, fill=shadow)
    td.text((0, 0), s, font=FONT, fill=color)
    if scale != 1:
        tile = tile.resize((tile.width * scale, tile.height * scale), Image.NEAREST)
    if anchor == 'c':
        x -= (w * scale) // 2
    elif anchor == 'r':
        x -= w * scale
    img.paste(tile, (int(x), int(y)), tile)


def rect(x, y, w, h, color):
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


# Lanes.
for i in range(0, LH // 14 + 1, 2):
    rect(0, i * 14, LW, 14, '#151523')

# Background danmaku, dimmed.
far = [
    ('233333', 8, 4, '#3a3a55'), ('前方高能', 196, 6, '#4a4030'), ('爷青回', 120, 18, '#3a3a55'), ('下次一定', 236, 32, '#33455a'),
    ('awsl', 6, 100, '#3a3a55'), ('完结撒花', 240, 104, '#4a3040'), ('火钳刘明', 2, 34, '#4a3040'),
]
for s, x, y, c in far:
    text(s, x, y, c, shadow=None)

# Title.
text('百万弹幕', LW // 2, 30, PINK, scale=4, shadow='#3a1030', anchor='c')
text('从 0 粉到百万UP主', LW // 2, 88, WHITE, scale=2, anchor='c')

# The fight: danmaku closing in on the hero from both sides.
near = [
    ('哈哈哈哈', 214, 130, WHITE), ('就这？', 250, 144, YELLOW), ('蚌埠住了', 196, 172, WHITE), ('草', 232, 158, GREEN),
    ('取关了', 10, 186, '#ff8a5c'), ('芜湖起飞', 204, 186, BLUE), ('？？？', 20, 130, WHITE),
]
for s, x, y, c in near:
    text(s, x, y, c)
# A converted (ally) danmaku charging back, and a pinned block.
text('太强了', 40, 158, '#7dffb0')
rect(40, 170, 36, 1, '#7dffb0')
rect(79, 161, 2, 6, '#7dffb0')
rect(168, 157, 26, 14, INK)
rect(169, 158, 24, 12, '#ffe14a')
text('置顶', 169, 158, INK, shadow=None)

# Hero (same grid as src/engine/sprites.ts).
HERO = [
    '..kkkkkk..', '.khhhhhhk.', 'khhhhhhhhk', 'khsssssshk', 'cksesseskc', 'cksssssskc',
    '.kksssskk.', '.kpwppppk.', 'kspwwpppsk', '.kpwppppk.', '.kbbkkbbk.', '.kkk..kkk.',
]
PAL = {'k': INK, 'h': '#5b4a8a', 's': '#ffd9b3', 'e': INK, 'c': BLUE, 'p': PINK, 'w': '#ffffff', 'b': '#3a4a7a'}
hs, hx, hy = 4, LW // 2 - 20, 126
for r, row in enumerate(HERO):
    for c, ch in enumerate(row):
        if ch in PAL:
            rect(hx + c * hs, hy + r * hs, hs, hs, PAL[ch])

# Shots, experience gems, an enemy bullet, floating gains.
for x, y in [(176, 138), (192, 134), (116, 150), (100, 146)]:
    rect(x, y, 4, 4, PINK)
    rect(x + 1, y + 1, 2, 2, WHITE)
for x, y in [(96, 176), (204, 150), (224, 176), (60, 140)]:
    rect(x + 1, y - 1, 2, 6, '#1f7a44')
    rect(x - 1, y + 1, 6, 2, '#1f7a44')
    rect(x, y, 4, 4, GREEN)
    rect(x + 1, y, 1, 1, WHITE)
for x, y in [(126, 190), (186, 196)]:
    rect(x, y - 1, 5, 7, INK)
    rect(x - 1, y, 7, 5, INK)
    rect(x + 1, y, 3, 5, RED)
    rect(x, y + 1, 5, 3, RED)
    rect(x + 2, y + 2, 1, 1, YELLOW)
text('+128', 196, 118, YELLOW)
text('+1', 92, 124, PINK)
text('x64', 112, 112, YELLOW, scale=1)
text('擦弹', 138, 177, '#9fe8ff')

# Footer.
rect(0, LH - 19, LW, 19, '#0b0b12')
rect(0, LH - 19, LW, 1, '#3d3d5c')
text('像素肉鸽 · 武器合成 · 科技树 · 20 波 4 个 Boss', LW // 2, LH - 17, DIM, shadow=None, anchor='c')
rect(0, LH - 2, LW * 2 // 3, 2, PINK)
rect(LW * 2 // 3 - 1, LH - 4, 3, 4, WHITE)

out = ROOT / 'public' / 'cover.png'
out.parent.mkdir(exist_ok=True)
img.resize((LW * SCALE, LH * SCALE), Image.NEAREST).save(out, optimize=True)
print(f'{out.relative_to(ROOT)}  {LW * SCALE}x{LH * SCALE}  {out.stat().st_size // 1024} KB')
