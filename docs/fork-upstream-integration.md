# 自维护分支与 Docker Compose

本分支合并上游 SubBoost v2.9.0（`a7177d7bb704998bfb9f51116441506729fc43c0`），保留 `cc0fec1` 和 `f008990` 的功能与历史。

保留的功能包括管理员与普通用户、账号禁用、订阅和模板按账号隔离、订阅数量配额、每用户订阅拉取阈值、数据库持久化的拉取冷却、独立的手动刷新冷却、管理员监控与解除限流，以及全局“拉取时强制刷新”设置。节点数配额字段延续原分支的展示行为，服务端仍使用全局节点数上限。

强制刷新已接入上游的并发修改检查和配置引用修复：使用限流状态更新后的数据版本，保存刷新后修复的配置；刷新失败或与用户修改冲突时返回错误，不返回旧快照。最小刷新间隔仍默认为 600 秒，下限为 60 秒。

上游的退出登录撤销、任务租约、请求大小限制、额外接口限流与订阅导入改进均保留。“允许本机和局域网订阅”按订阅所属账号读取，仅启用中的管理员可开启，普通账号不会继承管理员的放行设置。原有开发用 `ALLOW_PRIVATE_SUBSCRIPTION_FETCH` 环境变量继续保留，生产环境应保持关闭。

原有四个数据库迁移文件保持原样，升级只追加上游四个迁移。现有用户、密码、订阅 token、配额和全局设置继续使用；部署时保留原 `ENCRYPTION_KEY`、`JWT_SECRET`、`CRON_SECRET` 和 `APP_URL`。

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
