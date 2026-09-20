# 多店本地采集适配器

本目录包含本地 Windows 采集代理与抖店适配器边界，不保存抖店密码、Cookie 或浏览器配置文件。每个店铺应使用独立的浏览器 profile 目录，并由人工完成首次登录和重新登录。

## 安装与运行

1. 在本机 Chrome 已安装的 Windows 电脑上执行 `pnpm install`。
2. 复制 `agent.env.example` 为 `agent.env`，填写服务器地址、采集令牌、代理 ID、profile 根目录和 Chrome 路径。`agent.env` 不要提交到仓库。
3. 启动常驻代理：`pnpm collector`。它每次只拉取并执行一个店铺命令，并每 30 秒发送心跳。
4. 可用 `node collector/agent.mjs health` 测试心跳；首次人工登录可用 `node collector/agent.mjs login --store store-001 --profile-id store-001`。
5. 用管理员 PowerShell 执行 `collector/register-task.ps1`，设置用户登录后自动启动和异常重启。

代理只会打开独立的 Chromium persistent context。profile 目录由本机的 `COLLECTOR_PROFILE_ROOT` 与数据库中的标识拼接，服务器不保存绝对路径。

## 发送接口

向 `/api/collector/ingest` 发送 `POST` 请求，使用服务端配置的 `COLLECTOR_INGEST_TOKEN`：

```json
{
  "store_code": "store-001",
  "source": "local-browser",
  "auth_status": "normal",
  "collected_at": "2026-09-20T10:00:00+08:00",
  "products": [{"platform_product_id": "p-1", "name": "商品", "status": "上架", "source_url": "https://..."}],
  "orders": [{"platform_order_id": "o-1", "status": "待发货", "source_url": "https://..."}],
  "after_sales": [{"platform_after_sale_id": "a-1", "platform_order_id": "o-1", "status": "待处理"}]
}
```

登录失效时只发送 `store_code` 与 `auth_status: "reauth_required"`。服务器会暂停该店铺的业务入库并保留最后成功时间，其他店铺不受影响。

采集器必须遵守：只读页面、不绕过验证码或二次验证、不自动改价/下单/发货/提交售后；按店铺批次运行并在本地记录 profile、页面、时间和错误。

真实页面选择器和采集频率不在仓库中臆造，接入前需用测试店铺确认页面结构与平台允许范围。

当前 `douyinAdapter.mjs` 只完成浏览器生命周期和登录检查接口；商品、订单、售后选择器必须在测试店铺人工确认后补入 `collect()`。
