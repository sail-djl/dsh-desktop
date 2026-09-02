# Patch 层链路

> DSH Profile 的完整 Patch 层加载机制：从空根到最终插件树的全链路。
> 以 `web` profile + `standard` preset 为例。

---

## 一、概念回顾

| 术语 | 说明 |
| :-- | :-- |
| **Patch 层** | 一层 `cordis.patch.yml` 的叠加，后层覆盖前层 |
| **Patch 操作** | `insert`（插入新插件）、`override`（覆盖配置）、`disabled`（禁用） |
| **Bundle** | npm 包 + `cordis.patch.yml`，profile 通过声明 bundle 加载 |
| **Profile** | `.dsh/profiles/<name>/package.json`，声明加载哪些 bundles |
| **Preset** | `agent.cordis.yml`，定义 Agent 的工具集和提示词 |

---

## 二、完整加载链

```
cordis.yml (空根)                        ← Layer 0: []
  │
  ▼
Layer 1: @deepseek-ai/dsh-base           ← packages/bundle/base/cordis.patch.yml
  │  insert ~65 个基础插件行
  │  (agent, llm, shell, fs, session, tools, skill, goal, compaction 等)
  │  禁用: tool-web, tool-pwsh (非 win32)
  │
  ▼
Layer 2: @deepseek-ai/dsh-web-app        ← packages/bundle/web-app/cordis.patch.yml
  │  insert ~60 个 Web UI 插件行
  │  (webserver, client-connection, client-ui-*, storage, workspace 等)
  │  insert: agent-presets (default: standard)
  │
  ▼
Layer 3: profile cordis.patch.yml         ← .dsh/profiles/web/cordis.patch.yml
  │  override: webserver → port: 5300
  │
  ▼
Layer 4: home cordis.patch.yml            ← $DSH_HOME/cordis.patch.yml (如存在)
  │  (用户级机器本地覆盖)
  │
  ▼
Layer 5: --patch overlays                 ← 启动参数传入
  │  e.g. redis-5.0.3-config.cordis.yml → insert Redis MCP
  │  e.g. port-5300.cordis.yml → override port
  │
  ▼
Layer 6: telemetry switch                 ← DSH_TELEMETRY_DISABLED 环境变量
  │  (任何非空值禁用 session-telemetry-otel)
  │
  ▼
Layer 7: agent-presets 注入               ← composeProfile 注入 shipped preset root
  │  agent-presets.config.roots += config/agent-presets/
  │  → standard/cordis/code/minimal/my-agent 可被发现
  │
  ▼
Layer 8: standard preset 加载             ← agent.cordis.yml 按序注册
     persona → agent-instructions → tool-bash → tool-pwsh →
     tool-fs → tool-fs-search → tool-jobs → skill-filesystem →
     tool-skill → tool-goal → planning(group) → compaction(group) →
     delegation(group) → tool-ask-user → tool-todo → tool-web
```

---

## 三、每层详解

### Layer 0: 空根

```yaml
# cordis.yml — 每次启动重写（防止 Loader write-back 导致 bundles 重复）
[]
```

**源码**：`profile-boot.ts` 的 `PROFILE_ROOT_CONFIG` 常量。

### Layer 1: dsh-base（基础层）

**来源**：`packages/bundle/base/cordis.patch.yml`
**插件数**：~65

