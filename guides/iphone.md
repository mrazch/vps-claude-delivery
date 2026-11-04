# iPhone 手动接入与双网络验收

首条路线通过 Shadowrocket 导入本机专属的 VLESS＋REALITY＋Vision 节点，外层为 TCP。节点二维码和手机分流规则分别交付。客户在自己的设备和获准的网络上逐项操作，并分别记录 Wi-Fi 和蜂窝的结果。

```text
iPhone 专属节点码 → Shadowrocket → 用户批准 VPN → 选中专属节点和规则
                                                     ├─ 仅 Wi-Fi → 路径、出口、回复
                                                     └─ 仅蜂窝   → 路径、出口、回复
```

## 切换前

1. 在采购 VPS 或 Shadowrocket、登录 Claude 前，核对实际使用地点和 Claude 官方账户条件。再在自己的 App Store 查看 Shadowrocket 是否可获取、价格和所需 iOS 版本。Claude App 另查官方要求，符合条件时也可选择官方网页。店面能下载和服务允许使用应分别确认。账户登录、验证码及支付由用户自己完成。[Shadowrocket 官方商店页](https://apps.apple.com/app/shadowrocket/id932747118) · [Claude 支持地点](https://support.claude.com/en/articles/8461763-where-can-i-access-claude) · [Claude 入门](https://support.claude.com/en/articles/8114491-get-started-with-claude) · [Claude iOS 安装条件](https://support.claude.com/en/articles/9266462-install-claude-for-ios)
2. 把本手册和[恢复手册](recovery.md)存到断网时仍能打开的位置。记录原 VPN 所用客户端、原配置、网络与按需连接状态。保留旧配置和可用入口，确认蜂窝测试在自己的套餐许可范围内。[Apple 蜂窝数据设置](https://support.apple.com/guide/iphone/view-or-change-cellular-data-settings-iph3dd5f213/ios)
3. 在安全的本地渠道收取分配给这台 iPhone 的二维码。有本地工具时可按 [节点材料指南](materials.md) 生成。二维码包含设备连接凭据，应按密码对待。每台设备使用各自的 UUID，电脑和其他手机使用自己的材料。二维码可在第二块可信屏幕显示以便扫描，避免发进聊天、共享相册或公共扫码网站。

## 手动操作

1. 通过自己的 App Store 获取 Shadowrocket，使用应用内的扫码入口。导入为新节点，核对本地别名，以及交付单上的协议、传输、Vision 和 REALITY 参数。界面能显示多少字段取决于版本，二维码解析错误或字段缺失时，先核对版本和交付材料，再继续。App Store 页面用于核对发行方和功能范围，实际协议兼容以所选版本的实机结果为准。[Shadowrocket 官方商店页](https://apps.apple.com/app/shadowrocket/id932747118)
2. 首次只收到节点二维码时，先在获准的短时测试窗口，让本次测试流量走刚选中的节点，以核对握手和出口。若客户约定使用手机规则，再选中相应规则配置，核对 Claude 目标命中指定节点。长期规则同步按需要单独配置。测试前确认当前节点和路由方式。
3. 在约定窗口从原 VPN 客户端暂停原连接，再在 Shadowrocket 连接。首次出现 iOS 的添加 VPN 配置提示时，确认是自己刚发起的 Shadowrocket 操作，由用户亲自批准和解锁。到 Shadowrocket 或 iOS 的 VPN 状态中确认当前活动项属于本次客户端。如果管理策略禁止配置，保留原状态并记为受设备管理限制。[Apple 平台 VPN 安全说明](https://support.apple.com/en-gb/guide/security/-sec802e8ab55/web)

## 两张网分别验收

每张网各做一轮。先确认当前网络和预期节点，再用普通 App 或 Safari 触发新请求。允许的话，在 Shadowrocket 本机的连接或请求记录中核对时间、目标、命中和代理节点。版本未提供可关联记录时，把应用路径记为未证实。出口检查仅能说明该检查请求的出口，需和目标应用的路径分开记。[Shadowrocket 官方功能说明](https://apps.apple.com/app/shadowrocket/id932747118)

| 测试环境 | 操作 | 每轮所需结果 |
| --- | --- | --- |
| 仅 Wi-Fi | 连接约定的 Wi-Fi，临时关蜂窝数据，确认 Shadowrocket 能正常连接。 | 规则配置和专属节点正确。约定代理样本命中预期节点，出口与交付值一致。若交付约定直连，另核对直连样本。若 iPhone 在 Claude 验收范围内，确认官方 App 或网页收到新回复，并单独记录该应用的路径证据。 |
| 仅蜂窝 | 从「设置」关闭 Wi-Fi，启用自己的蜂窝数据，确认 Shadowrocket 与所测 App 或浏览器允许使用蜂窝数据。 | 重新检查规则、节点、路径和出口，若 iPhone 在 Claude 验收范围内，再发送新的 Claude 测试消息并记录实际回复及路径。Wi-Fi 结果不能代填。 |
| 断开再连接 | 在约定网络上主动断开后重新连接。交付若要求从 Wi-Fi 切换到蜂窝后自动恢复，另做一次切换并在手动点击前观察。 | 核对连接恢复方式、活动规则和节点，再复验出口与应用。手动重连和自动恢复分别记。 |

Claude 验收由用户发送无个人信息的短消息，实际看到新回复才记通过。App 与网页分别记所测入口。测试结束把 Wi-Fi、蜂窝和按需连接状态恢复到交付约定的状态。有故障时使用[离线恢复步骤](recovery.md#iphone-恢复)。
