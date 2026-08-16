#!/usr/bin/env python3
"""Génère le logo de l'extension : un SVG pour l'interface, des PNG pour le manifeste.

La géométrie est définie une seule fois, ici, et sert aux deux sorties — sinon le
SVG et les PNG divergent au premier ajustement.

Le dessin : un disque de cookie dont le bord bas-droit est tranché net, puis se
fragmente en points de plus en plus petits. Le plein dit « conservé », les points
disent « effacé ». La silhouette reste un disque aux trois quarts, donc lisible à
16 px, où les pépites ne comptent plus.

Usage : python3 tools/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

# --- Géométrie, exprimée dans un carré de 512 ---

CANVAS = 512
CENTER = (240, 240)
RADIUS = 175

# Le biscuit est conservé du côté x + y < CUT ; au-delà, il se fragmente.
CUT = 620

# Morsures creusées le long de la coupe : sans elles, le bord est une droite nette
# et le logo se lit comme une part de tarte au lieu d'un biscuit qui s'effrite.
BITES = [
    (400, 220, 40),
    (350, 270, 46),
    (300, 320, 50),
    (250, 370, 46),
    (200, 420, 40),
]

COOKIE = "#d18b2f"
CHIP = "#7a4a14"

# Pépites : (x, y, rayon). Toutes du côté conservé.
CHIPS = [
    (180, 170, 27),
    (135, 265, 21),
    (215, 285, 22),
    (258, 150, 16),
]

# Fragments : (x, y, rayon), du plus gros au plus petit en s'éloignant.
CRUMBS = [
    (365, 300, 22),
    (330, 355, 20),
    (395, 250, 16),
    (300, 405, 15),
    (415, 330, 13),
    (360, 400, 11),
    (440, 285, 9),
    (330, 450, 8),
    (430, 385, 7),
    (395, 445, 6),
    (465, 340, 5),
    (455, 430, 4),
    (360, 480, 4),
]

SIZES = [16, 32, 48, 128]
SUPERSAMPLE = 4

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"


def cut_polygon():
    """Le demi-plan conservé, en polygone assez large pour couvrir le disque."""
    return [(-CANVAS, -CANVAS), (CUT + CANVAS, -CANVAS), (-CANVAS, CUT + CANVAS)]


def draw(scale: float) -> Image.Image:
    size = int(CANVAS * scale)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pen = ImageDraw.Draw(body)

    def box(cx, cy, r):
        return [
            ((cx - r) * scale, (cy - r) * scale),
            ((cx + r) * scale, (cy + r) * scale),
        ]

    pen.ellipse(box(CENTER[0], CENTER[1], RADIUS), fill=COOKIE)

    # On retire le quartier bas-droit en ne gardant que le demi-plan x + y < CUT.
    keep = Image.new("L", (size, size), 0)
    keep_pen = ImageDraw.Draw(keep)
    keep_pen.polygon([(x * scale, y * scale) for x, y in cut_polygon()], fill=255)
    for cx, cy, r in BITES:
        keep_pen.ellipse(box(cx, cy, r), fill=0)
    body.putalpha(Image.composite(body.getchannel("A"), Image.new("L", (size, size), 0), keep))

    image.alpha_composite(body)

    crumbs = ImageDraw.Draw(image)
    for cx, cy, r in CRUMBS:
        crumbs.ellipse(box(cx, cy, r), fill=COOKIE)

    chips = ImageDraw.Draw(image)
    for cx, cy, r in CHIPS:
        chips.ellipse(box(cx, cy, r), fill=CHIP)

    return image


def write_svg() -> None:
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" '
        f'width="{CANVAS}" height="{CANVAS}" role="img" aria-label="Cookies Manager">',
        "  <defs>",
        '    <mask id="keep">',
        f'      <polygon points="{" ".join(f"{x},{y}" for x, y in cut_polygon())}" fill="white" />',
    ]
    for cx, cy, r in BITES:
        parts.append(f'      <circle cx="{cx}" cy="{cy}" r="{r}" fill="black" />')
    parts += [
        "    </mask>",
        "  </defs>",
        f'  <circle cx="{CENTER[0]}" cy="{CENTER[1]}" r="{RADIUS}" fill="{COOKIE}" mask="url(#keep)" />',
    ]
    for cx, cy, r in CRUMBS:
        parts.append(f'  <circle cx="{cx}" cy="{cy}" r="{r}" fill="{COOKIE}" />')
    for cx, cy, r in CHIPS:
        parts.append(f'  <circle cx="{cx}" cy="{cy}" r="{r}" fill="{CHIP}" />')
    parts.append("</svg>")

    (ICONS / "logo.svg").write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_pngs() -> None:
    master = draw(SUPERSAMPLE)
    for size in SIZES:
        master.resize((size, size), Image.LANCZOS).save(ICONS / f"icon-{size}.png")


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    write_svg()
    write_pngs()
    produced = ", ".join(["logo.svg"] + [f"icon-{s}.png" for s in SIZES])
    print(f"écrit dans {ICONS.relative_to(ROOT)} : {produced}")


if __name__ == "__main__":
    main()
