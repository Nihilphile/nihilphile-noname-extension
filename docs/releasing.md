# 自动发布

仓库包含 `.github/workflows/release.yml`。当包含该工作流的源码已经提交到 GitHub 后，可使用以下任一方式发布完整扩展包。

## 标签发布

在需要发布的提交上创建并推送语义版本标签：

```text
git tag v1.4.0
git push origin v1.4.0
```

带后缀的标签（例如 `v1.4.0-rc.1`）会自动发布为 prerelease；不带后缀的三段版本标签会发布为正式 Release。

## 网页手动触发

在 GitHub 仓库的 Actions 页面选择 **Release extension**，点击 **Run workflow**，填写一个尚未使用的版本标签，并选择是否为 prerelease。

## 流水线内容

流水线会依次：

1. 若当前提交含有 `tests/*.js`，运行其中的全部测试。
2. 对扩展目录内可独立执行的 JavaScript 文件运行 `node --check`；`ycc_helpers.js` 与 `ycc_helpers_only.js` 是历史拼装片段，不作为独立文件检查。
3. 用 `scripts/package_extension.py` 生成无额外顶层目录、可直接导入的 ZIP，并逐文件校验归档内容。
4. 生成 `SHA256SUMS.txt`。
5. 上传 Actions 构件并创建 GitHub Release；同一标签重新运行时会覆盖对应附件。

发布只使用 GitHub 自动提供的 `GITHUB_TOKEN`，不需要配置个人访问令牌。CD 只会打包已经提交到触发版本标签或手动运行所选提交中的文件，不会包含任何本地未提交改动。