```yaml
# Agent 核心
- id: agent                    # dsh-agent
- id: agent-loop               # dsh-agent-loop
- id: agent-default-model      # dsh-agent-default-model

# LLM 适配器
- id: llm                      # dsh-llm
- id: llm-deepseek             # dsh-llm-deepseek
- id: llm-pi-ai                # dsh-llm-pi-ai
- id: llm-retry                # dsh-llm-retry
- id: api-gateway              # dsh-api-gateway

# Shell 环境
- id: shell-env                # dsh-shell-env
- id: bash-sandbox             # dsh-bash-sandbox
- id: pwsh-sandbox             # dsh-pwsh-sandbox
- id: sandbox-local            # dsh-sandbox-local
- id: sandbox-policy           # dsh-sandbox-policy

# 文件系统
- id: fs-local                 # dsh-fs-local
- id: fs-sandbox               # dsh-fs-sandbox
- id: fs-observation-policy    # dsh-fs-observation-policy

# Session 管理
- id: session                  # dsh-session
- id: session-persistence-jsonl
- id: session-projection
- id: session-query-sqlite
- id: session-telemetry-otel   # 可被 Layer 6 禁用

# 工具集
- id: tool-bash                # dsh-tool-bash
- id: tool-pwsh (disabled)     # dsh-tool-pwsh (非 win32 禁用)
- id: tool-fs                  # dsh-tool-fs
- id: tool-fs-search           # dsh-tool-fs-search
- id: tool-str-replace-editor  # dsh-tool-str-replace-editor
- id: tool-web (disabled)      # dsh-tool-web (Layer 8 启用)
- id: tool-goal                # dsh-tool-goal
- id: tool-skill               # dsh-tool-skill
- id: tool-ralph               # dsh-tool-ralph
- id: tool-workflow            # dsh-tool-workflow
- id: tool-jobs                # dsh-tool-jobs
- id: tool-subagent            # dsh-tool-subagent
- id: tool-subagent-control    # dsh-tool-subagent-control
- id: tool-subagent-report     # dsh-tool-subagent-report
- id: tool-todo                # dsh-tool-todo

# 其他
- id: skill                    # dsh-skill
- id: skill-filesystem         # dsh-skill-filesystem
- id: skill-badge              # dsh-skill-badge
- id: goal                     # dsh-goal
- id: compaction-basic         # dsh-compaction-basic
- id: command-compact          # dsh-command-compact
- id: permission-presets       # dsh-permission-presets
- id: user-approval            # dsh-user-approval
- id: user-questions           # dsh-user-questions
- id: jobs-local               # dsh-jobs-local
- id: workflow-worker-thread   # dsh-workflow-worker-thread
- id: credentials-local        # dsh-credentials-local
- id: settings-file            # dsh-settings-file
- id: token-meter              # dsh-token-meter
- id: web                      # dsh-web
- id: web-search-deepseek      # dsh-web-search-deepseek
```

### Layer 2: dsh-web-app（Web UI 层）

**来源**：`packages/bundle/web-app/cordis.patch.yml`
**插件数**：~60

