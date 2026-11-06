# 自维护分支与 Docker Compose

本次整合以上游主分支的 v2.11.0 代码（`401534742802e2b1542783197ce66451bad82739`，2026-10-29）为目标，保留 `cc0fec1` 和 `f008990` 的功能。检查时上游最新正式发行版仍为 v2.10.0。

新增上游的自定义逻辑规则、规则格式识别、订阅链接重置和协议导入兼容性修复。订阅链接重置按当前账号及原 token 原子更新，不清除现有配额或限流状态。规则格式识别沿用当前账号的内网访问权限与独立请求限流。

保留的功能包括管理员与普通用户、账号禁用、订阅和模板按账号隔离、订阅数量配额、每用户订阅拉取阈值、数据库持久化的拉取冷却、独立的手动刷新冷却、管理员监控与解除限流，以及全局“拉取时强制刷新”设置。节点数配额字段延续原分支的展示行为，服务端仍使用全局节点数上限。

强制刷新已接入上游的并发修改检查和配置引用修复：使用限流状态更新后的数据版本，保存刷新后修复的配置；刷新失败或与用户修改冲突时返回错误，不返回旧快照。最小刷新间隔仍默认为 600 秒，下限为 60 秒。

上游的退出登录撤销、任务租约、请求大小限制、额外接口限流与订阅导入改进均保留。“允许本机和局域网订阅”按订阅所属账号读取，仅启用中的管理员可开启，普通账号不会继承管理员的放行设置。原有开发用 `ALLOW_PRIVATE_SUBSCRIPTION_FETCH` 环境变量继续保留，生产环境应保持关闭。

原有四个数据库迁移文件保持原样，升级只追加上游四个迁移。现有用户、密码、订阅 token、配额和全局设置继续使用；部署时保留原 `ENCRYPTION_KEY`、`JWT_SECRET`、`CRON_SECRET` 和 `APP_URL`。

从本分支此前整合的 v2.9.0 升级到本次目标代码，无新增数据库迁移或环境变量变更。Docker 构建默认使用 `node:24.22.1-alpine`，仍支持通过 `NODE_IMAGE` 或 Tunnel 配置的 `SUBBOOST_NODE_IMAGE` 固定镜像。源码运行需要 Node 24.22.1–24.x 或 26.12.1–26.x；原先固定的 Node 22 镜像需要同步更新。

## 本次整合状态（2026-10-31）

Docker、订阅导入和订阅服务的三处文件冲突已解决并完成复核。整合结果以 `96e1b8f` 和上游 `4015347` 为双父提交记录，保留双方历史。规则格式识别已验证按请求账号读取内网访问权限，普通账号不会继承管理员的放行设置。

使用经官方 SHA-256 校验的 Node 24.22.1，按锁文件执行 `npm ci` 后，`npm run lint`、`npm run test:coverage` 和 `npm run check:local-app` 均通过；完整测试共 339 个文件、2696 项。覆盖率为语句 98.33%、分支 97.01%、函数 98.07%、行 98.93%，达到仓库的 97% 门槛。另行验证了 `git diff --check`、Docker Compose 配置和管理脚本的 Bash 语法。

## Shadowrocket Reality 下载适配

同一条订阅链接按下载请求的 `User-Agent` 区分客户端：完整匹配 `Shadowrocket` 时，将最终 YAML 中带非空 Reality 公钥的 VLESS 节点指纹调整为 `chrome140`。Clash/Mihomo 和其他客户端直接返回生成器原始正文，不解析或重新序列化。

适配发生在成功生成订阅后的响应层，不修改数据库、共享节点、生成配置或订阅 token。规则、DNS、策略组和 `dialer-proxy` 链路定义保留。成功响应保留原订阅信息、更新间隔及 `Cache-Control: no-store`，并增加 `Vary: User-Agent`；原有限流、强制刷新失败与 404 行为保留。调整异常只返回通用错误，避免泄露解析器可能包含的节点凭据。

覆盖顶层 `proxies` 与 `type: inline` provider 的 `payload`；内嵌 provider 的指纹 override 会等效展开，避免抵消 Reality 指纹，同时保留其他节点原先的有效指纹。项目的 URL 源在启用 `useProxyProviders` 时会生成 HTTP provider；这类 provider 和 file provider 由客户端另行读取，内容不在本次适配范围内，不能据此宣称所有远程节点都已调整。

本次不新增数据库迁移、环境变量或依赖。构建部署沿用下述 Compose 项目及原数据卷、密钥和 Tunnel，只更新应用源码及镜像；部署前备份数据库和运行配置并保留旧镜像。以后直接升级官方镜像可能丢失此定制，需要继续从自维护分支构建。

部署后用原订阅链接正常更新 Shadowrocket，检查一个**未手动改过**的 VLESS Reality 节点是否显示 Chrome140，并实际访问网络。随后验证 Clash/Mihomo、分流及链式代理；服务端输出字段正确不等于手机导入和连通性已验证。若自定义 User-Agent、代理删除请求头或 CDN 强制缓存，应先核对实际下载请求及响应。

2026-11-07 在本分支以经官方 SHA-256 校验的 Node 24.22.1 和原锁文件验证：25 项针对性测试、`npm run lint`、`npm run test:coverage`（344 个文件、2747 项）及 `npm run check:local-app` 全部通过。覆盖率为语句 98.34%、分支 97.02%、函数 97.99%、行 98.94%。完整套件中发现并在未修改基线上复现了模板共享功能的一处旧测试模拟缺失，已补齐空查询结果，未改模板业务逻辑。以上结果不包含 Docker 镜像构建、生产部署或手机实测。

## Linux 与现有 Cloudflare Tunnel

`local/docker-compose.yml` 是上游的基础配置。可选的 `local/docker-compose.tunnel.yml` 增加独立 Tunnel、应用就绪检查和日志轮转，并支持固定镜像摘要。

在 `local/.env` 的基础配置之外，设置：

- `SUBBOOST_PORT=127.0.0.1:8080`：仅通过本机端口访问网站。
- `SUBBOOST_TUNNEL_TOKEN_FILE`：现有 Tunnel token 文件的绝对路径；文件需允许 UID 1000 读取，建议权限 600。不要提交该文件。
- `SUBBOOST_LOCAL_IMAGE`：本分支本地构建镜像的名称与版本标签。
- 可选的 `SUBBOOST_NODE_IMAGE`、`SUBBOOST_POSTGRES_IMAGE`、`SUBBOOST_CURL_IMAGE`、`SUBBOOST_TUNNEL_IMAGE`：使用 `镜像:标签@sha256:摘要` 固定构建和运行环境。

Tunnel 使用宿主机网络，容器内 `host.docker.internal` 映射到 `127.0.0.1`，兼容指向宿主机应用端口的原路由。其监控端口为 `127.0.0.1:20242`；部署前应确保没有其他进程占用。已有的其他 Tunnel 服务不需要修改。

在项目根目录执行以下命令管理网站、数据库、刷新任务和 Tunnel；服务器按权限需要加 `sudo`：

```bash
local/scripts/compose.sh up -d --build
local/scripts/compose.sh ps
local/scripts/compose.sh logs --tail=50 app cron
```

镜像从本分支源码构建，使用仓库的依赖锁文件。环境文件与 secrets 目录已从构建上下文排除。无需安装 PM2。

升级前备份 PostgreSQL 数据库、环境文件和 Tunnel token 文件。应用迁移失败时先保留当前数据，避免直接用旧数据库覆盖升级后的新写入。
