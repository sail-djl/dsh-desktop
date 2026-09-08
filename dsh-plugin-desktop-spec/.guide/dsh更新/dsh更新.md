# DSH 更新维护指南

## 维护规则

> **dsh-plugin-desktop（原版）保持不变；spec 按本地 DSH 版本独立维护。**
> 每次 DSH 更新后，需手动同步 spec 的依赖版本。

## 本地版本基准

来源：`deepseek-harness@0.1.3-alpha.2` + monorepo 内各 vendor 包

| 包组 | 本地版本 | 说明 |
|:--|:--|:--|
| `@deepseek-ai/dsh` + `@deepseek-ai/dsh-*` | `0.1.3-alpha.2` | ~130 个包，版本号统一 |
| `@deepseek-ai/cordis` | `4.0.2` | deepseek-harness/vendor/cordis |
| `@deepseek-ai/cordis-plugin-group` | `1.0.2` | 外部 npm 包 |
| `@deepseek-ai/cordis-plugin-include` | `1.0.7` | 外部 npm 包 |
| `@deepseek-ai/cordis-plugin-loader` | `1.0.3` | 外部 npm 包 |
| `@deepseek-ai/cordis-plugin-timer` | `1.1.4` | 外部 npm 包 |
| `dshmarket` | `1.38.1` | 外部 npm 包 |
| `dsh-community-market` | `0.1.0-dev.0` | monorepo 内，跟随更新 |

## 更新清单

每次 DSH 升级时，按以下步骤执行：

### Step 1：确认本地新版号

```bash
# 查 DSH core 版本
cat deepseek-harness/package.json | grep '"version"'

# 查 cordis 版本
cat deepseek-harness/vendor/cordis/package.json | grep '"version"'

# 查原版参考版本（用于 cordis-plugin-* 等外部包）
grep -E '"@deepseek-ai/cordis-plugin|"dshmarket"' dsh-plugin-desktop/package.json
```

### Step 2：更新 package.json 依赖版本

在 `dsh-plugin-desktop-spec/package.json` 中更新：

| 依赖组 | 操作 | 影响行数 |
|:--|:--|:--|
| `@deepseek-ai/dsh-*` | 全量替换版本号 | ~130 行 |
| `@deepseek-ai/cordis` | 单独更新 | 1 行 |
| `@deepseek-ai/cordis-plugin-*` | 4 个包各自更新 | 4 行 |
| `dshmarket` | 单独更新 | 1 行 |
| `dsh-community-market` | 如有新版则更新 | 1 行 |

### Step 3：验证兼容性

```bash
# 类型检查
yarn run typecheck

# 构建测试
yarn run build

# 完整检查
yarn run check
```

### Step 4：打包验证

```bash
# 打包 Code 版
node scripts/spec-dist.ts code

# 打包 Work 版
node scripts/spec-dist.ts work
```

## 注意事项

1. **不要修改原版**：`dsh-plugin-desktop/` 目录下的文件不可改动
2. **spec 独有文件**：以下文件仅存在于 spec，更新 DSH 时不需要同步
   - `.spec/code/configspec.yaml`
   - `.spec/work/configspec.yaml`
   - `scripts/spec-build.ts`
   - `scripts/spec-dist.ts`
   - `scripts/gen-spec-icons.py`
   - `scripts/noop-after-pack.ts`
3. **cordis.patch.yml**：构建时由 `spec-build.ts` 自动替换包名引用，无需手动修改
4. **API 变化**：若 DSH 版本跨度较大，需检查 `src/` 下的 import 是否有 breaking changes

## 历史更新记录

| 日期 | DSH 版本 | cordis | dshmarket | 操作人 |
|:--|:--|:--|:--|:--|
| 2026-09-08 | 0.1.2-alpha.5 → 0.1.3-alpha.2 | 4.0.1 → 4.0.2 | 1.17.1 → 1.38.1 | — |
