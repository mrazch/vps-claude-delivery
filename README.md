# VPS 与 Claude 远程交付

**本仓库维护一个 Skill `vps-claude-delivery`。** 入口是根目录的 [SKILL.md](SKILL.md)。按顺序推进 Windows＋iPhone、Windows＋Android、Mac＋iPhone、Mac＋Android。前两条 Windows 路线已做离线验证。客户操作时逐项确认实际结果，遇到问题按反馈修订。

## 从这里开始

- **使用 Agent**。把正式发布的 GitHub 入口交给 Agent。Agent 先确定发布标签，读取同一标签下的 `SKILL.md`，再按需读取指南或调用脚本。本地审阅直接从上面的 `SKILL.md` 开始。
- **手动操作**。电脑选 [Windows 指南](guides/windows.md) 或 [Mac 手动指南](guides/mac.md)。手机按实际设备选 [iPhone](guides/iphone.md) 或 [Android](guides/android.md)。开始前保存对应设备指南和 [恢复指南](guides/recovery.md)。
- **准备节点材料**。按 [VPS 指南](guides/vps.md) 判断复用或新建。Windows 分支有本地工具时，按 [节点材料指南](guides/materials.md) 生成 Windows 配置和本次手机的独立二维码。Mac 按 [手动指南](guides/mac.md) 准备节点。

| 设备组合 | 本项目状态 |
| --- | --- |
| Windows＋iPhone | 首条方案已准备，离线验证通过，客户使用反馈待收集 |
| Windows＋Android | 已接入同一 Skill，离线验证通过，客户设备待验收 |
| Mac＋iPhone | 手动方案已备，待客户验收 |
| Mac＋Android | 手动方案已备，待客户验收 |

## 客户本地进度

Windows 电脑已有 Node.js 24 且 Agent 能运行本地工具时，从同一个固定版本文件夹执行。Mac 手动分支使用本地脱敏反馈表。每位客户使用独立文件夹。实操和演练的记录分开保存。

~~~powershell
node scripts/progress.cjs --customer status
node scripts/progress.cjs --customer checks
~~~

| 需要做什么 | 命令 |
| --- | --- |
| 记下本阶段已确认的部分 | `--customer record <修订号> <阶段> <检查项[,检查项]>` |
| 确认本阶段所有检查完成 | `--customer pass <修订号> <阶段> <所有检查项>`。预检填 Claude 验收设备，Android 再加手机参数。VPS 最后填 `new` 或 `reuse`。 |
| 记下阻碍 | `--customer fail <修订号> <阶段> <原因>` |
| 确认原连接已恢复 | `--customer restore <修订号> <阶段>`。先按 [恢复指南](guides/recovery.md) 手动恢复并验证原业务，再记录。 |
| 标记需要重新验收的对象 | `--customer invalidate <修订号> <environment\|node\|windows\|iphone\|android>` |

上表各命令前加 `node scripts/progress.cjs`。阶段、检查项和失败类型从 `checks` 获取。每次读 `status` 的 `revision` 和 `next` 再记进度。脚本只保存预设类别，结果标记为客户报告。断线后换 Agent 时，在同一文件夹运行 `--customer status`。报告已恢复后，应重新验证本次中断阶段的检查。

Android 预检在 Claude 验收设备之后加 `android`。下例约定在 Windows 和 Android 上分别确认 Claude 回复，`0` 适用于刚开始的记录。

~~~powershell
node scripts/progress.cjs --customer pass 0 preflight 'device-inventory,account-eligibility,scope-reviewed' 'claude-windows,claude-android' android
~~~

客户记录保存在该文件夹的 `runtime/customer-progress/`，需要支持硬链接的本地文件系统，例如 Windows NTFS。操作没有写入权限或设备上没有可用本地工具时，使用 [纸面或本地脱敏反馈表](docs/windows-iphone-field-test.md#4-客户反馈模板)。

## 离线验证和续接

使用已具备的 Node.js 24。从同一个固定版本的本地文件夹打开 PowerShell。脚本接收合成证据，仅在仓库下的 `runtime/progress/` 保存进度。

~~~powershell
node scripts/progress.cjs checks
node scripts/progress.cjs status
node scripts/progress.cjs pass 0 preflight 'device-inventory,account-eligibility,scope-reviewed' 'claude-windows,claude-iphone'
node scripts/progress.cjs status
~~~

上面的 `0` 是刚开始时的修订号。后续每次操作用 `status` 返回的最新 `revision` 和 `next`。节点复用与新建分别记录为 `reuse` 和 `new`，作为 `vps` 阶段最后一个参数。可以用 `fail <修订号> <阶段> <失败原因>` 保存可重试失败，或用 `invalidate <修订号> <environment|node|windows|iphone>` 重新验收受影响的步骤。预检只选需要验证实际回复的 Claude 设备，Windows 和 iPhone 的接入仍各自验收。

Agent 断线后，换 Agent 在同一个文件夹运行 `status`。若刚才那次操作的结果不明，以原修订号和同一内容重试即可识别已保存的记录。若显示冲突，先重新读取进度再选择下一步。进度记录采用本地支持硬链接的文件系统，例如 Windows NTFS。请勿手改或单独删除事件文件。

本项目维护一个 GitHub 仓库。新客户从固定的最新发布页进入，同一版的 `SKILL.md`、`guides/`、`scripts/` 和版本记录使用同一发布标签。正在交付的客户沿用已经记录的标签。版本切换前保留旧版和进度备份。[GitHub 发布链接说明](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)

## 客户操作与反馈

从 [电脑＋手机客户操作与反馈单](docs/windows-iphone-field-test.md) 开始。它列出了每一步要做什么、失败时停在哪，以及怎么把现象交给下一位 Agent。

客户使用自己的设备和经本人授权的 VPS。先检查已有兼容节点能否复用，确需新建时再确认费用与权限。两端各自验证握手和出口，再按约定核对电脑分流、手机双网络和 Claude 回复。Windows 或手机出现异常时，优先恢复原连接并记下卡点。当前候选与上游兼容说明见 [Xray 离线契约](scripts/xray/README.md)。

## 版本记录

| 版本 | 内容 |
| --- | --- |
| v0.1.0 | `vps-claude-delivery`。Windows＋iPhone、Windows＋Android 两条路线，含 VPS 指引、Windows 只读预检、设备材料生成、本地进度及恢复。Mac＋iPhone、Mac＋Android 共用 Karing 手动指南，待客户验收。设备实际结果按客户现场反馈记录。 |
