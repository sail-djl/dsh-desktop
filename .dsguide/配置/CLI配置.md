# CLI 配置参考

> dsh 命令行的所有配置项，按架构分层组织。

## 架构概览

项目采用**分层 CLI 解析架构**，共 4 层：

```
dsh [Launcher 层] --profile web [应用层] --port 3080 [位置参数]
                     ↑                   ↑
              cmdline 桥接层         各 bundle/startup
              (ctx.cmdlineArgs)      (独立 Commander program)
```

1. **Launcher 层** — 全局 flag（`--profile`、`--patch`、`--dump-config`）
2. **Cmdline 桥接层** — 将 Launcher 原始 `args[]` 冻结为不可变快照，注入 `ctx.cmdlineArgs`
3. **应用层** — 每个 profile 用独立 Commander program 解析自己的 flag
4. **工具层** — `scripts/` 下各脚本独立解析，与 dsh 运行时无关

> Launcher 使用 `allowUnknownOption()` + `passThroughOptions()`，首个不认识的 token 之后的所有内容原样传递给被启动的 profile。

---

## 一、Launcher 层

**注册模块**: `apps/cli/src/args.ts`

| Flag | 类型 | 默认值 | 描述 |
|:--|:--|:--|:--|
| `-V, --version` | 无参数 | - | 输出版本号 |
| `--profile <name>` | string（必填） | - | 指定要启动的 profile 名称 |
| `--patch <path>` | string[]（可重复） | `[]` | 额外 patch-list overlay（在 profile 层之上叠加） |
| `--dump-config` | boolean | `false` | 打印完整组合配置树（含用户层和 --patch）后退出 |
| `--dump-default-config` | boolean | `false` | 仅打印 bundle 层默认配置后退出 |

### 子命令

| 子命令 | 用法 | 说明 |
|:--|:--|:--|
| `web` | `dsh web [args...]` | `--profile web` 的别名，携带相同全局 flag |
| `plugin` | `dsh plugin --profile <name> <pnpm args...>` | 管理 profile 的插件依赖（转发给 pnpm） |

### 示例

```bash
dsh --profile web                          # 启动 web profile
dsh --profile headless "run the tests"     # 一次性任务模式
dsh --profile tui --patch ./extra.yml      # 追加自定义补丁
dsh --profile tui --resume <session>       # 恢复会话
dsh --profile web --help                   # 查看 web 应用自己的 flag
dsh plugin --profile tui add <package>     # 安装插件到 tui profile
```

---

## 二、Web Profile 应用层

**注册模块**: `packages/bundle/web-app/src/startup.ts`（`web-startup` 插件）

在 Launcher 的 `--profile web` 之后解析的内部参数：

| Flag | 类型 | 默认值 | 描述 |
|:--|:--|:--|:--|
| `-h, --help` | 无参数 | - | 显示 web 应用帮助 |
| `--host <host>` | string | `undefined`（回退到 `127.0.0.1`） | 监听主机地址 |
| `--port <port>` | number | `undefined`（回退到 `3080`，传 0 由 OS 选取） | 监听端口 |
| `--no-open` | boolean（反向 flag） | `true`（打开浏览器） | 不在默认浏览器中打开 Web UI |
| `--trusted-host <authority...>` | string[]（可重复） | `[]` | API 浏览器信任围栏接受的额外 authority |

### 发布服务

```typescript
// webStartup 服务，供后续插件消费
interface WebStartupValues {
  openBrowser: boolean      // --no-open 的反向值
  host?: string             // --host
  port?: number             // --port（解析为数字）
  trustedHosts: string[]    // --trusted-host（累积）
}
```

### 级联到 cordis.patch.yml 的配置

web-startup 解析的值会被以下插件消费：

| 插件行 | 消费的字段 | 说明 |
|:--|:--|:--|
| `webserver` | `host`, `port` | Web 服务器绑定 |
| `web-runtime` | `openBrowser`, `trustedHosts` | 浏览器打开和信任围栏 |
| `connection` | `trustedHosts` | 客户端连接的信任主机 |

### 示例

```bash
dsh web --port 5300 --no-open                    # 指定端口，不自动打开浏览器
dsh web --host 0.0.0.0 --port 8080               # 监听所有接口
dsh web --trusted-host myapp.internal             # 信任额外的 host
dsh web --trusted-host a.com --trusted-host b.com # 多个信任 host
```

---

## 三、Headless Profile 应用层

**注册模块**: `packages/bundle/headless/src/startup.ts`（`headless-startup` 插件）

| 参数 | 类型 | 默认值 | 描述 |
|:--|:--|:--|:--|
| `[task...]` | string（位置参数，多个词拼接） | - | 任务文本（缺少或纯空格时报错） |
| `-h, --help` | 无参数 | - | 显示帮助信息 |

