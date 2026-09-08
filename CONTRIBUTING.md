# Version management

- `main` 保存可发布源码，后续更新使用 `feat/...` 或 `fix/...` 分支，通过 Pull Request 合并。
- 提交 PR 前执行 `npm run check:version`、`npm test`、`npm run package`。
- GitHub 使用三段版本：修复 `0.1.1`，功能更新 `0.2.0`；同时更新 `package.json`、`manifest.json`、界面版本和 CHANGELOG。
- `RELEASE_NOTES.md` 始终描述即将发布的版本；保存历史内容到 CHANGELOG。
- 测试通过并合并后创建不可重用的标签，例如 `v0.1.1`。标签必须与 package/manifest 完全一致。
- 推送版本标签自动执行测试、生成插件 ZIP 与 SHA256 校验文件，然后创建 GitHub Release。
- 已发布标签和附件不覆盖，修复使用新版本。不要提交凭证、HAR、个人配置或调试导出。

```sh
npm run check:version
npm test
npm run package
git tag -a v0.1.1 -m 'Release v0.1.1'
git push origin v0.1.1
```

以上标签示例只在版本文件已经更新并合并后执行。构建输出位于 `dist/`，不提交到 Git。
