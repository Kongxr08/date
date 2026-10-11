# 发布到 GitHub Pages，让 iPhone 可以打开

此项目是纯静态网页 App，没有构建依赖。以下步骤适用于你的公开仓库 `Kongxr08/date`。

## 上传源码

解压交付的源码包，把 `dist/`、`tests/`、`.github/`、`package.json`、`server.js`、`README.md`、`DEPLOY.md` 和 `VALIDATION.md` 上传到仓库根目录。`dist/` 内的资源文件必须保持在同一层级，不能只上传 HTML。

Windows 资源管理器可能隐藏 `.github`；上传前确认工作流文件 `.github/workflows/pages.yml` 存在。

## 开启发布

1. 打开仓库 **Settings → Pages**，将 **Source** 设置为 **GitHub Actions**。
2. 打开仓库 **Actions → Publish calendar PWA → Run workflow**，选择 `main` 并运行。
3. 等待测试、上传与部署三步成功。在工作流的 deployment 环境链接或 Settings → Pages 中打开实际发布 URL。
4. 成功发布后，用 iPhone Safari 打开该 URL，分享 → 添加到主屏幕。

工作流在 `main` 分支的相关源码发生更新时也会重新部署。工作流没有部署到 App Store，它发布的是可添加到主屏幕的网页 App。

## 其他托管服务

也可以把 `dist/` 整个文件夹发布到提供 HTTPS 的静态网站托管服务。没有构建命令；发布目录是 `dist`。保留资源路径和文件名。

## 本地查看

在安装了 Node.js 22 或更新版本的电脑上，于项目目录运行 `npm start`，浏览器打开 `http://127.0.0.1:4173`。

该本地地址只供电脑预览，不能直接作为手机安装地址。手机主屏幕版本需使用成功部署的 HTTPS 网页。
