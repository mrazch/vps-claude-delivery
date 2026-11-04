# Xray 离线契约

本目录用固定样例演示 Xray／VLESS＋REALITY＋Vision 服务端、Windows mihomo 节点字段和 iPhone VLESS 分享字段。运行测试只需要已安装的 Node.js。从当前版本的仓库根目录，在 PowerShell 运行 `node --test tests/xray/contract.test.cjs`。

## 端口与已有节点

`planNode` 只接受标明 `mode: 'simulation'` 的内存对象。明确填写 `existingNode: null` 才走新建分支。已有节点须具备 Xray 监听、外层 TCP、VLESS＋REALITY＋Vision、主机及云防火墙放行、握手成功、独立设备标识支持这组事实。已有节点资料缺失或兼容性不明时返回阻断。

新节点只从用户给出的候选列表选择。候选 TCP 端口必须空闲，两层防火墙均允许，且握手事实为 `untested` 或 `passed`。符合条件时优先选 443，否则按输入顺序选首个合格候选。新节点尚未安装时用 `untested`，随后在回执检查实际协议握手的合成观察值。

```js
const xray = require('./scripts/xray/contract.cjs');
const plan = xray.planNode({
  mode: 'simulation',
  existingNode: null,
  ports: [{
    port: 443,
    listener: 'free',
    hostFirewall: 'allowed',
    cloudFirewall: 'allowed',
    handshake: 'untested'
  }]
});
const bundle = xray.buildArtifacts({ port: plan.port });
xray.validateArtifacts(bundle); // true
const receipt = xray.createReceipt({
  plan,
  listener: { port: plan.port, transport: 'tcp', state: 'listening', version: 'v26.10.31' },
  handshake: {
    port: plan.port,
    protocol: 'vless',
    security: 'reality',
    flow: 'xtls-rprx-vision',
    result: 'passed'
  },
  exit: { via: 'tunnel', result: 'matches-vps' }
});
xray.readReceipt(receipt).status; // 'passed'，只表示离线模拟通过
```

## 配置与回执

