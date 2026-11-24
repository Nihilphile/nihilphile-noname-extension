#!/bin/sh
# Installed as this checkout's post-commit hook.
set -eu
branch=$(git symbolic-ref -q HEAD) || exit 0
git push origin "$branch:$branch" || {
    echo "本次提交已保存在本机。恢复网络或处理分支分歧后，用 git push origin HEAD 重试。" >&2
    exit 1
}
