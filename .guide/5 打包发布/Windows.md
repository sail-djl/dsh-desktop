# Windows 打包说明

## 产物

| 产物 | 命名 | 说明 |
|:--|:--|:--|
| NSIS 安装器 | `DSH-Desktop-${version}-x64-Setup.exe` | 标准安装器 |
| Portable | `DSH-Desktop-${version}-x64-Portable.exe` | 便携版 |

## 打包命令

```bash
# 安装器 + Portable
yarn dist:win

# 仅 Portable
yarn dist:win-portable
```

## NSIS 安装器特性

- 非一键安装（oneClick: false）
- 允许选择安装目录
- 创建桌面快捷方式和开始菜单
- 包含 THIRD_PARTY_NOTICES.md 作为许可证
- 使用自定义 `installer.nsh` 脚本
- 无差分包（differentialPackage: false）

## 验证

```bash
# 完整验证
corepack yarn check:win-package

# 单项验证
yarn verify:closure    # 运行时闭包
yarn verify:cli        # CLI 运行时
yarn verify:loader     # Loader 启动
yarn verify:profile    # Profile 启动
yarn verify:licenses   # 许可证
yarn verify:operations # 操作可靠性
```

## 平台特定功能

- **ACL 沙箱**：`dsh-sandbox-windows-acl` 提供 Windows ACL 权限控制
- **PowerShell 沙箱**：`windows-pwsh-sandbox` 提供 PowerShell 执行隔离
- **安装器退出检测**：`desktop-installer-quit.ts` 处理安装器进程退出
- **Volume 诊断**：Windows 卷信息诊断

## 注意事项

- NSIS 工具集版本：1.2.1
- 仅支持 x64 架构
- `electronFuses.runAsNode: true`（允许 Node.js API 访问）
