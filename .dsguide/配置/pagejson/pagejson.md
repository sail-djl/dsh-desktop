# package.json 解读

> 源文件: 仓库根目录 `package.json`
> 项目: @deepseek-ai/dsh-root v0.1.2-alpha.3

---

## 一、基础元信息

```json
"name": "@deepseek-ai/dsh-root",
"version": "0.1.2-alpha.3",
"license": "MIT",
"private": true,
"type": "module",
"packageManager": "pnpm@11.7.0"
```

| 字段 | 值 | 含义 |
|:--|:--|:--|
| `name` | `@deepseek-ai/dsh-root` | monorepo 根包名，带 scope `@deepseek-ai` |
| `version` | `0.1.2-alpha.3` | 当前版本，alpha 阶段（第 3 次 alpha 发布） |
| `license` | MIT | 开源协议 |
| `private` | true | **不允许发布到 npm**，仅本地/workspace 使用 |
| `type` | `module` | 全项目 ESM（import/export），不是 CommonJS（require） |
| `packageManager` | pnpm@11.7.0 | 锁定 pnpm 版本，corepack 自动下载对应版本 |

---

## 二、Node.js 版本要求

```json
"engines": {
  "node": "^22.19.0 || >=24.0.0"
}
```

| 范围 | 说明 |
|:--|:--|
| `^22.19.0` | 22.19.x 及以上 22.x（23.x 不行，有 breaking change） |
| `>=24.0.0` | 24.0.0 及以上所有版本（含 26.x） |

当前环境已切到 **Node.js 26.8.1**（满足 `>=24.0.0`）。

---

## 三、Workspace 布局

```json
"workspaces": [
  "vendor/*",
  "packages/*/*",
  "native/landlock-run",
  "native/landlock-run/packages/*",
  "apps/*",
  "website"
]
```

pnpm workspace 模式，一个仓库包含多个独立包：

| workspace glob | 内容 | 典型包数 |
|:--|:--|:--|
| `vendor/*` | 本地 vendored 第三方库（cordis、cosmokit 等） | ~6 |
| `packages/*/*` | 核心包（按 group 分：core/、llm/、web/、client/ 等） | ~250+ |
| `native/landlock-run` | 原生 Landlock 沙箱启动器 | 1 |
| `native/landlock-run/packages/*` | 原生包的平台绑定 | ~3 |
| `apps/*` | CLI 应用（dsh 命令）和 Web 前端 | 2 |
| `website` | VitePress 文档站 | 1 |

`packages/*/*` 结构：`packages/<group>/<package>/`，例如 `packages/llm/deepseek/`。

---

## 四、Scripts 分类解读

scripts 是 `pnpm run <name>` 的入口，共 ~100 条。按用途分为 **9 大类**：

### 4.1 构建类

| 命令 | 作用 |
|:--|:--|
| `build` | 全量构建（tsx scripts/build.ts），依次：host编译 → host打包 → client编译 → client打包 → web构建 |
| `build:official` | 官方 profile 构建（多一步 profile 选择） |
| `build:lib` | 仅编译 TS + 打包 lib/（不构建 web） |
| `build:lib:host` | host 聚合：tsc -b tsconfig.host.json + tsdown --env.DSH_BUILD_FACE host |
| `build:lib:client` | client 聚合：tsc -b tsconfig.client.json + tsdown --env.DSH_BUILD_FACE client |
| `build:web` | 仅构建 Web 前端（Vite），等价于 `pnpm --filter @deepseek-ai/dsh-web-frontend run build` |

构建链路：
```
build
 └→ build:lib:host    (tsc host → tsdown host)
 └→ build:lib:client  (tsc client → tsdown client)
 └→ build:web         (vite build)
```

### 4.2 清理类

| 命令 | 作用 |
|:--|:--|
| `clean` | `tsx scripts/clean.ts` — 删除 lib/、.dsh-build/、.typecheck/、*.tsbuildinfo |
| `change-scope` | 变更包的作用域 |

### 4.3 质量门禁（check:ci*）

| 命令 | 作用 |
|:--|:--|
| `check:all` | 全部门禁（生产用，很慢） |
| `check:ci` | CI 主要门禁（pr 判断依据） |
| `check:ci:static` | 静态分析门禁（lint + typecheck） |
| `check:ci:coverage` | 覆盖率门禁（per-file 100%） |
| `check:ci:snapshot` | 快照门禁 |
| `check:ci:artifacts` | 构建制品门禁 |
| `check:ci:consumers` | 消费者兼容性门禁 |
| `check:ci:linux-primary` | Linux 主要门禁 |
| `check:ci:windows-*` | Windows 门禁（blocking/complete/observational） |
| `check:windows-wine` | Wine 环境 Windows 门禁（需 wine） |
| `check:node-compat` | Node.js 兼容性门禁 |

### 4.4 测试类

