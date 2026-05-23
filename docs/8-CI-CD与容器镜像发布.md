# CI/CD 设计与发布流程

本文档描述 BiteGo 的 CI/CD 总体设计，以及后端（Docker 镜像 + SSH 部署）、Web 管理端（COS 静态站点 + CDN 刷新）与小程序端（构建验证）的具体实现。
此外，H5 点餐端（浏览器扫码访问 `app.bitego.net`）同样基于小程序项目的 H5 构建产物发布，并通过 COS 静态站点 + CDN 刷新实现自动部署。

## 1. 整体设计

### 1.1 目标

- 后端：PR 与主干合入前执行 `lint + format check + test:coverage`；`push main` 后在通过质量门禁后自动构建 Docker 镜像并推送至 TCR，再通过 SSH 在服务器执行拉取与重启
- Web 管理端：PR 与主干合入前执行 `lint + format check + test`；`push main` 后在通过质量门禁后构建静态资源并上传到腾讯云 COS，随后刷新 CDN 目录避免缓存
- 小程序端：PR 与主干合入前执行 `lint + stylelint + format check + test`，并做 `weapp` 与 `h5` 构建验证，确保主干始终可编译
- H5 点餐端：`push main` 后在通过质量门禁后构建 H5 静态资源并上传到腾讯云 COS，随后刷新 CDN 目录避免缓存

### 1.2 触发与并发策略

- 所有 workflow 使用 `paths` 过滤，仅在相关端代码或对应脚本变更时触发
- 使用 `concurrency.cancel-in-progress`，确保同分支只保留最新一次流水线

补充说明：

- CI 与 CD 分离：CI 以 PR 为主，CD 仅在 `push main` 执行。
- 后端与 Web 管理端的 CD 会在部署前先跑质量门禁，避免“带病发布”。

### 1.3 安全与约定

- 密钥/密码等仅通过 GitHub Secrets 或服务器 `~/.env` 注入，禁止提交到仓库
- 服务端部署脚本会读取 `~/.env` 与仓库根目录 `.env`（若存在）
- Web 管理端构建时的 `VITE_API_BASE_URL` 由 `BACKEND_DOMAIN` 推导：`${BACKEND_DOMAIN%/}/api/v1`

## 2. 环境变量与 Secrets 清单

### 2.1 通用（腾讯云 API 密钥）

- `QCLOUD_SECRET_ID`
- `QCLOUD_SECRET_KEY`

### 2.2 后端（Docker 镜像构建/推送 + SSH 部署）

**镜像仓库（TCR）**

- `QCLOUD_DOCKER_SERVER`
- `QCLOUD_DOCKER_USERNAME`
- `QCLOUD_DOCKER_PASSWORD`
- `QCLOUD_DOCKER_IMAGE`（可选，完整镜像名不含 tag）
- `QCLOUD_DOCKER_REPOSITORY`（可选，仓库相对路径，与 `QCLOUD_DOCKER_SERVER` 拼接）
- `DOCKER_PLATFORM`（可选，如 `linux/amd64` 或 `linux/arm64`）

**部署（SSH）**

- `DEPLOY_SSH_HOST`
- `DEPLOY_SSH_PORT`（可选，默认 22）
- `DEPLOY_SSH_USER`
- `DEPLOY_SSH_KEY`（SSH 私钥）
- `DEPLOY_WORKDIR`（服务器上仓库根目录，例如 `/home/ubuntu/bite-go`）

**部署脚本可选参数（服务器侧）**

- `DEPLOY_GIT_PULL`（默认 `true`）：部署前 `git pull --ff-only`，用于更新部署脚本/compose（可设为 `false` 关闭）
- `BACKEND_HEALTH_URL`（默认 `http://127.0.0.1:3000/health`）

### 2.3 Web 管理端（COS 静态站点发布 + CDN 刷新）

- `QCLOUD_WEBADMIN_COS_BUCKET`
- `QCLOUD_WEBADMIN_COS_REGION`
- `QCLOUD_WEBADMIN_COS_ENDPOINT`（可选）：`cos.accelerate.myqcloud.com`（全球加速，适合 GitHub Actions 境外 Runner）
- `BACKEND_DOMAIN`：后端公网域名，例如 `https://api.bitego.net/`
- `WEBADMIN_DOMAIN`：Web 管理端静态站点绑定域名，例如 `https://admin.bitego.net/`

说明：Web 管理端 workflow 会根据 `BACKEND_DOMAIN` 自动拼出 `VITE_API_BASE_URL=${BACKEND_DOMAIN%/}/api/v1`。

### 2.4 小程序端（构建验证）

- 无需额外 Secrets（仅构建验证）
- CI 环境 Node.js 版本建议为 20（与 Taro 4 约定一致）

### 2.5 H5 点餐端（COS 静态站点发布 + CDN 刷新）

- `QCLOUD_H5APP_COS_BUCKET`
- `QCLOUD_H5APP_COS_REGION`
- `QCLOUD_H5APP_COS_ENDPOINT`（可选）：`cos.accelerate.myqcloud.com`
- `BACKEND_DOMAIN`：后端公网域名，例如 `https://api.bitego.net/`
- `H5APP_DOMAIN`：H5 静态站点绑定域名，例如 `https://app.bitego.net/`

说明：H5 workflow 会根据 `BACKEND_DOMAIN` 自动拼出 `TARO_APP_API_BASE_URL=${BACKEND_DOMAIN%/}/api/v1`，作为 H5 构建时注入的 API base url。

## 3. 后端 CI/CD（Docker 镜像 + SSH 部署）

### 3.1 本地/服务器脚本

在仓库根目录执行：

```bash
bash ci/build-backend-image.sh <tag>
bash ci/push-backend-image.sh <tag>
bash ci/deploy-backend.sh <tag>
```

