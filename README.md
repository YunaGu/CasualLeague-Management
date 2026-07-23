# 微信小程序示例
微信小程序示例源码，欢迎扫描以下小程序码体验。

> 提示：请使用微信开发者工具或微信客户端 6.7.2 及以上版本运行。

<img width="200" src="https://res.wx.qq.com/op_res/QqOF7ydl0dkpq-orpebXL-gBspr08VjoFOFGrWvKF9IULLhfT9XhnsSKlvc0gI8d">

## 使用

```
cd demo
npm i
cd miniprogram
npm i
```
完成上述步骤后，使用微信开发者工具，点击【工具-构建npm】

使用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开该示例代码，云开发环境搭建请参考[云开发示例说明](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/page/cloud/README.md)。

## 赛事云数据库

赛事数据使用微信云开发数据库保存，本地存储只作为页面缓存。

1. 在微信开发者工具中打开【云开发】，创建并选择一个云环境。
2. 在【云开发 → 数据库】中新建集合 `tournaments`。
3. 将集合权限设置为【所有用户可读，仅创建者可读写】。这样创建者可以记分和修改赛程，其他用户只能查看。
4. 如果项目有多个云环境，在 `miniprogram/config.js` 的 `cloudEnvId` 中填写环境 ID；留空时使用当前小程序的默认环境。
5. 重新编译小程序。旧版保存在本地的赛事会在首次启动时自动上传到云端。

可在云开发控制台的 `tournaments` 集合中确认赛事文档是否已经写入。确认云端存在数据后，再使用开发者工具的【清除缓存 → 全部清除】测试恢复。


## 贡献

如果你有 bug 反馈或其他任何建议，欢迎提 issue 给我们。

如果你愿意一起来完善小程序示例，欢迎通过 PR 的方式贡献代码。为了保证代码风格的统一，在编写代码之前，请在项目根目录运行以下命令安装依赖：

```
npm install
```
同时，确保你的代码可以通过 Lint 检查：
```
npm run lint
```

## 截图

<img width="375" src="https://res.wx.qq.com/op_res/0_vsSii5DaG-1hoXcqmBCT_tPShgSPKi3_FBVuVj1tu1ZdZD8lwYNrSQm3mdswI2">