| 命令 | 作用 |
|:--|:--|
| `test` | `vitest run` — 单元测试 |
| `test:coverage` | 覆盖率测试（V8 provider） |
| `test:coverage:partitioned` | 分区覆盖率测试（大仓库分批跑） |
| `test:e2e` | 端到端测试（用真实 API，需 DEEPSEEK_API_KEY） |
| `test:expected` | 预期输出测试 |
| `test:expected:refresh` | 刷新预期输出基准 |
| `test:snapshot` | 快照测试（无 key，记录会话回放） |
| `test:snapshot:record` | 重录快照基准（需 key） |
| `test:snapshot:refresh` | 刷新快照基准 |
| `test:web` | Web 前端测试（先 build 再 vitest） |
| `test:web:perf` | Web 性能测试 |
| `test:web:stress` | Web 压力测试 |
| `test:gui` | GUI 组件测试（client + host 包） |
| `test:docs` | 文档快速检查（无 build） |

### 4.5 Lint 类

| 命令 | 作用 |
|:--|:--|
| `lint` | oxlint 全项目 lint（需先 build:lib:host） |
| `lint:fix` | oxlint 自动修复 |
| `lint:contracts-ready` | 仅 client 代码 lint（跳过 host 编译） |
| `duplication` | jscpd 跨文件克隆检测 |
| `typecheck` | TypeScript 类型检查（tsc -b） |

### 4.6 文档构建

| 命令 | 作用 |
|:--|:--|
| `docs:dev` | VitePress 开发服务器 |
| `docs:build` | VitePress 生产构建 + 片段验证 |
| `docs:build:mpa` | 多页文档构建 |
| `docs:preview` | VitePress 预览 |
| `docs:check` | 文档检查（含 vitest + 构建验证） |
| `website:dev` | 等价 `docs:dev` |
| `website:build` | 等价 `docs:build` |

### 4.7 验证脚本（verify-*）

共 ~30 条 verify 脚本，用于 CI 门禁和本地校验：

| 类别 | 命令 |
|:--|:--|
| 包质量 | `verify-package-paths`、`verify-package-dependencies`、`verify-package-invariants`、`verify-built-package-invariants` |
| 包规范 | `publint`、`verify-dsh-package-licenses`、`verify-runtime-closure`、`verify-application-entrypoints` |
| 文档 | `verify-md-wrap`、`verify-md-links`、`verify-doc-site-fragments`、`verify-doc-refs`、`verify-doc-budgets`、`verify-public-repository-links` |
| 代码规范 | `verify-export-jsdoc`、`verify-type-equiv`、`verify-node-next-types`、`verify-optional-dependency-imports` |
| Cordis | `verify-cordis-config`、`verify-cordis-catalog`、`verify-cordis-api`、`verify-cordis-inspect-catalog` |
| Client | `verify-client-packages`、`verify-client-ui-i18n`、`verify-client-catalog`、`verify-client-domain-graph` |
| Agent Note | `verify-agent-note-classification`、`verify-agent-note-format`、`verify-archived-agent-notes` |
| 翻译 | `verify-translation-prompt`、`verify-translation-pairing` |
| 其他 | `verify-mermaid`、`verify-skill-invocation-metadata`、`verify-config-source-ownership`、`verify-vendored-links`、`verify-subsystem-pages` |

### 4.8 生成脚本（gen-*）

| 命令 | 作用 |
|:--|:--|
| `gen-tsconfig-paths` | 生成 tsconfig paths 映射 |
| `gen-cordis-catalog` | 生成 Cordis 插件目录 |
| `gen-cordis-api` | 生成 Cordis API 文档 |
| `gen-client-catalog` | 生成 Client 目录 |
| `gen-tool-catalog` | 生成工具目录 |
| `gen-config-catalog` | 生成配置目录 |
| `gen-doc-graphs` | 生成文档关系图（Mermaid） |
| `gen-persistence-catalog` | 生成持久化目录 |
| `gen-third-party-notices` | 生成第三方声明 |
| `gen-module-graph` | 生成模块依赖图 |
| `gen-scoped-events` | 生成作用域事件 |
| `gen-translation-brief` | 生成翻译任务简报 |
| `gen-cordis-inspect-catalog` | 生成 Cordis 检查目录 |

### 4.9 应用/调试/发布

| 命令 | 作用 |
|:--|:--|
| `dsh` | CLI 入口：`node --import tsx/esm apps/cli/src/bin.ts`，用于 `pnpm dsh web`、`pnpm dsh --profile headless` |
| `demo:ptc` | 头less PTC 模式运行（需 key） |
| `demo:inspector` | Inspector Web 模式（带 patch） |
| `mock:llm` | 本地 Mock LLM 服务器（测试用） |
| `dev:web` | Web 前端开发模式（带 HMR，`--poll` 监听文件变化） |
| `postinstall` | pnpm install 后自动执行，安装 lefthook（git hooks） |
| `publish:npm-baseline` | 发布 npm 基线 |
| `release:dsh` | 版本号 bump（dsh 家族） |
| `release:vendor` | vendor 版本号 bump |
| `release:verify` | 发布前验证 |
| `release:pack` | 打包发布产物 |
| `release:verify-packed-install` | 验证打包产物可安装 |
| `release:publish` | 发布到 npm |
| `doc-sync` | 文档同步门禁（所有 doc-verify 的聚合） |
| `hygiene` | 卫生检查（publint + workspace + package + dependency） |
| `constraints` | workspace 约束检查 |
| `resolve-translation-pairing-conflicts` | 翻译配对冲突解决 |

