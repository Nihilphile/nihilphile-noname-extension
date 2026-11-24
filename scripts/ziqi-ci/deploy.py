"""Publish the tested HEAD of the Nihil development branch."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

from build_bundle import build_bundle

repo = Path("/var/lib/ziqi-nihil/repo")
releases = Path("/srv/ziqi/www/extension/nihil-releases")
branch = "codex/baichi-character"
origin = "https://github.com/Nihilphile/nihilphile-noname-extension.git"
current = releases / "current"

def run(*args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)

def git(*args):
    return subprocess.check_output(["git", "-C", repo, *args], text=True).strip()

def deploy():
    repo.mkdir(parents=True, exist_ok=True)
    if not (repo / ".git").is_dir():
        run("git", "init", "-q", repo)
    visible = git("ls-remote", "--exit-code", origin, "refs/heads/" + branch).split()[0]
    if current.is_symlink() and os.readlink(current) == visible:
        return
    git("fetch", "--depth=1", "--no-tags", origin, "refs/heads/" + branch)
    version = git("rev-parse", "FETCH_HEAD")
    if not re.fullmatch(r"[0-9a-f]{40}", version):
        raise ValueError("Unexpected release identifier")
    git("checkout", "-q", "--detach", version)
    run("node", "scripts/test_portable.cjs", cwd=repo)
    run("node", "tests/baichi_engine_test.js", cwd=repo)
    source = repo / "nihilphile武将包"
    target = releases / version
    if not target.exists():
        with tempfile.TemporaryDirectory(dir=releases) as tmp:
            candidate = Path(tmp) / "release"
            candidate.mkdir(mode=0o755)
            build_bundle(source, "Nihilphile", candidate / "plugin.js",
                         asset_name="nihil-releases/" + version)
            with (candidate / "plugin.js").open() as stream:
                subprocess.run(["node","--input-type=module","--check"],stdin=stream,check=True)
            copy = ["rsync","-a","--checksum","--chmod=D755,F644"]
            if current.is_symlink():
                copy.append("--link-dest=" + str(current.resolve() / "image"))
            run(*copy, str(source / "image") + "/", candidate / "image")
            candidate.rename(target)
    run("node", Path(__file__).with_name("verify.cjs"), target, version)
    # If another commit arrived during validation, the next tick tests it.
    if git("ls-remote", "--exit-code", origin, "refs/heads/" + branch).split()[0] != version:
        return
    pointer = releases / ".next"
    pointer.unlink(missing_ok=True)
    pointer.symlink_to(version)
    pointer.replace(current)
    print("Live:", version, flush=True)

if __name__ == "__main__":
    deploy()
