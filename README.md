# dsh-capcheck 🔍

**装一个 DSH 插件之前，先看清楚它到底摸得到你机器上的什么 —— 零执行静态扫描，几秒出结果。**

## 30 秒看懂：这是真扫出来的，不是假设

```
$ node bin/cli.js <本地已装的 dsh-ssh 插件目录>

  [HIGH]  tools        (declared=true)
  [MEDIUM] webServer   (declared=true)
  [LOW]   systemPrompt (declared=true)
```

> ⚠️ 这个插件从头到尾没有声明或引用 ctx.shell / ctx.sandbox / ctx.approval —— 它的 SSH 远程命令执行走的是自己内置的 ssh2 库，完全绕开了 DSH 官方的审批闸门和沙箱。能执行远程命令这件事，对 DSH 自身的安全模型是不可见的。这正是 dsh-capcheck 存在的理由。

## 真实扫出来的发现（生态里已发布的插件，不是玩具样例）

- **dsh-ssh**：如上，远程命令执行能力对官方沙箱/审批完全隐身。
- **dshmarket**（插件市场）：通过 ctx.inject(['loader'], ...) 拿到 cordis Loader 控制权——理论上能静默启停机器上任何其它插件，是目前扫到的权限最重的一类。
- **dsh-provenance / dsh-plugin-check / dsh-egress-guard**（都是安全/体检类插件）：全部都在注册新的 agent 工具——审查者也要被审查，不是一句空话。

完整方法论、全部扫描数据、工程踩坑记录见 reports/ecosystem-capability-landscape-v0.md

## 装它 / 用它

作为命令行工具：

```sh
node bin/cli.js <本地插件目录>                 # 扫一个已经装在本机的插件
node bin/batch-npm.js <npm包名>                # 扫真实发布的 npm tarball（推荐，见下）
```

作为 DSH 插件（让 agent 直接帮你查）：

```sh
dsh plugin --profile web add dsh-capcheck
```

装好后直接问模型：帮我用 dsh_capcheck 查一下这个插件装了会摸到什么。已做过端到端真实验证——模型真的调用了工具并给出结构化报告，见下方已知局限之前的验证记录。

## 为什么需要这东西

DSH 的 cordis 插件就是普通 Node 模块，直接跑在宿主进程里，没有任何权限沙箱——官方自己的文档写着：把动态插件当成 bash access 来对待。也就是说，装一个插件，理论上它就能摸到你的 API Key、执行命令、绕过审批。dsh-capcheck 在你按下安装键之前，先告诉你这个插件实际声明/引用了哪些敏感能力。

## 它怎么查（三路信号，按可信度从高到低）

1. **结构化声明**：cordis 插件框架自带的 inject 数组（static inject = [...]），这是官方依赖注入机制强制要求的，最可信。
2. **裸成员访问**：代码里 ctx.credentials / ctx.shell 这类直接访问，只认字面上是 ctx/context 的对象（已修过一个真实误判：某插件里 client.shell(...) 是第三方 ssh2 库自己的方法，跟 ctx.shell 无关）。
3. **package.json 依赖**：不用下载代码，扫依赖声明就能先粗筛一轮。

三路信号都要对照一张可维护的能力分级表（data/capability-tiers.yaml）——查不到的服务一律标 unknown，绝不默认安全。

## 已知局限（真跑出来才发现的坑，写在这里而不是藏着）

1. GitHub 仓库源码常常不是实际安装的代码——很多插件的构建产物只在发布时打进 npm tarball，没提交到 git；直接扫 GitHub 仓库在实测样本里 52% 失败。优先用 bin/batch-npm.js（扫真实 tarball），GitHub 扫描仅作对照。
2. main/exports 字段不统一：很多社区插件只声明 exports（三种不同形状），已实现兼容解析（src/resolve-entry.js）。
3. 裸成员访问是启发式，不是证明：只能识别未经改名/解构的 ctx.xxx 直接访问。
4. 能力分级表需要持续维护：目前只覆盖官方包 + 少数知名第三方服务，其余一律 unknown。
5. 还没有动态验证（V1 计划中）：一个存心作恶的插件可以不声明 inject，靠间接引用绕过静态扫描，只有真正加载运行时用 Proxy 记录实际访问才能抓到这类规避。

## 目录结构

```
src/extract-inject.js   acorn 静态分析（信号 1+2）
src/resolve-entry.js    package.json main/exports 解析
src/tiers.js            能力分级表加载
src/scan-package.js     扫本地已装目录
src/scan-npm.js         扫真实发布的 npm tarball（推荐）
src/scan-remote.js      扫 GitHub 仓库内容（已知不可靠，见上）
src/plugin.js           DSH/cordis 插件外壳，注册 dsh_capcheck 工具
bin/cli.js / batch.js / batch-npm.js   命令行入口
data/capability-tiers.yaml   能力分级表（持续维护的核心资产）
reports/                 生态扫描报告
```

## 现状

V0 试点。本地验证 4 个官方 @deepseek-ai/dsh-* 包，真实 npm tarball 验证 14/15 个已发布社区插件（唯一失败的 petdex 因为 package.json 既无 main 也无 exports，报告里诚实标记为不完整而非默认安全）。

## License

MIT
