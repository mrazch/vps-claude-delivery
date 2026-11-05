---
name: vps-claude-delivery
description: 引导客户预检 Claude 使用条件、部署或复用兼容 VPS、接入电脑和手机、验证实际回复，并在 Agent 掉线时离线恢复和续接。用于此交付包的设备选路、人工操作引导与进度交接。
---

# VPS 与 Claude 远程交付

如果用户在切换中断网或 Agent 掉线，优先打开本地 [恢复指南](guides/recovery.md) 恢复原连接。原业务样本确认可用后再续接。

收到 GitHub 发布入口时，先定位该 Release 的标签，从该标签读取仓库根目录的 `SKILL.md`。同一会话中的指南和脚本都从同一标签读取。已有本地副本时，从包含本文件的目录开始。电脑选 Windows 或 Mac，手机选 iPhone 或 Android。Mac 使用手动分支，安装材料可用 `scripts/mac/download_karing.py --download` 在客户设备获取；Karing 握手失败或切换后掉线时读取 [Mac 故障处理](guides/mac-troubleshooting.md)。组合状态见 [README](README.md)，操作顺序见 [客户操作与反馈单](docs/windows-iphone-field-test.md)。各组合按 README 记录的状态提供指引。

## 根据 Agent 能力执行

- 能运行客户本地工具时，使用同版目录下的 `scripts/`。脚本启动前先确认当前步骤和客户授权，凭据输入留在客户设备。
- 只有聊天能力时，按 `guides/` 每次只给客户当前一步、期望结果和停止条件。请客户回报脱敏结果，进度可记在本地文件或纸面。

## 先问什么

- 确认电脑系统和架构、手机系统、现有 VPN、是否有安装授权，以及 VPS 是否可复用。Windows 已有本地工具时，按 [Windows 指南的安装前检查](guides/windows.md#切换前) 识别架构并核对下载的安装包。约定 Windows 直连样本、目标应用和要验 Claude 回复的设备。
- 购买前确认客户的实际使用地点符合 [Claude 支持地点](https://support.claude.com/en/articles/8461763-where-can-i-access-claude)及[账号使用条件](https://support.claude.com/en/articles/8114491-get-started-with-claude)，能使用本人账号登录，并能从官方渠道获取客户端。条件未确认时暂停采购。
- 客户本人完成购买确认、登录、扫码、系统授权和付款。逐项说明动作、影响和恢复办法。账号清理单独评估，先备份再确认具体范围。

## 交付顺序

1. **预检。** 记录设备、版本、拟用节点、验收范围和下一步。先核对兼容节点能否复用。节点不兼容或证据不足时，把原因和选项交给客户决定。
2. **VPS。** 新节点统一使用 Xray／VLESS＋REALITY＋Vision，外层 TCP。先读 [VPS 指南](guides/vps.md) 准备恢复，检查 443 的监听与两层防火墙，再按握手证据决定实际端口。单独保存分配结果、服务读回、客户端握手、出口核验。每台设备用独立凭据，规则与凭据分开。有本地工具时可按 [节点材料指南](guides/materials.md) 生成 Windows 路线材料。Mac 由节点所有者按 [Mac 手动指南](guides/mac.md) 准备独立 Mac 身份。客户自己填入凭据，Agent 只读脚本返回的状态。
3. **准备恢复，再接入电脑。** 客户先保存 [恢复指南](guides/recovery.md)，记录原网络入口并确认手动恢复顺序。Windows 按 [Clash Verge 指南](guides/windows.md)，Mac 按 [Karing 指南](guides/mac.md)。分别核对直连样本、目标应用实际路径、Agent 通信和重启。
4. **独立接入手机。** iPhone 按 [Shadowrocket 指南](guides/iphone.md)，Android 按 [v2rayNG 指南](guides/android.md)。导入对应设备的专属二维码并授权，分别验 Wi-Fi、蜂窝和重连。电脑和手机各有自己的验收结果。
5. **Claude。** 在预先约定的设备上由客户在官方 App 或网页登录，发送一句测试消息并收到回复。只记录通过与否。订阅的订单与权益另行确认。
6. **交接。** 确认本地恢复入口随时可打开。有掉线或操作失败时先恢复并留下脱敏摘要，换 Agent 从首个卡点继续。节点、设备或环境发生变化时只重验受影响的步骤。

## 如何保存进度

- Windows 分支的 Agent 可使用本地工具时，先读 [客户本地进度](README.md#客户本地进度)，运行 `node scripts/progress.cjs --customer status` 查当前阶段。Windows＋Android 的预检命令在 Claude 验收设备之后加 `android`。根据客户已完成的检查调用 `record`、`pass` 或 `fail`。只能保存已经报告的结果。遇到掉线先按恢复指南操作，客户确认原业务恢复后再用 `restore` 记录并重验中断的阶段。合成演练使用不带 `--customer` 的独立记录。
- 按 [反馈模板](docs/windows-iphone-field-test.md#4-客户反馈模板) 保存发布标签、设备组合、当前步骤、检查结论、失败类型和下一步。Mac 手动分支或只有聊天能力时，客户在本地文件或纸面填写。客户换 Agent 时可提供这些摘要。下载和准备恢复文件应在切换网络之前完成。
- 分别标记「离线模拟」「已有个人实测」「客户实际操作结果」。只把对应步骤的证据计入当前交付。客户凭据、节点链接、真实配置、账号信息和原始诊断留在客户设备或 VPS。开发会话只用合成数据和离线验证。
