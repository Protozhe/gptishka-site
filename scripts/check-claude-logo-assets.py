from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = ROOT / "assets" / "img" / "services" / "claude-card.png"
HOVER = ROOT / "assets" / "img" / "services" / "claude-card-hover.png"

failures = []


def read_image(path: Path):
    if not path.exists():
        failures.append(f"{path.relative_to(ROOT)} is missing")
        return None
    return Image.open(path).convert("RGBA")


def is_primary_logo_pixel(pixel):
    r, g, b, a = pixel
    return a > 220 and r > 235 and g > 235 and b > 235


def is_hover_logo_pixel(pixel):
    r, g, b, a = pixel
    return a > 220 and r > 190 and g < 125 and b < 90


def get_bounds(image, predicate):
    min_x, min_y = image.width, image.height
    max_x, max_y = -1, -1
    count = 0

    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if not predicate(pixels[x, y]):
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            count += 1

    if count == 0:
        return None

    return {
        "min_x": min_x,
        "min_y": min_y,
        "max_x": max_x,
        "max_y": max_y,
        "width": max_x - min_x + 1,
        "height": max_y - min_y + 1,
        "center_x": (min_x + max_x) / 2,
        "center_y": (min_y + max_y) / 2,
        "count": count,
    }


def count_bright_edge_pixels(image):
    count = 0
    edge = 8
    pixels = image.load()

    for y in range(image.height):
        for x in range(image.width):
            if edge <= x < image.width - edge and edge <= y < image.height - edge:
                continue
            r, g, b, a = pixels[x, y]
            if a > 70 and r > 235 and g > 235 and b > 235:
                count += 1

    return count


def count_primary_warm_logo_pixels(image):
    count = 0
    pixels = image.load()

    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a <= 220:
                continue

            is_pure_white = r >= 252 and g >= 252 and b >= 252
            is_orange_background = r >= 220 and 55 <= g <= 125 and b <= 70

            if is_pure_white or is_orange_background:
                continue

            if r > 220 and g > 205 and b > 185:
                count += 1

    return count


primary = read_image(PRIMARY)
hover = read_image(HOVER)

if primary and hover:
    for label, image in (("primary", primary), ("hover", hover)):
        if image.size != (1254, 1254):
            failures.append(f"{label} Claude card must be 1254x1254, got {image.width}x{image.height}")

    bright_edge_pixels = count_bright_edge_pixels(primary)
    if bright_edge_pixels > 12:
        failures.append(f"primary Claude card has bright edge pixels: {bright_edge_pixels}")

    warm_logo_pixels = count_primary_warm_logo_pixels(primary)
    if warm_logo_pixels > 24:
        failures.append(f"primary Claude card has off-white logo fringe pixels: {warm_logo_pixels}")

    primary_logo = get_bounds(primary, is_primary_logo_pixel)
    hover_logo = get_bounds(hover, is_hover_logo_pixel)

    if primary_logo is None:
        failures.append("primary Claude logo bounds not found")
    if hover_logo is None:
        failures.append("hover Claude logo bounds not found")

    if primary_logo and hover_logo:
        checks = (
            ("logo width", abs(primary_logo["width"] - hover_logo["width"])),
            ("logo height", abs(primary_logo["height"] - hover_logo["height"])),
            ("logo center X", abs(primary_logo["center_x"] - hover_logo["center_x"])),
            ("logo center Y", abs(primary_logo["center_y"] - hover_logo["center_y"])),
        )

        for label, delta in checks:
            if delta > 2:
                failures.append(f"{label} mismatch between normal/hover: {delta:.2f}px")

if failures:
    print("Claude logo asset checks failed:")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)

print("Claude logo assets are clean and aligned.")
