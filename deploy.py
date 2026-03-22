"""Deploy maximo-data-extractor to remote server 192.168.1.214"""
import os
import subprocess
import tarfile
import paramiko
import time

# Config
PROJECT_DIR = r"E:\nworkspace\maximo-data-extractor"
REMOTE_HOST = "192.168.1.214"
REMOTE_USER = "root"
REMOTE_PASS = "zaq1xsW2"
REMOTE_PATH = "/opt/maximo-data-extractor"
TAR_NAME = "deploy.tar.gz"
LOCAL_TAR = os.path.join(PROJECT_DIR, TAR_NAME)
REMOTE_TAR = f"{REMOTE_PATH}/{TAR_NAME}"

EXCLUDE_DIRS = {"venv", "node_modules", "data", ".git", "__pycache__", ".claude", "tests"}
EXCLUDE_SUBPATHS = {os.path.join("frontend", "dist")}
EXCLUDE_FILES = {"deploy.tar.gz", "deploy.py", "package-lock.json", "playwright.config.js"}


def should_exclude(arcname):
    parts = arcname.replace("\\", "/").split("/")
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    for sp in EXCLUDE_SUBPATHS:
        if sp.replace("\\", "/") in arcname.replace("\\", "/"):
            return True
    basename = os.path.basename(arcname)
    if basename in EXCLUDE_FILES:
        return True
    return False


def create_tar():
    print("[1/3] Creating tar.gz package...")
    with tarfile.open(LOCAL_TAR, "w:gz") as tar:
        for item in os.listdir(PROJECT_DIR):
            full_path = os.path.join(PROJECT_DIR, item)
            if should_exclude(item):
                print(f"  Skipping: {item}")
                continue
            print(f"  Adding: {item}")
            tar.add(full_path, arcname=item, filter=lambda ti: None if should_exclude(ti.name) else ti)
    size_mb = os.path.getsize(LOCAL_TAR) / (1024 * 1024)
    print(f"  Package created: {size_mb:.1f} MB")


def upload_and_deploy():
    print(f"\n[2/3] Uploading to {REMOTE_HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(REMOTE_HOST, username=REMOTE_USER, password=REMOTE_PASS, timeout=15)

    # Ensure remote directory exists
    ssh.exec_command(f"mkdir -p {REMOTE_PATH}")
    time.sleep(1)

    # SFTP upload
    sftp = ssh.open_sftp()
    file_size = os.path.getsize(LOCAL_TAR)
    transferred = [0]

    def progress(sent, total):
        transferred[0] = sent
        pct = sent * 100 // total
        print(f"\r  Uploading: {pct}% ({sent // (1024*1024)}MB / {total // (1024*1024)}MB)", end="", flush=True)

    sftp.put(LOCAL_TAR, REMOTE_TAR, callback=progress)
    print(f"\n  Upload complete.")
    sftp.close()

    print(f"\n[3/3] Deploying on remote server...")
    commands = [
        f"cd {REMOTE_PATH} && tar xzf {TAR_NAME}",
        f"cd {REMOTE_PATH} && docker compose up --build -d",
    ]
    for cmd in commands:
        print(f"  Running: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=300)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", errors="replace").strip()
        err = stderr.read().decode("utf-8", errors="replace").strip()
        if out:
            print(f"  stdout: {out.encode('ascii', errors='replace').decode()}")
        if err:
            print(f"  stderr: {err.encode('ascii', errors='replace').decode()}")
        if exit_code != 0:
            print(f"  WARNING: Command exited with code {exit_code}")
        else:
            print(f"  OK (exit code 0)")

    ssh.close()
    print(f"\nDeployment complete! Service at http://{REMOTE_HOST}:8000")


if __name__ == "__main__":
    create_tar()
    upload_and_deploy()
