from pathlib import Path
from collections import deque
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = ROOT / "assets" / "img" / "services" / "grok-card.png"

failures = []


def read_image(path: Path):
    if not path.exists():
        failures.append(f"{path.relative_to(ROOT)} is missing")
        return None
    return Image.open(path).convert("RGBA")


def count_bright_edge_pixels(image):
    count = 0
    edge = 8
    pixels = image.load()

    for y in range(image.height):
        for x in range(image.width):
            if edge <= x < image.width - edge and edge <= y < image.height - edge:
                continue
            r, g, b, a = pixels[x, y]
            if a > 45 and r > 235 and g > 235 and b > 235:
                count += 1

    return count


def count_light_border_rim_pixels(image):
    """Count visible light/gray pixels that are connected to the outer card rim.

    The Grok mark itself is intentionally white, so this only walks a connected
    component that starts at the image edge and ignores pure-white logo pixels.
    """

    pixels = image.load()
    width, height = image.size
    seen = set()
    queue = deque()

    def is_light_rim_pixel(x, y):
        r, g, b, a = pixels[x, y]
        if a <= 20:
            return False
        luminance = (r + g + b) / 3
        return 45 < luminance < 230

    for x in range(width):
        for y in (0, height - 1):
            if is_light_rim_pixel(x, y):
                queue.append((x, y))
                seen.add((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if (x, y) not in seen and is_light_rim_pixel(x, y):
                queue.append((x, y))
                seen.add((x, y))

    while queue:
        x, y = queue.popleft()
        for ny in range(max(0, y - 1), min(height, y + 2)):
            for nx in range(max(0, x - 1), min(width, x + 2)):
                if (nx, ny) in seen:
                    continue
                if is_light_rim_pixel(nx, ny):
                    seen.add((nx, ny))
                    queue.append((nx, ny))

    return len(seen)


primary = read_image(PRIMARY)
if primary:
    if primary.size != (1254, 1254):
        failures.append(f"primary Grok card must be 1254x1254, got {primary.width}x{primary.height}")

    bright_edge_pixels = count_bright_edge_pixels(primary)
    if bright_edge_pixels > 12:
        failures.append(f"primary Grok card has bright edge pixels: {bright_edge_pixels}")

    light_border_rim_pixels = count_light_border_rim_pixels(primary)
    if light_border_rim_pixels:
        failures.append(f"primary Grok card has visible light border rim pixels: {light_border_rim_pixels}")

if failures:
    print("Grok logo asset checks failed:")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)

print("Grok logo assets are clean.")
