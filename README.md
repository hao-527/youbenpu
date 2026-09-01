# 生活有本谱

“生活有本谱”是面向家庭成员的微信小程序，把家庭账本、家庭点餐、物品库存与家庭协作集中在同一个家庭空间。

## 当前能力

- **家庭与身份**：微信登录、JWT、创建/加入/退出家庭、邀请码、成员角色与家庭管理。
- **家庭账本**：收入/支出记录、备注可见范围、成员和时间维度展示。
- **家庭点餐**：菜品与自定义分类、点餐单提交/完成/取消；数据库保证每个家庭最多一张待完成点餐单。
- **物品管理**：库存、位置、自定义分类、到期状态、归档、恢复与永久删除。
- **图片存储**：本地文件或腾讯云 COS，通过统一对象存储接口切换。
- **生产能力**：MySQL 迁移、结构化日志、请求 ID、安全响应头、存活/就绪探针、优雅退出、构建版本追踪。

## 技术栈

- 小程序：Taro 4.2.1、React 18.3.1、TypeScript 5.9.3、Sass
- API：Go 1.24、标准库 HTTP、MySQL 5.7+、JWT、腾讯云 COS
- 工程：npm workspaces、GitHub Actions、Docker 多阶段构建

## 项目结构

```text
.
├── apps/miniprogram/                     # Taro 微信小程序
├── services/api/
│   ├── cmd/api/                           # API 入口
│   ├── internal/config/                   # 环境配置与生产校验
│   ├── internal/database/migrations/      # MySQL 迁移
│   ├── internal/httpapi/                  # 路由、业务 handler、中间件
│   ├── internal/storage/                  # Local/COS 对象存储
│   ├── .env.example                       # 无敏感值的配置模板
│   └── Dockerfile
├── scripts/                               # 数据库备份与恢复脚本
├── docs/operations.md                     # 发布、迁移、回滚与安全手册
└── .github/workflows/ci.yml               # 前后端持续集成
```

## 本地开发

### 环境要求

- Node.js 20 LTS 或更高版本（最低兼容 18.20）
- npm 10+
- Go 1.24.x
- MySQL 5.7+
- 微信开发者工具

### 小程序

```bash
npm ci
npm run typecheck
npm run build:weapp
```

开发监听：

```bash
npm run dev:weapp
```

构建产物位于 `apps/miniprogram/dist`，用微信开发者工具导入。

### API

```bash
cp services/api/.env.example services/api/.env
# 创建数据库并按本地环境修改 .env，然后导出变量
cd services/api
set -a; source .env; set +a
go run ./cmd/api
```

本地开发允许使用开发 JWT 默认值；`APP_ENV=production` 时必须配置不少于 32 字节的随机 `JWT_SECRET`，并提供 `WX_APPID` 与 `WX_APP_SECRET`，否则服务拒绝启动。

探针和版本：

```bash
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8080/readyz
curl http://127.0.0.1:8080/api/v1/meta
```

## 主要环境变量

| 变量 | 开发默认值 | 说明 |
|---|---|---|
| `APP_ENV` | `development` | `development` / `test` / `production` |
| `HTTP_ADDRESS` | `:8080` | 监听地址；同机 Nginx 生产环境建议绑定 `127.0.0.1` |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | MySQL 地址 |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `root` / 空 / `youbenpu` | 数据库凭证与库名 |
| `WX_APPID` / `WX_APP_SECRET` | 空 | 微信小程序凭证；生产必填 |
| `JWT_SECRET` | 开发占位值 | 生产必须为 32+ 字节随机值 |
| `OBJECT_STORE` | `local` | `local` 或 `cos` |
| `UPLOAD_DIR` | `./data/uploads` | 本地上传目录 |
| `COS_*` | 见模板 | `OBJECT_STORE=cos` 时全部必填 |
| `SHUTDOWN_TIMEOUT` | `10s` | 优雅退出超时 |

完整模板见 `services/api/.env.example`。

## 质量检查

CI 与本地应执行相同的核心命令：

```bash
npm run typecheck
npm run build:weapp
cd services/api
go test ./...
go vet ./...
go build ./cmd/api
```

当前 Go 包尚无自动化测试用例，`go test` 主要承担编译校验；新增业务逻辑时应同步补充测试。

## Docker 构建

```bash
docker build services/api \
  --build-arg VERSION="$(git describe --tags --always)" \
  --build-arg COMMIT="$(git rev-parse --short=12 HEAD)" \
  -t youbenpu-api:"$(git rev-parse --short=12 HEAD)"
```

容器以 non-root 用户运行。生产运行时仍需注入数据库、微信、JWT 和对象存储配置，不能依赖开发默认值。

## 部署与运维

数据库迁移会在 API 启动时执行。首次部署迁移 002 前必须检查历史数据中是否存在同一家庭多张待完成点餐单。备份、发布顺序、版本核对、恢复、回滚和服务器最低安全基线见：

- [API 部署与运维手册](docs/operations.md)
- [数据库备份脚本](scripts/backup-mysql.sh)
- [数据库恢复脚本](scripts/restore-mysql.sh)

高风险生产操作（防火墙、SSH、MySQL 监听、systemd 用户、系统升级）必须在维护窗口单独确认并保留回滚通道，不应由应用发布脚本自动执行。
