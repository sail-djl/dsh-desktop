# Icon 更新指南

## 多 Spec 图标架构

每个 Spec 变体有独立的品牌图标，存放在 `.spec/{name}/` 目录下：

```
.spec/
├── code/
│   ├── configspec.yaml
│   ├── app-icon.png          # Code 版图标（薰衣草紫）
│   └── build/                # Code 版托盘图标
│       ├── tray-icon.png
│       ├── tray-icon@1.25x.png
│       ├── tray-icon@1.5x.png
│       └── tray-icon@2x.png
└── work/
    ├── configspec.yaml
    ├── app-icon.png          # Work 版图标（纯白）
    └── build/                # Work 版托盘图标
        ├── tray-icon.png
        └── ...
```

构建时 `spec-build.ts` 自动将 `.spec/{name}/app-icon.png` 和 `.spec/{name}/build/` 复制到项目根 `build/` 目录。

## 当前品牌色

| Spec | 主色 | RGB | 用途 |
|:--|:--|:--|:--|
| Code | 薰衣草紫 | `(230, 215, 255)` | app-icon + tray icons |
| Work | 纯白 | `(255, 255, 255)` | app-icon + tray icons |

## 图标文件清单

| 文件 | 用途 | 尺寸 | 生成方式 |
|:--|:--|:--|:--|
| `.spec/{name}/app-icon.png` | Windows exe/installer 图标 | 1024x1024 | 手动制作 |
| `.spec/{name}/build/tray-icon.png` | 托盘图标 1x | 16x16 | 脚本生成 |
| `.spec/{name}/build/tray-icon@1.25x.png` | 托盘图标 1.25x | 20x20 | 脚本生成 |
| `.spec/{name}/build/tray-icon@1.5x.png` | 托盘图标 1.5x | 24x24 | 脚本生成 |
| `.spec/{name}/build/tray-icon@2x.png` | 托盘图标 2x | 32x32 | 脚本生成 |

## 托盘图标生成

`gen-spec-icons.py` 从 app-icon.png 缩放生成托盘图标：

```bash
# 为所有 spec 生成托盘图标
py scripts/gen-spec-icons.py

# 为指定 spec 生成
py scripts/gen-spec-icons.py code
py scripts/gen-spec-icons.py work
```

### 生成逻辑

1. 读取 `.spec/{name}/app-icon.png`
2. 缩放到 16/20/24/32px
3. 保存到 `.spec/{name}/build/tray-icon*.png`

## 换色方法：亮度映射法

原版 DSH 图标为**白色主体 + 透明背景**，HSV 色相替换无效，需使用亮度映射法。

### 原理

```
原像素 RGB → 计算亮度 lum (0~1)
目标色 RGB × lum → 新像素 RGB
新像素 A = 原 A（保持透明度）
```

- 白色像素 (lum=1.0) → 纯目标色
- 黑色像素 (lum=0.0) → 保持黑色
- 灰色像素 → 按亮度比例混合

### Python 脚本

```python
from PIL import Image

target_color = (230, 215, 255)  # 薰衣草紫（Code 版）

img = Image.open('.spec/code/app-icon.png').convert('RGBA')
pixels = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if a == 0:
            continue
        lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
        nr = int(target_color[0] * lum)
        ng = int(target_color[1] * lum)
        nb = int(target_color[2] * lum)
        pixels[x, y] = (nr, ng, nb, a)

img.save('.spec/code/app-icon.png')
```

### 自定义颜色

| 颜色 | RGB | 用于 |
|:--|:--|:--|
| 薰衣草紫 | `(230, 215, 255)` | Code 版 |
| 纯白 | `(255, 255, 255)` | Work 版 |
| 深紫 | `(128, 0, 200)` | 备选 |
| 蓝色 | `(0, 100, 255)` | 备选 |

## 换色后流程

1. 替换 `.spec/{name}/app-icon.png`
2. 运行 `py scripts/gen-spec-icons.py {name}` 重新生成托盘图标
3. `node scripts/spec-build.ts {name}` 重新编译
4. `node scripts/spec-dist.ts {name}` 重新打包
5. 检查 `dist/Baizhou-DSH-{Name}-*.exe` 的图标是否正确

## configspec.yaml 品牌配置

```yaml
brand:
  appIcon: "app-icon.png"       # spec 目录下的图标文件名
  trayIcons: "build"            # 托盘图标目录（构建时复制到 build/）
```

修改 `appIcon` 可指向不同的图标文件，修改 `trayIcons` 可指向不同的托盘图标目录。
