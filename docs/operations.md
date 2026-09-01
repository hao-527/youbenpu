# API 部署与运维手册

本文档适用于 `services/api` 的 MySQL 5.7 部署。任何生产发布都应先备份、在维护窗口执行，并保留上一版二进制。

## 1. 生产必填配置

`APP_ENV=production` 时服务会在启动阶段拒绝以下配置：

- 少于 32 字节或仍为开发默认值的 `JWT_SECRET`
- 缺失的 `WX_APPID` / `WX_APP_SECRET`
- 只配置其中一项的微信凭证
- `OBJECT_STORE=cos` 时缺失任一 COS 配置

建议生成 JWT 密钥：

```bash
openssl rand -base64 48
```

生产反向代理与 API 同机时，优先设置 `HTTP_ADDRESS=127.0.0.1:8090`，仅由 Nginx 对外提供 HTTPS。环境文件权限应为 `600`，不要写入 Git、日志或命令历史。

## 2. 发布前检查

```bash
npm ci
npm run typecheck
npm run build:weapp
cd services/api
go test ./...
go vet ./...
go build ./cmd/api
```

迁移 `002_one_pending_order.sql` 会建立“一户最多一张待完成点餐单”的唯一约束。首次发布前必须确认没有历史重复数据：

```sql
SELECT family_id, COUNT(*) AS pending_count
FROM meal_orders
WHERE status = 'pending'
GROUP BY family_id
HAVING COUNT(*) > 1;
```

查询必须返回 0 行。若有结果，应由业务负责人明确保留哪张订单，再把其余订单改为 `cancelled`；不要让发布脚本自动删除数据。

## 3. 备份与恢复

创建权限为 `600` 的压缩备份，默认保存到 `/var/backups/youbenpu` 并保留 14 天：

```bash
cd /path/to/youbenpu
DB_HOST=127.0.0.1 \
DB_PORT=3306 \
DB_USER=youbenpu_backup \
DB_PASSWORD='***' \
DB_NAME=youbenpu \
BACKUP_DIR=/var/backups/youbenpu \
./scripts/backup-mysql.sh
```

备份完成后必须把副本同步到另一台主机或受控对象存储，并定期在隔离数据库中演练恢复。备份文件不包含 `CREATE DATABASE`/`USE`，因此恢复目标库必须预先创建；脚本会把内容显式导入 `DB_NAME`，不会根据 dump 切换数据库。恢复具有破坏性，要求显式确认，并默认验证备份脚本生成的同名 `.sha256` 文件：

```bash
DB_HOST=127.0.0.1 \
DB_USER=youbenpu_restore \
DB_PASSWORD='***' \
DB_NAME=youbenpu \
BACKUP_FILE=/var/backups/youbenpu/youbenpu-YYYYMMDDTHHMMSSZ.sql.gz \
CONFIRM_RESTORE=restore-youbenpu \
./scripts/restore-mysql.sh
```

如校验和文件位于其他路径，可额外设置 `CHECKSUM_FILE=/path/to/file.sha256`。只有已经通过独立渠道核验备份完整性时，才允许显式设置 `ALLOW_MISSING_CHECKSUM=1` 跳过缺失校验和；不要把该变量写进常驻环境配置。恢复后先检查 `/readyz`、家庭/账本/库存/点餐核心数据，再恢复外部流量。

## 4. 构建和版本追踪

本地或 systemd 二进制构建：

```bash
cd services/api
VERSION="$(git describe --tags --always --dirty)"
COMMIT="$(git rev-parse --short=12 HEAD)"
go build -trimpath \
  -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
  -o youbenpu-api ./cmd/api
```

Docker 构建：

```bash
docker build services/api \
  --build-arg VERSION="$(git describe --tags --always)" \
  --build-arg COMMIT="$(git rev-parse --short=12 HEAD)" \
  -t youbenpu-api:"$(git rev-parse --short=12 HEAD)"
```

发布后通过以下接口核对实际版本：

```bash
curl -fsS https://apiyoubenpu.maptrace.top/healthz
curl -fsS https://apiyoubenpu.maptrace.top/readyz
curl -fsS https://apiyoubenpu.maptrace.top/api/v1/meta
```

- `/healthz`：仅表示进程存活，不依赖数据库。
- `/readyz`：最多等待 2 秒执行数据库 Ping；失败返回 503。
- `/api/v1/meta`：返回环境、版本和提交 SHA。

## 5. 推荐发布顺序

1. 确认分支、提交 SHA、CI 全绿，保存上一版二进制和 systemd 配置。
2. 执行 pending 重复检查并创建数据库备份。
3. 构建带版本信息的新二进制，先写入临时路径。
4. 在维护窗口停止服务，原子替换二进制，再启动服务。
5. 检查 systemd 状态和最近日志。
6. 检查 `/healthz`、`/readyz`、`/api/v1/meta`。
7. 使用测试家庭验证登录、账本新增删除、库存新增删除、点餐提交/完成。
8. 观察错误率和数据库连接至少 15 分钟后结束维护窗口。

## 6. 回滚

### 应用回滚

停止服务，恢复上一版二进制和配置，重新启动并重复三个探针及业务冒烟。迁移 002 新增的列对旧程序无破坏性，通常不需要回滚数据库结构。

### 数据库回滚

Go 迁移器会按文件使用事务并在成功后记录版本，但 MySQL 5.7 的 DDL 会隐式提交，不能保证 DDL 真正原子回滚。出现迁移失败时应停止发布、保留现场并根据错误人工处理。

只有确认必须撤销迁移 002，且已备份并进入维护窗口时，才考虑：

```sql
ALTER TABLE meal_orders DROP INDEX uk_orders_one_pending;
ALTER TABLE meal_orders DROP COLUMN pending_family_id;
DELETE FROM schema_migrations WHERE version = 2;
```

上述操作不可自动执行。若发布过程中发生业务数据写错，优先恢复到新数据库实例并核对，再切换流量，不要直接覆盖唯一生产库。

## 7. 最低安全基线

- 云安全组仅公开 80/443；22 仅允许固定管理 IP。数据库、API 源端口和面板端口禁止公网访问。
- API 使用专用非 root 系统用户；环境文件 `chmod 600`。
- SSH 禁用密码登录和 root 直登前，必须先验证普通 sudo 用户的密钥会话可用。
- MySQL 仅绑定内网/localhost，应用与备份账号按最小权限拆分。
- 每日自动备份、异机保存、告警失败，并至少每季度恢复演练。
- 系统更新在维护窗口分批进行，升级前保存快照并确认回滚入口。
