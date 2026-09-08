"""逆向还原原始亮度（红+蓝通道近似）→ 重新映射到目标色。同时生成托盘图标。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
SPEC_DIR = ROOT / ".spec"
ORIGINAL = BUILD / "app-icon.png"

# 原始换色使用的紫色 (128, 0, 200)
SRC_PURPLE = (128, 0, 200)

# 目标色
COLORS = {
    "code": (230, 215, 255),  # 薰衣草紫
    "work": (255, 255, 255),  # 纯白
}

# 托盘图标尺寸
TRAY_VARIANTS = [
    ("tray-iconTemplate.png", 16),
    ("tray-iconTemplate@2x.png", 32),
    ("tray-icon-blue.png", 16),
    ("tray-icon-blue@1.25x.png", 20),
    ("tray-icon-blue@1.5x.png", 24),
    ("tray-icon-blue@2x.png", 32),
]


def reverse_and_remap(img: Image.Image, target_rgb: tuple[int, int, int]) -> Image.Image:
    """逆向还原原始亮度（红+蓝通道近似），再映射到新目标色。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    tr, tg, tb = target_rgb
    sr, sg, sb = SRC_PURPLE
    eps = 1e-6

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # 逆向还原原始亮度（用红+蓝通道近似，跳过 g=0 的通道）
            lum = (r / (sr + eps) * 0.299 + b / (sb + eps) * 0.114) / 0.413
            lum = max(0.0, min(1.0, lum))
            # 映射到新目标色
            nr = int(tr * lum)
            ng = int(tg * lum)
            nb = int(tb * lum)
            px[x, y] = (nr, ng, nb, a)

    return img


def main():
    src = Image.open(ORIGINAL)
    for name, color in COLORS.items():
        out = reverse_and_remap(src, color)
        dest = SPEC_DIR / name / "app-icon.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, "PNG")
        # 验证关键像素
        vpx = out.load()
        print(f"{name}: {dest}  color={color}")
        print(f"  verify (100,100)={vpx[100,100]}  (500,500)={vpx[500,500]}")

        # 生成托盘图标（从 app-icon 缩放）
        build_dir = SPEC_DIR / name / "build"
        build_dir.mkdir(parents=True, exist_ok=True)
        for tray_name, tray_size in TRAY_VARIANTS:
            tray_img = out.resize((tray_size, tray_size), Image.LANCZOS)
            tray_dest = build_dir / tray_name
            tray_img.save(tray_dest, "PNG")
            print(f"  tray: {tray_dest} ({tray_size}x{tray_size})")


if __name__ == "__main__":
    main()
