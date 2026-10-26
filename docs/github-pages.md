# GitHub 网页展示部署

目标：公开源码仓库 `luojiu-9999/yinghuo-footprints`，只部署网页版。仓库创建、GitHub连接授权和Pages设置需有对应账号权限；本文件/工作流存在不代表远端已经创建或部署成功。

## 一次性配置

1. 新建公开仓库 `yinghuo-footprints`，可以初始化README，默认分支 `main`。
2. 若GitHub应用只授权了选定仓库，把新仓库加入授权；不用发送密码或Token。
3. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
4. 上传应用源码，包括 `.github/workflows/pages.yml`。推送到main后工作流安装锁定依赖、构建、测试并发布 `dist/client`，不发布Worker服务端目录。
5. 等待Actions部署成功，以部署任务返回的网址和实际网页访问结果为准。

预期网址是 `https://luojiu-9999.github.io/yinghuo-footprints/`，上线前不能当作已可访问的链接。

## 本地验证项目子路径

```powershell
npm run build:pages
node --test tests/backup-domain.test.mjs tests/reliability.test.mjs tests/sites-worker.test.mjs
$env:PREVIEW_BASE_PATH = '/yinghuo-footprints/'
node scripts/verify-production.mjs
Remove-Item Env:PREVIEW_BASE_PATH
```

普通本机预览仍使用 `npm run build` 或开发服务器。示例图片、地图与原图备份中的 `/assets/...` 保持规范存储，由 `src/urls.js` 在访问时加上部署子路径，不改写旧照片数据或备份。

## 上传与隐私边界

- 只上传此应用，不上传上层工作区的其他项目。
- 不上传node_modules、dist、工具运行时、缓存、.env、凭据、旅行备份 .yhf 或浏览器数据库。
- 自动生成的QA截图、测试下载和历史运行数据默认不提交；源文件、静态地图、内置演示图片、测试脚本和验收Markdown可提交。
- 网页可公开访问，但每个访问者新增的照片/旅行仍保存在其浏览器里，不自动上传GitHub或共享给其他访问者。示例图片是内置演示素材，不是真实用户相册。
- 本机与线上域名的数据空间不同：如要迁移自己的旅行，应在旧地址导出原图备份，再到线上地址手动恢复。公开仓库不能作为私人相册备份盘。
- 没有启用账号、服务器、云同步、手机安装包或公开社交分享。

配置依据：[Vite静态部署](https://vite.dev/guide/static-deploy#github-pages)、[GitHub Pages工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
