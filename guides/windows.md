# Windows 手动接入与验收

首条路线使用 Clash Verge Rev 的 mihomo 内核，通过 TUN 接收应用流量。国内和局域网样本按交付规则直连，海外及未分类流量按规则走指定 VPS。服务端使用 Xray，节点使用 VLESS＋REALITY＋Vision，外层为 TCP。以下是首轮客户操作手册，实际结果按客户的设备、版本和网络分别记录。

```text
Windows 应用 → mihomo TUN → 匹配分流规则
                              ├─ 局域网、国内命中规则 → DIRECT
                              └─ 指定服务、海外和兜底 → 交付节点 → VPS 出口
```

## 切换前

1. 在采购 VPS、付费客户端或登录 Claude 前，用官方页面确认实际使用地点、账户条件、年龄要求和所选客户端的兼容性。实际使用地点须在支持范围内。把出口放到支持地区不会改变实际使用地点。条件不满足时，停下 Claude 接入和相关采购。登录、验证码和付款由账户持有人自己完成。[Claude 入门](https://support.claude.com/en/articles/8114491-get-started-with-claude) · [Claude 支持地点](https://support.claude.com/en/articles/8461763-where-can-i-access-claude)
2. 先完成[离线恢复准备](recovery.md#切换前填写恢复卡)。确认手边有旧配置、原有设置记录和恢复步骤。保留原客户端及配置。首次切换前约定测试窗口，以及出现什么情况就回退。
3. 在 Windows「设置」的系统信息中核对系统类型，取得与架构匹配、已经过交付核对的 Clash Verge Rev 安装包。版本、随包内核、摘要和可用签名须按交付记录确认。首版候选发行版为 v2.5.9，核对实际启动的内核后再确认本次使用的组合。客户端版本不同，界面文字和授权步骤也可能不同。[Clash Verge Rev 官方发行](https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v2.5.9)
4. 如果电脑已有 Node.js 24，Agent 可从交付文件夹运行 `node scripts/windows/preflight.cjs` 查看架构和应选安装包。取得安装包后，运行 `node scripts/windows/preflight.cjs --installer '<本地安装包路径>'` 核对文件名、字节数和 SHA-256。仅传本地文件，另用 Windows 原生方式检查签名。只有聊天能力时，可在 Windows 设置核对架构，并按 [客户操作单](../docs/windows-iphone-field-test.md#安装前核对) 手动核对摘要。
5. 等服务端已有实际读回结果，并取得 Windows 独立配置和交付规则。有本地工具时可按 [节点材料指南](materials.md) 生成。复用现有节点时，同样核对协议、配置兼容性以及新增 Windows 独立身份的能力。通过安全方式将材料保存到本机，导入之前不要用它替换原配置。

mihomo 官方文档说明，其 REALITY 实现不考虑 Xray v26.7.11 及以后版本的兼容。Clash Verge Rev v2.5.9 是客户端候选，须用固定的服务端和内核版本先验证实际握手。正式版本还要考虑服务端安全更新。[mihomo REALITY 兼容说明](https://wiki.metacubex.one/en/config/proxies/tls/#reality-opts)

## 手动操作

1. 用原生安装程序安装并打开客户端。将交付配置作为新配置导入，给配置和节点起便于辨认的本地名称。按交付记录在本机核对地址与端口、设备自己的 UUID、TCP、`xtls-rprx-vision`、REALITY 服务名、公钥、Short ID 和约定的客户端指纹。Windows 仅需要客户端字段，服务端私钥留在 VPS。[mihomo VLESS 字段](https://wiki.metacubex.one/en/config/proxies/vless/)
2. 在客户端选择刚导入的配置和预期节点，将运行模式设为规则模式。确认活动规则包含需要走 VPS 的服务、批准直连的国内和局域网样本以及走 VPS 的兜底。规则按先后匹配，目标服务若被更早的直连规则截获，应先纠正交付规则，再继续。[mihomo 路由规则](https://wiki.metacubex.one/en/config/rules/)
3. 进入批准的切换窗口。在原客户端内暂停可能接管流量的功能，再启用新客户端的 TUN。需要辅助服务或 Windows 授权时，先核对提示来自本次官方客户端，再由用户批准。系统代理按本路线在试运行时保持关闭。核对客户端显示的活动配置、节点、规则模式及 TUN 状态，另到 Windows 代理设置确认系统代理已关闭。项目约定的原设置以恢复卡为准。[Clash Verge Rev Windows 说明](https://www.clashverge.dev/faq/windows.html) · [mihomo TUN 字段](https://wiki.metacubex.one/en/config/inbound/tun/)
4. 按下表逐项验收。通过后，如本次交付需要重启后自动恢复，才在客户端内配置启动与 TUN 恢复，并完成重启复验。遇到服务、授权或路由失败，按[离线恢复手册](recovery.md#windows-恢复)回到切换前的状态。

## 应用路径和实际回复

测试时用客户端的连接页查看新产生的流量。记录测试动作的时间、应用、目标、命中规则和实际节点。版本能够提供进程信息时一并核对。如果连接很短，打开连接视图后重新触发一次。已有的本地只读接口也可取连接证据，接口无需为验收改为对外监听。[mihomo Connections API](https://wiki.metacubex.one/en/api/#connections)

| 验收项 | 操作与通过证据 |
| --- | --- |
| 国内直连 | 用普通浏览器打开约定的国内样本，页面成功加载，同一时段该目标连接链为 `DIRECT`。需要验证局域网时另测约定的本地资源。 |
| 海外与兜底 | 用普通浏览器打开约定海外样本，再打开会落到兜底的样本。分别核对真实命中和节点链。通过约定走 VPS 的出口检查地址比较预期出口，只在本地比较，回执记一致或不一致。 |
| Claude 应用路径 | 选定官方桌面 App 或浏览器网页，重新打开或发起新请求。把当时 Claude 连接的时间、目标和可见应用信息，与预期节点链对应起来。单独记录是哪一种客户端。无法关联连接则记路径未证实。 |
| Claude 实际使用 | 用户登录后发送一条无个人信息的短消息，等 Claude 返回新回复。记实际收到回复、时间和所测客户端。若要求桌面端和网页分别交付，就分开测试。订阅和扣款单独记录。 |
| Agent 通信 | 通过正在交付的 Agent 发一条新的测试消息，确认能收到答复。通信中断时按恢复卡处理，并把结果另记为失败或待验证。 |
| 整机重启 | 在已约定的自动恢复配置下重启 Windows，登录后先观察活动配置、节点、规则模式和 TUN 是否自动恢复，再重复直连、VPS 出口与 Claude 回复检查。如果手动打开或修正后才通过，分别记录自动恢复失败和手动恢复结果。 |

延迟数字、客户端开关、显式指定本地代理的请求，各自只能证明该检查本身。整条路线以普通应用触发时的节点链、出口样本和实际回复分别记录。测试有缺项就保留待验，单次样本覆盖范围以当时设备、应用和网络为准。
