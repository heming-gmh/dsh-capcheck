# DSH 插件生态能力面全景图 —— V0 试点扫描报告

> 扫描时间：2026-08-19T07:48:07.552Z　·　scanner: dsh-capcheck v0.1.0（零执行、纯静态分析）

## 方法论（诚实说明局限）

- **信号 A**：编译产物里的结构化 inject 声明（static inject = [...] / const inject = [...] + 具名导出）——最高置信度。
- **信号 B**：<ctx-or-context 标识符>.<敏感属性名> 的裸成员访问——较低置信度，仅在对象字面量确实是 ctx/context 时才计入（首版曾误判 client.shell(...) 为 ctx.shell，已修复，见下）。
- **信号 C**：package.json 的 dependencies/peerDependencies 交叉比对分级表。
- **能力分级表**：data/capability-tiers.yaml，人工登记，默认失败态是 unknown（拒绝默认安全）。
- **本轮范围**：本地 4 个官方包 + 15 个真实 npm 已发布社区插件（从 24 个候选名单中确认可用）+ 25 个 GitHub 仓库直接抓取的对照组。不是 README 承诺的全量 1258 个索引插件——先用这批验证规则，再决定要不要全量跑。

## 工程日志：V0 实测中真实暴露的 3 个问题（诚实记录，而不是只报喜）

1. **GitHub 仓库源码 不等于 实际安装的产物**：直接对 GitHub 仓库跑（25 个样本），13/25（52%）扫描失败，因为 lib/index.js 是构建产物，很多仓库根本没提交到 git（只在发布时打进 npm tarball）。这与上一轮我们讨论的 dsh-provenance 核心论点（你在 GitHub 看到的源码不等于你装的代码）互相印证。修复：改成 npm pack 拉取真实发布的 tarball 再扫描，而不是抓 GitHub 仓库内容。
2. **main/exports 字段不统一**：切到 npm tarball 后，15 个包里仍有 6 个看起来干净其实是入口文件解析失败被静默吞掉——很多社区插件只声明 exports（字符串 / 对象里 . 键是字符串 / 对象里 . 键是 import/default 条件对象，三种形状都有），完全没有 main 字段。修复：实现了遵循 Node 解析优先级的 resolveEntryFile()，成功率从 9/15 提到 14/15（唯一失败的 petdex 是真的两个字段都没声明）。
3. **能力分级表最初按 npm 包名登记，但 inject 数组里放的是裸服务名**（如 approval 而非 dsh-user-approval），导致官方包自己都大量误报 unknown。修复：补充了裸服务名区块，用真实扫描结果反推缺失的登记项。

这三个问题都是只有真正跑起来对着真实代码测才会暴露的坑，也印证了方案设计时的判断：这类工具的护城河不在写个 AST 解析器这个技术动作本身，而在持续用真实数据校准规则这件苦活。

## 关键发现（按趣味/风险程度排序）

| 插件 | 发现 | 为什么值得注意 |
|---|---|---|
| dsh-ssh（第三方 SSH 插件） | 只声明 tools(HIGH)/webServer(MED)/systemPrompt(LOW)，从不触及 ctx.shell/ctx.sandbox/ctx.approval | 它的 SSH 执行走的是自己内置的 ssh2 库，完全绕开了 DSH 官方的 shell 沙箱和审批闸门——能执行远程命令的能力，对 DSH 自身的安全模型是不可见的。这正是「能力面披露」要解决的典型场景。 |
| dshmarket（插件市场） | 通过 ctx.inject(['loader'], ...) 拿到 cordis Loader 控制权 | Loader 是能启用/禁用/重配置其它所有插件的元服务——一个市场类插件理论上可以静默启停别的插件，这是全表里权限最重的一类，值得单独建一档「元权限」分级。 |
| dsh-provenance / dsh-plugin-check / dsh-egress-guard（都是安全/体检类插件） | 全部都声明了 ctx.tools（HIGH） | 有点讽刺但很合理：做安全体检的插件自己也在注册新工具，说明「审查者也要被审查」不是一句空话，这类工具本身也该是能力面披露的扫描对象，而不是豁免对象。 |
| modlens | agents、attachments 两个服务查不到分级（unknown） | 视觉插件读取 agent 状态和附件是合理的，但恰好说明分级表覆盖度还不够，需要持续补登记，不能因为它是生态里最知名的插件（3000+ star）就默认信任。 |
| dsh-doctor | 声明依赖 connection 服务，未登记 | 同上，反映的是分级表维护滞后而非插件本身有问题——诚实地把这类归为 unknown 而不是瞎猜。 |

## 汇总表（15 个 npm 真实包 + 4 个本地官方包）

| 包 | Critical | High | Medium | Low | Unknown | 状态 |
|---|---:|---:|---:|---:|---:|---|
| dsh-permission-presets（官方） | 2 | 0 | 2 | 1 | 0 | 完成 |
| dsh-user-approval（官方） | 0 | 0 | 0 | 1 | 0 | 完成 |
| dsh-client-ui-theme（官方） | 0 | 0 | 0 | 1 | 0 | 完成 |
| dsh-credentials（官方） | 0 | 0 | 0 | 0 | 0 | 完成（基础服务，不消费其它能力，符合预期） |
| dsh-ssh | 0 | 1 | 1 | 1 | 0 | 完成 |
| dshmarket | 0 | 0 | 2 | 0 | 1 | 完成 |
| modlens | 0 | 1 | 1 | 2 | 2 | 完成 |
| dsh-visualize | 0 | 2 | 0 | 2 | 0 | 完成 |
| dsh-provenance | 0 | 1 | 0 | 0 | 0 | 完成 |
| dsh-plugin-check | 0 | 1 | 0 | 0 | 0 | 完成 |
| dsh-egress-guard | 0 | 1 | 0 | 0 | 0 | 完成 |
| dsh-budget | 0 | 0 | 1 | 0 | 0 | 完成 |
| dsh-doctor | 0 | 0 | 0 | 0 | 1 | 完成 |
| dsh-plugin-doctor / mnemon / dsh-lark / dsh-vision-router / upstream-radar | 0 | 0 | 0 | 0 | 0 | 完成（干净） |
| petdex | - | - | - | - | - | 入口不可解析，报告标注为不完整而非默认安全 |

## 下一步

1. 把这份报告里发现的未登记服务（connection / agents / attachments / desktopPnpm 等）补进 capability-tiers.yaml；
2. 把 npm-tarball 扫描路径扩大到 awesome-dsh-plugins 索引里 star 数 Top 200 的插件，验证规则在更大样本下的误报率；
3. 把这份报告（尤其是三个工程教训 + dsh-ssh/dshmarket 两个案例）整理成 PR，反哺 awesome-dsh-plugins 索引加一列能力分级——冷启动获客动作正式开始。