### 发布服务

```typescript
interface HeadlessStartupValues {
  task: string   // 所有位置参数用空格拼接
}
```

### 示例

```bash
dsh --profile headless "分析这段代码的性能瓶颈"
dsh --profile headless write unit tests for utils.ts
```

---

## 四、ACP Profile 应用层

**注册模块**: `packages/bundle/acp-app/src/index.ts`（`acp-app-startup` 插件）

| Flag | 类型 | 默认值 | 描述 |
|:--|:--|:--|:--|
| `-h, --help` | 无参数 | - | 显示帮助信息 |

无自定义 flag。解析成功后发布 `{ accepted: true }` 并绑定 stdin 生命周期。

---

## 五、SDK Profile 应用层

**注册模块**: `packages/bundle/sdk-app/src/index.ts`（`sdk-app-startup` 插件）

| Flag | 类型 | 默认值 | 描述 |
|:--|:--|:--|:--|
| `-h, --help` | 无参数 | - | 显示帮助信息 |

无自定义 flag。命令名由 Cordis 配置中的 `profile` 字段动态决定。

**Cordis 配置**:

| 字段 | 类型 | 默认值 | 描述 |
|:--|:--|:--|:--|
| `profile` | string | `'sdk'` | 渲染在帮助和诊断中的 profile 名称 |

---

## 六、环境变量级配置

不是 CLI flag，但通过 `process.env` 影响运行时行为，功能等同于配置选项。

### 运行时环境变量

| 变量 | 消费位置 | 默认值 | 描述 |
|:--|:--|:--|:--|
| `DEEPSEEK_API_KEY` | `llm-deepseek` / `web-search-deepseek` | - | DeepSeek API 密钥（必填） |
| `DEEPSEEK_BASE_URL` | `llm-deepseek` | - | 自定义 DeepSeek API 地址 |
| `DSH_HOME` | 多处 | `~/.dsh` | DSH 主目录 |
| `DSH_PERMISSION_MODE` | `sandbox-policy` / `approval` | `workspace-write` | 权限模式 |
| `DSH_TELEMETRY_MODE` | `session-telemetry-otel` | `FEEDBACK_ONLY` | 遥测模式 |
| `DSH_TELEMETRY_DISABLED` | `profile-boot.ts` | - | 非空即禁用遥测 |
| `DSH_TELEMETRY_OTLP_URL` | `session-telemetry-otel` | `https://harness-telemetry.deepseeksvc.com/v1/logs` | OTLP 端点 |
| `DSH_TOOLS_MODE` | `web-app/cordis.patch.yml` | `native` | 工具呈现模式 |
| `DSH_CLIENT_TITLE` | `apps/web/vite.config.ts` | `DeepSeek Harness` | 客户端构建标题 |
| `E2B_API_KEY` | `e2b` | - | E2B 沙箱 API 密钥 |
| `DSH_PI_AI_OPENAI_BASE_URL` | `llm-pi-ai` | - | Pi-AI OpenAI 端点 |
| `DSH_PI_AI_ANTHROPIC_BASE_URL` | `llm-pi-ai` | - | Pi-AI Anthropic 端点 |

### 构建/开发环境变量

| 变量 | 消费位置 | 描述 |
|:--|:--|:--|
| `DSH_BUILD_CLIENT_PROFILE` | `scripts/build.ts` | 客户端构建 profile 选择器 |
| `DSH_GATE_CONCURRENCY` | `scripts/run-gates.ts` | 质量门并发 worker 数 |
| `DSH_OXLINT_THREADS` | `scripts/run-oxlint.ts` | Oxlint 线程数 |
| `DSH_COVERAGE_PARTITIONS` | `scripts/coverage-partitions.ts` | 分区覆盖率的分区数 |
| `DSH_COVERAGE_TEST_TIMEOUT_MS` | `scripts/coverage-partitions.ts` | 分区覆盖率测试超时 |
| `DSH_SNAPSHOT` | 测试文件 | 测试快照模式：`record` / `refresh` |

---

## 七、工具层 CLI（独立脚本）

以下脚本不在 dsh 运行时中执行，是独立的开发/CI 工具。

### LLM Mock Server

```bash
node packages/test-support/llm-mock-server/src/cli.ts \
  --sequence success,success \
  --port 8000 \
  --api-key test-key
```

