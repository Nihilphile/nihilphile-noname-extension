#!/bin/sh
# Installed as this checkout's post-commit hook.
set -eu
branch=$(git symbolic-ref -q HEAD) || exit 0
attempt=1
while ! git push origin "$branch:$branch"; do
    if [ "$attempt" -ge 3 ]; then
        echo "本次提交已保存在本机。用 git push origin HEAD 可重试。" >&2
        exit 1
    fi
    sleep "$((attempt * 2))"
    attempt="$((attempt + 1))"
done