```yaml
# Host 服务
- id: webserver                # dsh-host-webserver
- id: frontend-static          # dsh-host-frontend-static
- id: apiproxy                 # dsh-host-apiproxy
- id: plugin-inventory         # dsh-host-plugin-inventory
- id: directory-picker-auto    # dsh-host-directory-picker-auto
- id: directory-picker-browse  # dsh-host-directory-picker-browse
- id: directory-picker-native  # dsh-host-directory-picker-native

# 客户端 UI (40+)
- id: client-connection        # dsh-client-connection
- id: client-hmr               # dsh-client-hmr
- id: client-modules           # dsh-client-modules
- id: client-runtime           # dsh-client-runtime
- id: client-ui-renderer       # dsh-client-ui-renderer
- id: client-ui-layout         # dsh-client-ui-layout
- id: client-ui-sidebar        # dsh-client-ui-sidebar
- id: client-ui-conversation   # dsh-client-ui-conversation
- id: client-ui-tool           # dsh-client-ui-tool
- id: client-ui-theme          # dsh-client-ui-theme
- id: client-ui-commands       # dsh-client-ui-commands
- id: client-ui-settings       # dsh-client-ui-settings
- id: client-ui-goal           # dsh-client-ui-goal
- id: client-ui-plan           # dsh-client-ui-plan
- id: client-ui-skill          # dsh-client-ui-skill
- id: client-ui-subagent       # dsh-client-ui-subagent
- id: client-ui-jobs           # dsh-client-ui-jobs
- id: client-ui-workflow-run   # dsh-client-ui-workflow-run
- id: client-ui-trajectory     # dsh-client-ui-trajectory
- id: client-ui-workspace      # dsh-client-ui-workspace
- id: client-ui-attachment     # dsh-client-ui-attachment
- id: client-ui-message-feedback # dsh-client-ui-message-feedback
- id: client-ui-user-questions # dsh-client-ui-user-questions
- id: client-ui-input-trigger  # dsh-client-ui-input-trigger
- id: client-ui-reference      # dsh-client-ui-reference
- id: client-ui-deliverables   # dsh-client-ui-deliverables
- id: client-ui-cordis         # dsh-client-ui-cordis
- id: client-ui-model-selection # dsh-client-ui-model-selection
- id: client-ui-agent-preset   # dsh-client-ui-agent-preset
- id: client-ui-permission-presets # dsh-client-ui-permission-presets
- id: client-ui-settings-models    # dsh-client-ui-settings-models
- id: client-ui-settings-plugins   # dsh-client-ui-settings-plugins
- id: client-ui-settings-plugin-inventory # dsh-client-ui-settings-plugin-inventory
- id: client-ui-settings-general    # dsh-client-ui-settings-general
- id: client-ui-brand-official      # dsh-client-ui-brand-official
- id: client-ui-directory-picker-browse  # dsh-client-ui-directory-picker-browse
- id: client-ui-directory-picker-native  # dsh-client-ui-directory-picker-native
- id: client-locale             # dsh-client-locale

# 存储
- id: storage                  # dsh-storage
- id: storage-domain           # dsh-storage-domain
- id: storage-json             # dsh-storage-json

# 运行时
- id: code-runtime-worker-thread  # dsh-code-runtime-worker-thread
- id: agent-presets            # dsh-agent-presets (default: standard)
- id: api-remotes              # dsh-api-remotes
- id: workspace                # dsh-workspace

# 会话扩展
- id: session-projection-cache # dsh-session-projection-cache
- id: session-log-export       # dsh-session-log-export
- id: session-stats            # dsh-session-stats
- id: session-reference        # dsh-session-reference

# 引用/反馈
- id: file-reference           # dsh-file-reference
- id: file-reference-local     # dsh-file-reference-local
- id: message-feedback         # dsh-message-feedback
- id: launch-environment       # dsh-launch-environment
```

### Layer 3: profile cordis.patch.yml

**来源**：`.dsh/profiles/web/cordis.patch.yml`
**操作**：override

```yaml
# 覆盖 webserver 配置
- id: webserver
  config:
    host: '127.0.0.1'
    port: 5300
```

### Layer 4: home cordis.patch.yml

**来源**：`$DSH_HOME/cordis.patch.yml`（如存在）
**操作**：用户级机器本地覆盖

```yaml
# 示例：覆盖模型配置
- id: agent-default-model
  config:
    provider: xiaomi
    model: mimo-v2.5
```

### Layer 5: --patch overlays

**来源**：启动参数 `--patch xxx.yml`
**操作**：外部 patch 文件

```yaml
# 示例：Redis MCP
- insert:
    - id: mcp-redis-production
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: redis
        transport: stdio
        command: npx
        args: ['-y', '@modelcontextprotocol/server-redis']
        env:
          REDIS_URL: !!js process.env.REDIS_URL || 'redis://192.168.1.98:6379'
```

### Layer 6: telemetry switch

**来源**：`DSH_TELEMETRY_DISABLED` 环境变量
**操作**：条件禁用

```typescript
// profile-boot.ts resolveTelemetryPatch()
if (process.env.DSH_TELEMETRY_DISABLED !== '' && rows.has('session-telemetry-otel')) {
  // → { id: 'session-telemetry-otel', disabled: true }
}
```