| Flag | 默认值 | 描述 |
|:--|:--|:--|
| `--sequence <a,b,...>` | 必填 | 行为列表（`connection_refused` 仅允许作为第一个） |
| `--host <host>` | `127.0.0.1` | 监听主机 |
| `--port <port>` | `8000` | 监听端口 |
| `--api-key <token>` | - | Bearer token 验证 |
| `--listen-delay-ms <ms>` | `750` | 不可用等待期 |
| `--repeat-last` | `false` | 用尽后重复最后一个行为 |
| `--seed <uint32>` | - | 随机种子 |
| `--random-weights <a=n,...>` | - | 行为权重 |
| `--success-text <text>` | - | 成功响应文本 |
| `--partial-text <text>` | - | 部分响应文本 |
| `--reasoning-text <text>` | - | 推理响应文本 |
| `--chunk-size <count>` | - | 分块大小 |
| `--chunk-delay-ms <ms>` | - | 分块延迟 |
| `--disconnect-delay-ms <ms>` | - | 断开延迟 |
| `--retry-after-ms <ms>` | - | 重试间隔 |
| `--request-id <id>` | - | 响应 request ID |
| `--tool-name <name>` | - | 工具调用名称 |
| `--tool-arguments <json>` | - | 工具调用参数（JSON） |

### Webworker Packer

| Flag | 默认值 | 描述 |
|:--|:--|:--|
| `--profile <name>` | `web` | 打包使用的 profile |
| `--out <file>` | 必填 | 输出文件路径 |
| `--root <path>` | `/dsh` | VFS 镜像根路径 |

### Sandbox Windows ACL Runner

| Flag | 默认值 | 描述 |
|:--|:--|:--|
| `--workspace <dir>` | 必填 | 工作空间目录 |
| `--temp <dir>` | 必填 | 临时目录 |
| `--mode <mode>` | 必填 | 运行模式：`read-only` / `workspace-write` |
| `--write-sid <sid>` | - | 写入 SID |
| `--temp-write-sid <sid>` | - | 临时写入 SID |

### 仓库构建 (`scripts/build.ts`)

| Flag | 默认值 | 描述 |
|:--|:--|:--|
| `--profile <name>` | 环境变量 `DSH_BUILD_CLIENT_PROFILE` | 客户端构建 profile |

### 版本递增 (`scripts/release/bump.ts`)

| Flag | 默认值 | 描述 |
|:--|:--|:--|
| `--family <name>` | 必填 | 发布族：`dsh` / `vendor` |
| `--prerelease <tag>` | - | 预发布标签（如 `rc.1`） |
| `--dry-run` | `false` | 仅报告计划 |
| `[version]` | - | 目标版本（如 `minor`、`patch`、`x.y.z`） |

### 发布到 npm (`scripts/release/publish.ts`)

| Flag | 默认值 | 描述 |
|:--|:--|:--|
| `--family <name>` | 必填 | 发布族 |
| `--from <dir>` | 必填 | 已打包的目录路径 |

### Web 开发服务器 (`scripts/dev-web.ts`)

| Flag | 默认值 | 描述 |
|:--|:--|:--|
| `--poll[=ms]` | `500` | 文件轮询间隔（毫秒） |

---

## 八、配置叠加规则

### CLI 参数 → cordis.patch.yml 级联

CLI 参数并不直接修改 `cordis.patch.yml`，而是通过**服务注入**的方式级联：

```
CLI --port 5300
  → webStartup 服务 { port: 5300 }
    → webserver 插件 config.port = ctx.webStartup.port ?? 3080
      → 实际监听 5300
```

### patch 叠加层级

`--patch` 指定的文件在 profile 用户层之上叠加，优先级从低到高：

1. Bundle 层（`packages/bundle/*/cordis.patch.yml`）
2. Profile 用户层（`$DSH_HOME/profiles/<name>/cordis.patch.yml`）
3. Home 用户层（`$DSH_HOME/cordis.patch.yml`）
4. **`--patch` 叠加层**（命令行指定）
5. 遥测开关（`DSH_TELEMETRY_DISABLED`）

> patch 替换整行 config（非深度合并），最后一个写入者赢。

---

## 九、全部 Flag 速查表

| 层级 | Flag | 默认值 |
|:--|:--|:--|
| Launcher | `--profile <name>` | （必填） |
| Launcher | `--patch <path>` | `[]` |
| Launcher | `--dump-config` | `false` |
| Launcher | `--dump-default-config` | `false` |
| Launcher | `-V, --version` | - |
| Web | `--host <host>` | `127.0.0.1` |
| Web | `--port <port>` | `3080` |
| Web | `--no-open` | `false` |
| Web | `--trusted-host <host>` | `[]` |
| Web | `-h, --help` | - |
| Headless | `[task...]` | （必填） |
| Headless | `-h, --help` | - |
| ACP | `-h, --help` | - |
| SDK | `-h, --help` | - |