- 服务端使用 Xray 的 `raw` 传输名称，两个客户端的格式使用 `tcp`。iPhone 样例只保留分享字段，使用保留域名、无效密钥占位和固定测试标识。两个设备分别有自己的 UUID 和 short ID。`validateArtifacts` 校验生成样例的完整形状和一致性，供离线流程使用。[Xray REALITY 字段](https://xtls.github.io/en/config/transports/reality.html) · [mihomo VLESS 字段](https://wiki.metacubex.one/en/config/proxies/vless/) · [VLESS 分享链接提案](https://github.com/XTLS/Xray-core/discussions/716)
- 回执分别记录监听、VLESS＋REALITY＋Vision 握手、通过隧道观测到的 VPS 出口。缺少一项时保留待确认状态，失败或计划阻断会使回执失败。新节点的监听观察值要求读回固定 Xray 版本，复用分支接受观察到的有效版本格式。回执只保存固定枚举、端口及版本检查结果，读取时核对字段和状态。原始观察、地址、配置和凭据留在设备侧。

## 配置渲染接口

`render.cjs` 根据调用方提供的字段在内存中生成配置。原离线契约继续使用固定占位样例。用 `node --test tests/xray/render.test.cjs` 验证渲染结果，测试使用 RFC 7748 公开测试向量及保留地址。

| 接口 | 输入 | 输出 |
| --- | --- | --- |
| `renderNewNodeArtifacts(input)` | 公共字段，加 `target: { host, port }` 与 Xray `privateKey` | Xray `server`、单个 mihomo 节点 `windows`、所选手机的 `qrPayload` |
| `renderClientArtifacts(input)` | 公共字段，加已获准复用节点的 `publicKey` | `windows` 与所选手机的 `qrPayload` |

公共字段包括节点 `address`、节点 `port`、REALITY `serverName`，以及 `windows` 和一个手机对象。手机字段在 `iphone`、`android` 中选一个，每个设备对象分别提供 `id` 和 `shortId`。地址填无端口的 IPv4、无方括号的 IPv6 或完整域名。SNI 填 REALITY 目标支持的完整域名。私钥和公钥用 Xray 的无填充 base64url 格式。新建分支从私钥在本地推导公钥，私钥只进入服务端对象。两个客户端使用不同 UUID 和 short ID。复用分支由节点所有者先确认这些凭据确实已录入。服务器端的 `shortIds` 属于入站的统一允许列表，各设备的 VLESS UUID 仍需各自管理。[Xray v26.10.31 VLESS 解析](https://github.com/XTLS/Xray-core/blob/v26.10.31/infra/conf/vless.go) · [Xray v26.10.31 REALITY 解析](https://github.com/XTLS/Xray-core/blob/v26.10.31/infra/conf/transport_security.go) · [Xray v26.10.31 X25519](https://github.com/XTLS/Xray-core/blob/v26.10.31/main/commands/all/x25519.go)

`windows` 放在 mihomo 配置的 `proxies` 列表中，完整的分流规则、TUN 与策略组由 Windows 交付流程处理。`iphone.qrPayload` 或 `android.qrPayload` 是供本地二维码编码器使用的 VLESS URI，Android 显示名称为 `VPS-Android`。服务端对象、节点对象、VLESS URI 和二维码都应按凭据处理。渲染接口仅在内存中返回对象。Clash Verge Rev／mihomo、Shadowrocket 和 v2rayNG 的导入、握手和出口仍按现场结果记录。[mihomo v1.19.33 VLESS 字段](https://github.com/MetaCubeX/mihomo/blob/v1.19.33/adapter/outbound/vless.go) · [VLESS 分享链接提案](https://github.com/XTLS/Xray-core/discussions/716) · [v2rayNG 2.3.15 VLESS 导入](https://github.com/2dust/v2rayNG/blob/2.3.15/V2rayNG/app/src/main/java/com/v2ray/ang/fmt/VlessFmt.kt) · [v2rayNG 2.3.15 传输字段](https://github.com/2dust/v2rayNG/blob/2.3.15/V2rayNG/app/src/main/java/com/v2ray/ang/fmt/FmtBase.kt)

## 固定候选与客户侧核对

- `upstream.json` 固定官方安装脚本提交和 Xray v26.10.31 Linux x64／ARM64 归档。安装脚本和两个官方归档按下载字节分别计算 SHA-256，两个归档均与 GitHub 发行资源的摘要一致。版本和摘要核对截至 2026-11-04，发行归档的独立签名未验证。[官方安装脚本固定提交](https://github.com/XTLS/Xray-install/commit/04e6f3bd9534811ed901a48c47b2c042dd64eb3a) · [Xray 发行页](https://github.com/XTLS/Xray-core/releases/tag/v26.10.31) · [发行资源摘要](https://api.github.com/repos/XTLS/Xray-core/releases/tags/v26.10.31)
- 拟用唯一新装路径是官方 Xray-install 的本地归档模式。届时先独立核对脚本和目标架构归档摘要，再由客户确认授权范围，在自己的新 VPS 上按方案操作。固定脚本会尝试安装缺失的依赖，并会写入系统文件和处理服务，本项目目前仅留存来源与校验记录。[固定版安装脚本](https://github.com/XTLS/Xray-install/blob/04e6f3bd9534811ed901a48c47b2c042dd64eb3a/install-release.sh)
- mihomo 文档声明不考虑兼容 Xray v26.7.11 及以后版本。已核对 v26.10.31 固定源码，早期问题涉及的默认 `minClientVer = 26.3.27` 赋值在该版本被注释掉。客户按所用 Clash Verge Rev／mihomo 与 Shadowrocket 版本分别核对握手和流量出口。遇到版本兼容问题时按反馈复查。样例沿用 Xray 固定版本的默认设置。[mihomo 官方 TLS 文档](https://wiki.metacubex.one/en/config/proxies/tls/) · [Xray v26.10.31 固定源码](https://github.com/XTLS/Xray-core/blob/v26.10.31/infra/conf/transport_security.go) · [mihomo 的早期兼容问题](https://github.com/MetaCubeX/mihomo/issues/3132)
