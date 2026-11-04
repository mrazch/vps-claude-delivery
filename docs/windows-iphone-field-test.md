# 电脑＋手机客户操作与反馈单

记录日期 2026-11-05。开发侧已完成离线核对。这份方案由客户在实际接入时使用，每次只做当前一步。已有兼容节点优先复用。客户遇到卡点，按本页模板反馈，后续根据实际版本和现象修订。

## 1. 固定首测材料

| 对象 | 首测口径 | 已核对及待核对 |
| --- | --- | --- |
| 客户 VPS（确需新建时） | Linux x64 或 ARM64，systemd 环境，优先使用 Ubuntu 24.04 LTS。Xray v26.10.31，官方 Xray-install 固定提交，通过本地发行归档安装。 | 脚本和两个架构的摘要已记录。先核对实际架构、SSH 与供应商控制台、权限、端口和防火墙。独立发行签名和实际安装待验。[Xray 版本与摘要](../scripts/xray/upstream.json) |
| Windows | Clash Verge Rev v2.5.9 正常安装包，按客户电脑架构选 x64 或 ARM64。 | v2.5.9 官方发行说明列出 mihomo v1.19.33。核对的两份 Windows 安装包已与 GitHub 官方发行 API 的字节数和 SHA-256 对照一致。Authenticode 签名状态、安装后实际运行的内核版本待验。[官方发行说明](https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v2.5.9) · [官方资产元数据](https://api.github.com/repos/clash-verge-rev/clash-verge-rev/releases/tags/v2.5.9) |
| Mac | [Karing 手动指南](../guides/mac.md)适用于 Mac＋iPhone 或 Mac＋Android。 | macOS 版本、Karing 签名、握手及恢复由客户按实际设备确认。 |
| iPhone | 客户本人通过当前 App Store 获取的 Shadowrocket，现场记录 iOS 和客户端完整版本。 | 核对可获取性和 VPN 授权。商店显示版本供预检参考。实际导入、握手、出口和两种网络均待测。[官方商店页](https://apps.apple.com/app/shadowrocket/id932747118) |
| Android | v2rayNG 2.3.15 为离线候选，发行说明列出 Xray-core v26.10.31。 | 客户按设备选择官方发行文件，现场核对 APK 来源、导入、授权及双网络。[官方发行](https://github.com/2dust/v2rayNG/releases/tag/2.3.15) |

首轮方案采用已核对的 Clash Verge Rev v2.5.9。v2.5.10 有服务模式 GEO 数据及 DNS 覆写状态修复。如果首轮卡在对应问题，按 v2.5.10 的独立 Windows 版本组合复测，先核对官方资产和安装后内核版本。一次只改一个版本变量。[v2.5.10 发行说明](https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v2.5.10)

mihomo 文档说明上游不考虑与 Xray v26.7.11 及以后版本的 REALITY 兼容。v26.10.31 固定源码中，早期问题涉及的默认最低客户端版本赋值已被注释。因此把两个客户端的握手设为客户现场的首个验证点。若某端失败，先核对相同节点、独立身份、端口、服务名、Short ID 和客户端指纹，再区分 TCP 连不上、REALITY 握手失败、握手后无出口三种情况。服务端降级或改协议属于新的技术决策，须同时审查安全更新和交付范围。[mihomo REALITY 文档](https://wiki.metacubex.one/en/config/proxies/tls/#reality-opts) · [Xray 固定源码](https://github.com/XTLS/Xray-core/blob/v26.10.31/infra/conf/transport_security.go)

## 2. 客户预检和费用

客户操作前，确认 VPS、电脑和手机各自的权限与回退方法。

- **客户 VPS**。已有兼容节点时走复用。需要新建时，需能从供应商控制台独立恢复，先核对 SSH、资源权限、实际分配的 IP 和防火墙。如果需要购买，单独记录供应商官方价格、计费方式、费用上限和释放时间，由用户确认。
- **Windows 电脑**。记录系统、架构、可操作窗口和可回退方式，明确是否允许安装、启用 TUN 和重启。
- **Mac**。记录 macOS、芯片、Karing 版本、操作窗口与原连接恢复方式。
- **手机**。记录 iOS 或 Android、客户端、Wi‑Fi 和蜂窝能否测试，由用户完成扫码和 VPN 授权。Claude 账号使用条件和计划验收设备须在购买前确定。[Claude 支持地点](https://support.claude.com/en/articles/8461763-where-can-i-access-claude) · [Claude 入门](https://support.claude.com/en/articles/8114491-get-started-with-claude)

## 3. 执行顺序与放行证据

| 顺序 | 动作 | 必须留下的最小证据 |
| --- | --- | --- |
| 1. 原状态与恢复 | 备份两个设备的原状态，保存三份手册与恢复卡。确认能通过独立入口访问 VPS 控制台，并离线打开恢复材料。 | 基线样本结果、恢复入口已打开、接下来允许的动作。 |
| 2. VPS 预检 | 按 [VPS 指南](../guides/vps.md) 区分新建和复用。新建先评估 TCP 443，查看占用、主机和云防火墙、SSH 管理端口。复用先确认协议、两端兼容及按设备新增和撤销的能力。 | 记录客户节点别名、实际选择端口和原因。预检不通过时保留现有状态。 |
| 3. VPS 安装与读回 | 客户确认新建时，在本人授权的新 VPS 上使用固定脚本与对应架构归档。复用分支跳过安装，核对现有服务和两端兼容即可。先分别计算并比较 SHA-256，再用官方脚本的 `install --local` 分支。安装脚本可能安装缺失依赖并写入服务。先私下准备两份独立设备身份和 REALITY 配置，可用 [节点材料指南](../guides/materials.md) 本地生成，校验配置后再启用本次监听。 | Xray 实际版本、服务状态、监听 TCP 端口、两层防火墙的结论、两个设备身份已独立。错误只记分类和下一步。 |
| 4. 两端先验互通 | 电脑与所选手机依次用各自的材料进行真实握手与出口检查。Windows 可用当前新节点的单次显式代理检查隔离协议问题，该结果只用于这一关。手机用该设备独立二维码，在约定网络上验证握手和出口。 | 两端各有一条「握手成功、出口一致」记录。握手失败时先停在此处，保留旧接入。 |
| 5. 电脑日常分流 | Windows 按 [Clash Verge 指南](../guides/windows.md)，Mac 按 [Karing 指南](../guides/mac.md)。用普通应用核对直连样本、VPS 出口、目标应用链及 Agent 通信。重启后复验。 | 分别记录直连、应用实际路径、Agent 回复和重启后自动恢复。 |
| 6. 手机双网络 | 按 [iPhone](../guides/iphone.md) 或 [Android](../guides/android.md) 指南在仅 Wi‑Fi、仅蜂窝分别核对出口和重连。 | 两张网络各有独立记录。 |
| 7. Claude 实际回复 | 客户本人在约定设备的官方 App 或网页登录，发送测试消息并收到新回复。 | 每台约定设备记录所测入口、是否收到回复。付费与权益分开。 |
| 8. 掉线与交接 | 保存 [离线恢复指南](../guides/recovery.md) 和本地进度摘要。实际遇到 Agent 不可用或网络异常时，客户先按指南恢复，换 Agent 从原业务已恢复的位置续接。 | 记录本地恢复材料是否可用。发生实际回退时另记原业务复验结果和下一步。 |

### 安装前核对

Windows 上对照官方资产的文件名、字节数和摘要，再检查 Authenticode。GitHub 的 tag 签名验证与 Windows 安装器的 Authenticode 各自记录。签名异常或来源不一致时，先停在校验阶段。

x64 和 ARM64 的文件名、字节数与 SHA-256 在 [Windows 发行清单](../scripts/windows/release.json)。Agent 有本地工具时，按 [Windows 指南](../guides/windows.md#切换前) 调用只读检查。手动核对可对所选本地文件运行 PowerShell 的 `Get-FileHash -Algorithm SHA256 -LiteralPath '<本地安装包路径>'`，再与清单中的对应架构比较。

在客户已授权的新 VPS 比较 [脚本与归档 SHA-256](../scripts/xray/upstream.json)。该版本的官方安装脚本在缺少归档的 `.dgst` 文件时会继续，因此必须先用 `sha256sum` 对照清单。保留发行归档内默认数据文件。服务端启用前先用对应版本的配置检查入口确认语法。含服务端私钥的配置留在客户 VPS，客户端拿各自的连接材料。[固定版官方安装脚本](https://github.com/XTLS/Xray-install/blob/04e6f3bd9534811ed901a48c47b2c042dd64eb3a/install-release.sh)

## 4. 客户反馈模板

每一关填「待执行 / 通过 / 失败 / 已恢复」。复用节点和新建节点分开填写。某一关结果未知时，先补证据再继续。

| 环境别名 | 时间与时区 | 检查项 | 当前结果 | 脱敏证据 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 本机留存 | 本机留存 | 例如 Windows 应用路径 | 待执行 | 例如连接命中指定节点 | 复验重启 |

实际 IP、节点链接、UUID、私钥、真实配置和原始诊断留在设备或 VPS。Windows 分支可用 [客户本地进度](../README.md#客户本地进度) 保存固定类别的客户报告。Mac 手动分支或没有本地工具时，使用本地文件或纸质表。

出现问题时先记最后一个通过的步骤，再按失败点处理。如果原连接受到影响，先按恢复指南恢复，再发反馈。

| 可发给维护者或下一位 Agent | 填写示例 |
| --- | --- |
| 交付版本、设备和客户端版本 | 发布标签，Windows 架构和 Clash Verge Rev／mihomo 版本，或 macOS 芯片与 Karing 版本，或手机系统与 Shadowrocket／v2rayNG 版本 |
| 卡点、最后通过的步骤 | Windows 能握手，启用 TUN 后国内样本打不开 |
| 网络和现象 | Wi-Fi 或蜂窝，发生时间与时区，一句脱敏报错 |
| 当前状态 | 是否已恢复原连接，原业务样本是否可用 |

维护时按卡点分别核对 TCP 可达、协议握手、出口、分流、应用登录和回复。保留同一发布版的记录，每次只调整一个相关项。客户复验通过后，再更新对应说明或候选版本。