---

## 五、devDependencies

根包只有 `devDependencies`（没有 `dependencies`），说明根包本身不运行任何代码，仅作为 monorepo 管理容器。

### 按用途分类

| 类别 | 包 | 版本 | 用途 |
|:--|:--|:--|:--|
| **内部 workspace** | `@deepseek-ai/dsh-tool-session-query` | workspace:^ | 内部工具依赖 |
| | `@deepseek-ai/dsh-web-fetch-http` | workspace:^ | 内部 Web 抓取依赖 |
| **TypeScript** | `typescript` | ^6.0.3 | 编译器（项目引用模式 tsc -b） |
| | `tsdown` | ^0.22.2 | 基于 esbuild 的打包器（输出 ESM lib/） |
| | `tsx` | ^4.22.4 | TypeScript 执行器（跑 scripts/*.ts，无需先编译） |
| **测试** | `vitest` | ^4.1.8 | 测试框架 |
| | `@vitest/coverage-v8` | ^4.1.8 | V8 覆盖率 provider |
| | `jsdom` | 29.1.1 | 浏览器 DOM 模拟（Web 测试用） |
| | `@testing-library/dom` | ^10.4.1 | DOM 测试工具 |
| | `@testing-library/react` | ^16.3.2 | React 组件测试工具 |
| | `fast-check` | ^4.8.0 | Property-based testing |
| **Lint** | `oxlint` | 1.76.0 | Rust 编写的快速 linter |
| | `oxlint-tsgolint` | 7.0.2001 | oxlint TS 规则扩展 |
| | `@stylistic/eslint-plugin` | ^5.10.0 | ESLint 代码风格插件 |
| | `eslint-plugin-sonarjs` | ^4.1.0 | SonarJS 代码质量规则 |
| **文档** | `mermaid` | 11.16.0 | Mermaid 图表渲染（文档图表校验用） |
| | `mdast-util-from-markdown` | ^2.0.3 | Markdown AST 解析 |
| | `mdast-util-gfm` | ^3.1.0 | GFM 语法扩展 |
| | `micromark-extension-gfm` | ^3.0.0 | GFM micromark 扩展 |
| **包发布** | `publint` | ^0.3.21 | npm 包发布规范检查 |
| | `@yarnpkg/cli-dist` | 4.17.1 | Yarn 分发工具（yarnpkg CLI） |
| | `spdx-expression-parse` | ^5.0.0 | SPDX 许可证解析 |
| | `@types/spdx-expression-parse` | ^4.0.0 | 对应类型定义 |
| **Git Hooks** | `lefthook` | ^2.1.9 | Git hooks 管理（pre-commit/pre-push） |
| **代码分析** | `jscpd` | ^5.0.12 | 跨文件克隆/重复检测 |
| | `istambul-lib-report` | ^3.0.1 | 覆盖率报告（Istanbul） |
| **构建辅助** | `lightningcss` | ^1.32.0 | CSS 编译器（Web 前端构建用） |
| | `vite-tsconfig-paths` | ^6.1.1 | Vite tsconfig paths 支持 |
| **工具** | `js-yaml` | ^4.2.0 | YAML 解析（读 cordis.patch.yml） |
| | `smol-toml` | ^1.7.1 | TOML 解析 |
| | `execa` | ^10.0.0 | 子进程执行器 |
| **类型定义** | `@types/node` | ^22.20.0 | Node.js 类型 |
| | `@types/js-yaml` | ^4.0.9 | js-yaml 类型 |
| | `@types/jsdom` | ^28.0.3 | jsdom 类型 |
| | `@types/mdast` | ^4.0.4 | Markdown AST 类型 |

---

## 六、关键设计决策

### ESM-only

`"type": "module"` 意味着所有 `.js` 文件默认按 ES module 解析。这与 `node --import tsx/esm` 配合，CLI 入口通过 tsx 的 ESM hook 直接运行 TypeScript 源码（无需预编译）。

### 无 dependencies

根包 `devDependencies` only，所有运行时依赖在子包的 `dependencies`/`peerDependencies` 中声明。根包只负责 monorepo 管理和全局工具。

### build 链路

```
pnpm run build
 └→ tsx scripts/build.ts
      ├→ build:lib:host    (tsc -b + tsdown host)
      ├→ build:lib:client  (tsc -b + tsdown client)
      └→ build:web         (vite build)
```

host/client 双聚合是核心设计：`tsconfig.host.json` 编译服务端包，`tsconfig.client.json` 编译客户端包，两者独立构建、产物在 `lib/` 下各自目录。

### postinstall

`pnpm install` 完成后自动执行 `node scripts/install-lefthook.mjs`，配置 git hooks（pre-commit lint、pre-push check 等）。
