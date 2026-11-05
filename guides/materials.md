# 准备 Windows 和手机的独立节点材料

先按 [VPS 指南](vps.md) 判断新建或复用，确认两台设备各有自己的节点身份。只有聊天能力时，沿用 VPS 指南的人工步骤。在客户电脑已有 Node.js 22 或更高版本 的情况下，可以用本页命令在本地准备文件。

## 输入放在哪里

在当前交付文件夹下新建 `runtime/node-materials/`，将填好的内容保存为 `input.json`。这个目录包含凭据，放在仅客户本人能访问的位置。Windows 的访问权限由文件夹继承。由客户从自己的 VPS 或节点管理入口填入，Agent 只需读取命令返回的状态。

先从当前交付文件夹打开 PowerShell，建立输入目录，再由客户保存 `input.json`：

~~~powershell
New-Item -ItemType Directory -Force -Path runtime/node-materials | Out-Null
~~~

新建和复用共有以下字段：

| 字段 | 填什么 |
| --- | --- |
| `route` | 新建填 `new`，兼容节点复用填 `reuse` |
| `node.address`、`node.port` | 客户端连接地址和已选的外层 TCP 端口，端口写数字 |
| `node.serverName` | 与服务端一致的 REALITY 服务名 |
| `node.windows`、`node.iphone` 或 `node.android` | Windows 和一种手机各填一个对象，包含各自的 `id`（UUID）和 `shortId`。手机只选与实际设备一致的字段。 |
| `node.target`、`node.privateKey` | 仅新建需要。目标含 `host` 和数字 `port`。服务端私钥由客户在自己的环境生成，并仅在本机或 VPS 私下填入 |
| `node.publicKey` | 仅复用需要。使用现有节点的 REALITY 客户端公钥，确认两台设备的 UUID 和 Short ID 已分别获准接入 |

下例是输入格式，所有示例地址和凭据占位符由客户在本机替换：

~~~json
{
  "route": "new",
  "node": {
    "address": "vps.example.invalid",
    "port": 443,
    "serverName": "target.example.invalid",
    "target": { "host": "target.example.invalid", "port": 443 },
    "privateKey": "<服务端私钥>",
    "windows": { "id": "<Windows UUID>", "shortId": "<Windows Short ID>" },
    "iphone": { "id": "<iPhone UUID>", "shortId": "<iPhone Short ID>" }
  }
}
~~~

Android 把示例中的 `iphone` 改为 `android`，填写 Android 的独立凭据。复用时去掉 `target` 和 `privateKey`，在 `node` 内加 `publicKey`。复用的现有服务、端口和配置由客户先按原方式确认。

## 生成和使用

从当前交付文件夹打开 PowerShell：

~~~powershell
node scripts/prepare-node.cjs check
node scripts/prepare-node.cjs prepare
~~~

`check` 只校验输入。`prepare` 将材料写到本地 `runtime/node-materials/output/`，屏幕只显示状态。确认命令返回 `prepared-locally` 且目录中有 `ready.json` 后再取用。每个客户用自己的交付文件夹。如果已有输出，先由客户在本机确认和保管旧材料，再为新版本使用单独的文件夹。

| 文件 | 用途 |
| --- | --- |
| `windows/profile.yaml` | 导入 Clash Verge Rev 后，按 Windows 指南核对所选节点。项目里的 [规则模板](../scripts/windows/default-rules.json) 单独维护，生成时才和 Windows 凭据合并。规则数据能否加载、命中和出口仍由客户逐项核对。 |
| `iphone/qr.svg`、`iphone/share.txt` | 在客户可信屏幕上离线打开二维码，用该台 iPhone 的 Shadowrocket 扫描。需要时使用本地分享链接。两份文件都按设备凭据保管。 |
| `android/qr.svg`、`android/share.txt` | 在客户可信屏幕上离线打开二维码，用本台 Android 的 v2rayNG 扫描。需要时从本地分享文本导入。两份文件都按设备凭据保管。 |
| `server/config.json` | 仅新建分支生成。含服务端私钥，由客户留在自己的受保护位置，再按 VPS 指南确认配置。 |

生成成功只说明本地文件已准备。先在客户环境核对每台设备的握手和出口，再继续 [Windows 接入](windows.md) 及相应的 [iPhone](iphone.md) 或 [Android](android.md) 指南。如需替换手机，新增并核对新设备身份后，只在服务端撤销旧手机对应的身份，Windows 身份继续独立保留。配置生成所用的二维码库有独立的 [来源与许可说明](../scripts/vendor/NOTICE.md)。