### Layer 7: agent-presets 注入

**来源**：`profile-boot.ts` 的 `composeProfile()`
**操作**：注入 shipped preset root

```typescript
// profile-boot.ts
if (rows.has('agent-presets')) {
  composedOverlays.push({
    id: 'agent-presets',
    config: {
      ...rows.get('agent-presets')?.config,
      roots: [{ path: SHIPPED_PRESET_ROOT, trust: 'system' }],
    },
  })
}
```

### Layer 8: standard preset 加载

**来源**：`apps/cli/config/agent-presets/standard/agent.cordis.yml`
**操作**：按序注册 16 个插件行

```yaml
- id: persona                 # 系统提示词
- id: agent-instructions      # 指令系统 (maxBytes: 65536)
- id: tool-bash               # Bash 工具 (win32 禁用)
- id: tool-pwsh               # PowerShell 工具 (非 win32 禁用)
- id: tool-fs                 # 文件操作
- id: tool-fs-search          # 文件搜索
- id: tool-jobs               # 后台任务控制
- id: skill-filesystem        # 本地技能发现
- id: tool-skill              # 技能目录 + 加载器
- id: tool-goal               # 目标管理
- id: planning (group)        # 计划模式 (isolate: planMode)
- id: compaction (group)      # 上下文压缩 (isolate: compaction + toolResultPruner)
- id: delegation (group)      # 子代理 + 工作流 (isolate: workflowEngine)
- id: tool-ask-user           # 向用户提问
- id: tool-todo               # 待办事项
- id: tool-web                # Web 搜索
```

---

## 四、合并后的插件树

```
agent                           ← Layer 1
agent-loop                      ← Layer 1
agent-default-model             ← Layer 1
llm                             ← Layer 1
llm-deepseek                    ← Layer 1
llm-pi-ai                       ← Layer 1
llm-retry                       ← Layer 1
api-gateway                     ← Layer 1
shell-env                       ← Layer 1
bash-sandbox                    ← Layer 1
pwsh-sandbox                    ← Layer 1
sandbox-local                   ← Layer 1
sandbox-policy                  ← Layer 1
fs-local                        ← Layer 1
fs-sandbox                      ← Layer 1
fs-observation-policy           ← Layer 1
session                         ← Layer 1
session-persistence-jsonl       ← Layer 1
session-projection             ← Layer 1
session-query-sqlite           ← Layer 1
session-telemetry-otel         ← Layer 1 (可能被 Layer 6 禁用)
tool-bash                       ← Layer 1 + Layer 8 (preset 覆盖)
tool-pwsh                       ← Layer 1 (disabled) + Layer 8 (启用)
tool-fs                         ← Layer 1 + Layer 8
tool-fs-search                  ← Layer 1 + Layer 8
tool-str-replace-editor         ← Layer 1
tool-web                        ← Layer 1 (disabled) + Layer 8 (启用)
tool-goal                       ← Layer 1 + Layer 8
tool-skill                      ← Layer 1 + Layer 8
tool-ralph                      ← Layer 1 + Layer 8
tool-workflow                   ← Layer 1 + Layer 8
tool-jobs                       ← Layer 1 + Layer 8
tool-subagent                   ← Layer 1 + Layer 8
tool-subagent-control           ← Layer 1 + Layer 8
tool-subagent-report            ← Layer 1
tool-todo                       ← Layer 1 + Layer 8
skill                           ← Layer 1
skill-filesystem                ← Layer 1 + Layer 8
skill-badge                     ← Layer 1
goal                            ← Layer 1
compaction-basic                ← Layer 1 + Layer 8
command-compact                 ← Layer 1 + Layer 8
permission-presets              ← Layer 1
user-approval                   ← Layer 1
user-questions                  ← Layer 1
jobs-local                      ← Layer 1
workflow-worker-thread          ← Layer 1 + Layer 8
credentials-local               ← Layer 1
settings-file                   ← Layer 1
token-meter                     ← Layer 1
web                             ← Layer 1
web-search-deepseek             ← Layer 1
webserver                       ← Layer 2 ← Layer 3 (port: 5300)
frontend-static                 ← Layer 2
apiproxy                        ← Layer 2
plugin-inventory                ← Layer 2
directory-picker-*              ← Layer 2
client-connection               ← Layer 2
client-hmr                      ← Layer 2
client-modules                  ← Layer 2
client-runtime                  ← Layer 2
client-ui-* (40+)               ← Layer 2
client-locale                   ← Layer 2
storage                         ← Layer 2
storage-domain                  ← Layer 2
storage-json                    ← Layer 2
code-runtime-worker-thread      ← Layer 2
agent-presets (default: standard) ← Layer 2
api-remotes                     ← Layer 2
workspace                       ← Layer 2
mcp-redis-production            ← Layer 5 (--patch)
persona                         ← Layer 8 (preset)
agent-instructions              ← Layer 8 (preset)
plan-mode                       ← Layer 8 (preset, group: planning)
tool-result-pruner              ← Layer 8 (preset, group: compaction)
tool-subagent-fork              ← Layer 8 (preset, group: delegation)
tool-workflow                   ← Layer 8 (preset, group: delegation)
tool-ralph                      ← Layer 8 (preset, group: delegation)
tool-ask-user                   ← Layer 8 (preset)
```

