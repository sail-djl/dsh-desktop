# macOS 打包说明

## 产物

| 产物 | 说明 |
|:--|:--|
| Universal DMG | x64 + arm64 通用二进制 |

## 打包命令

```bash
# 完整发布流程
yarn dist:mac

# 冒烟测试打包
yarn dist:mac-smoke
```

## 打包特性

- **Universal 二进制**：通过 `mac-universal.ts` 合并 x64 和 arm64 两个 slice
- **Hardened Runtime**：启用硬化运行时
- **公证**：`notarize: true`，需要 Apple 公证
- **代码签名**：忽略 `.pak`、`.dat`、`.wasm` 文件签名
- **不合并 ASAR**：`mergeASARs: false`

## Universal 架构文件

以下依赖需要同时包含 x64 和 arm64 版本：

```
node-pty/prebuilds/darwin-*/
node-addon-require-builtin-darwin-*/
@vscode/ripgrep-darwin-*/
@img/sharp-darwin-*/
@img/sharp-libvips-darwin-*/
@koromix/koffi-darwin-*/
```

## 平台特定功能

- **Dock 图标**：通过 `electron-platform.ts` macOS adapter 管理
- **原生材质窗口**：macOS 使用系统原生材质
- **Tray 图标**：Template 图标（自动适配深色/浅色模式）

## 验证

```bash
# 完整验证
corepack yarn check:mac-package

# 单项验证
yarn verify:closure
yarn verify:licenses
```

## 注意事项

- 开发者需要 Apple Developer ID 证书
- 公证需要 Apple Team ID
- Universal 构建在 CI 中需要 `supportedArchitectures: [x64, arm64]`