说明：

- 构建脚本使用 `projects/backend/Dockerfile`
- 推送脚本支持 `PUSH_LATEST=true` 额外推送 `:latest`
- 部署脚本会对 `backend` 执行 `pull` + `up -d --no-deps`，并可按 `BACKEND_HEALTH_URL` 做健康检查

### 3.2 服务器初始化清单（Ubuntu 24）

假设部署目录为 `~/bite-go`，并使用 `~/.env` 管理环境变量。

**安装 Docker 与 Compose 插件**

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

**配置当前用户可直接使用 docker**

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker version
docker compose version
```

**准备环境变量（~/.env）**

示例：

```bash
export QCLOUD_DOCKER_SERVER=xxx.tencentcloudcr.com
export QCLOUD_DOCKER_USERNAME=xxxx
export QCLOUD_DOCKER_PASSWORD=xxxx
export QCLOUD_DOCKER_REPOSITORY=bitego/backend
export BACKEND_DOMAIN=https://api.bitego.net/
export H5APP_DOMAIN=https://app.bitego.net/
export WEBADMIN_DOMAIN=https://admin.bitego.net/
```

`H5APP_DOMAIN` / `WEBADMIN_DOMAIN` 同时是后端 CORS 生产白名单的唯一来源：`NODE_ENV=production` 下这两个变量必须至少配置其一，否则后端 `createApp()` 启动即抛错（容器会 CrashLoop），避免 `/health` 正常但浏览器端全部被 CORS 拒绝的静默故障。`H5APP_DOMAIN` 同时用于 H5 扫码二维码内容 URL 的生成。

**克隆仓库并准备 .env（供 docker compose 使用）**

```bash
git clone <repo> ~/bite-go
ln -sf ~/.env ~/bite-go/.env
cd ~/bite-go
```

说明：`docker-compose.yml` 使用 `env_file: .env`，因此建议将仓库内 `.env` 软链接到 `~/.env`。

**首次启动依赖服务与验证**

```bash
docker compose up -d mysql redis
curl -fsS http://127.0.0.1:3000/health || true
```

首次部署：

```bash
bash ci/deploy-backend.sh <tag>
curl -fsS http://127.0.0.1:3000/health
docker compose ps
```

### 3.3 GitHub Actions

**推送 main 自动发布**

- 工作流：`.github/workflows/backend-cicd.yml`
- 触发：
  - `push main`：仅当变更涉及 `projects/backend/**`、`ci/build-backend-image.sh`、`ci/push-backend-image.sh`、`ci/deploy-backend.sh`、`docker-compose.yml` 或工作流文件本身时触发
  - `workflow_dispatch`：可手动触发，支持指定 tag、以及关闭 deploy 步骤

回滚建议：

- 重新触发 `workflow_dispatch` 并指定旧 tag（或在服务器上执行 `bash ci/deploy-backend.sh <old-tag>`）

**仅部署**

- 工作流：`.github/workflows/backend-cd-ssh.yml`

## 4. Web 管理端 CI/CD（COS 静态站点发布 + CDN 刷新）

### 4.1 构建与部署方式

- 构建产物：`projects/web-admin/dist`
- 发布方式：上传到腾讯云 COS（已开启静态网站托管）
- 上传完成后执行 CDN 刷新目录，避免旧资源被缓存

### 4.2 GitHub Actions

- 工作流：`.github/workflows/webadmin-cicd.yml`
- 触发：
  - `push main`：仅当变更涉及 `projects/web-admin/**`、`ci/deploy-webadmin-to-cos.sh` 或工作流文件本身时触发
  - `workflow_dispatch`：可手动触发，可关闭 deploy 步骤

部署脚本：

- `ci/deploy-webadmin-to-cos.sh`：使用 `coscmd upload -rs --delete` 将 `dist/` 同步到桶根路径

CDN 刷新：

- 上传完成后调用腾讯云 CDN 的“目录刷新”（`PurgePathCache`）刷新 `WEBADMIN_DOMAIN/`

## 5. 小程序 CI（构建验证，不发布）

小程序端仅做构建与基础质量门禁，确保主干代码可成功构建出 weapp 产物。

- 工作流：`.github/workflows/miniprogram-ci.yml`
- 触发：
  - `push main`：仅当变更涉及 `projects/miniprogram/**` 或工作流文件本身时触发
  - `pull_request`：同上
  - `workflow_dispatch`：可手动触发
- 流程：
  - `yarn install --immutable`
  - `yarn lint && yarn lint:style && yarn format:check && yarn test`
  - `yarn build:weapp`
  - `yarn build:h5`

## 6. H5 点餐端 CI/CD（COS 静态站点发布 + CDN 刷新）

H5 点餐端基于小程序项目的 H5 构建产物发布（`projects/miniprogram/dist`），发布方式与 Web 管理端一致：上传到 COS 桶根目录，并在上传后刷新 CDN 目录。

- 工作流：`.github/workflows/h5app-cicd.yml`
- 部署脚本：`ci/deploy-h5app-to-cos.sh`
- 触发：
  - `push main`：仅当变更涉及 `projects/miniprogram/**`、`ci/deploy-h5app-to-cos.sh` 或工作流文件本身时触发
  - `workflow_dispatch`：可手动触发，可关闭 deploy 步骤

## 6. Tag 规范建议

- 推荐：`<git-short-sha>` 或 `<YYYYMMDD>` 或 `<YYYYMMDDHHMMSS>`
- 生产发布建议固定到不可变 tag（不要只依赖 latest）

## 7. 安全注意事项

- 不要在日志中打印密码类变量
- 不要把 `.env`、SSH 私钥等敏感信息提交到仓库
- CI 平台建议用 Secret/变量管理注入上述环境变量