---

## 五、组装代码路径

```
profile-boot.ts composeProfile()
  │
  ├─ bundlePatches = profile.layers.flatMap(layer => layer.patches)
  ├─ homePatches = loadOptionalPatches(homePatchPath())
  ├─ overlays = patchFiles.flatMap(file => loadOverlayPatches(file))
  │
  ├─ composeEntries([bundlePatches, profile.patches, homePatches, overlays])
  │   → 构建 id → row 索引
  │
  ├─ 注入 agent-presets shipped root
  ├─ 注入 telemetry switch
  │
  └─ allPatches(composed) → boot(rootConfig, allPatches)
```

---

## 六、HMR 热重载

编辑 `cordis.patch.yml` 时的实时重组：

```
用户编辑 profile cordis.patch.yml
  │
  ├─ watchUserPatches() 检测文件变化
  ├─ 重新读取 patch 文件
  ├─ composeLive() 重新组合所有层
  ├─ structuredClone() 克隆（防止 insert 引用污染）
  └─ 重新 apply → 插件树更新
```

**关键**：`composeLive` 用 `structuredClone` 克隆 patch 对象，因为 include 插件把 `insert` 行按**引用** push 进插件树，后续 id-targeted patch 会就地修改这些对象。不克隆会污染 bundle 内存态。

---

## 七、常见操作对照

| 操作 | Layer | 文件 | 语法 |
| :-- | :-- | :-- | :-- |
| 添加基础能力 | 1 | `packages/bundle/base/cordis.patch.yml` | `- insert: [...]` |
| 添加 Web UI | 2 | `packages/bundle/web-app/cordis.patch.yml` | `- insert: [...]` |
| 覆盖端口 | 3 | `.dsh/profiles/web/cordis.patch.yml` | `- id: webserver, config: { port }` |
| 覆盖模型 | 4 | `$DSH_HOME/cordis.patch.yml` | `- id: agent-default-model, config: { provider, model }` |
| 添加 MCP | 5 | `--patch redis.yml` | `- insert: [{ id, name, config }]` |
| 禁用遥测 | 6 | 环境变量 | `DSH_TELEMETRY_DISABLED=1` |
| 添加企业插件 | 5 | `--patch enterprise.yml` | `- insert: [{ id, name, config }]` |
| 自定义 preset | 8 | `~/.dsh/.agent-presets/<id>/agent.cordis.yml` | 同标准 preset 格式 |
