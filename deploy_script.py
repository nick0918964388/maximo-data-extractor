"""Deploy maximo-data-extractor to 192.168.1.214"""
import subprocess
import paramiko
import os
import time

PROJECT_DIR = r"E:\nworkspace\maximo-data-extractor"
TAR_FILE = os.path.join(PROJECT_DIR, "deploy.tar.gz")
REMOTE_HOST = "192.168.1.214"
REMOTE_USER = "root"
REMOTE_PASS = "zaq1xsW2"
REMOTE_PATH = "/opt/maximo-data-extractor"
REMOTE_TAR = f"{REMOTE_PATH}/deploy.tar.gz"

# Step 1: Create tar.gz excluding unnecessary dirs
print("=" * 60)
print("Step 1: Creating tar.gz archive...")
print("=" * 60)

os.chdir(PROJECT_DIR)
tar_cmd = [
    "tar", "czf", "deploy.tar.gz",
    "--exclude=venv",
    "--exclude=node_modules",
    "--exclude=data",
    "--exclude=.git",
    "--exclude=__pycache__",
    "--exclude=frontend/dist",
    "--exclude=deploy.tar.gz",
    "--exclude=deploy_script.py",
    "."
]
result = subprocess.run(tar_cmd, capture_output=True, text=True)
if result.returncode != 0:
    print(f"tar failed: {result.stderr}")
    exit(1)

tar_size = os.path.getsize(TAR_FILE)
print(f"Archive created: {tar_size / 1024 / 1024:.2f} MB")

# Step 2: SFTP upload
print("\n" + "=" * 60)
print("Step 2: Uploading via SFTP...")
print("=" * 60)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

# Bind to 192.168.1.x interface to ensure correct routing
import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(10)
sock.bind(("192.168.1.39", 0))
sock.connect((REMOTE_HOST, 22))
print(f"TCP connection established via {sock.getsockname()}")

ssh.connect(REMOTE_HOST, username=REMOTE_USER, password=REMOTE_PASS, sock=sock, timeout=15)

sftp = ssh.open_sftp()
# Ensure remote dir exists
try:
    sftp.stat(REMOTE_PATH)
except FileNotFoundError:
    stdin, stdout, stderr = ssh.exec_command(f"mkdir -p {REMOTE_PATH}")
    stdout.channel.recv_exit_status()

print(f"Uploading {TAR_FILE} -> {REMOTE_TAR} ...")
sftp.put(TAR_FILE, REMOTE_TAR)
remote_size = sftp.stat(REMOTE_TAR).st_size
print(f"Upload complete: {remote_size / 1024 / 1024:.2f} MB")
sftp.close()

# Step 3: Extract + docker compose up --build -d
print("\n" + "=" * 60)
print("Step 3: Extracting and rebuilding on remote...")
print("=" * 60)

commands = [
    f"cd {REMOTE_PATH} && tar xzf deploy.tar.gz",
    f"cd {REMOTE_PATH} && docker compose up --build -d",
]

for cmd in commands:
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=300)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(out)
    if err:
        print(err)
    if exit_status != 0:
        print(f"Command failed with exit code {exit_status}")

# Step 4: Wait a moment then check logs
print("\n" + "=" * 60)
print("Step 4: Checking docker logs (last 50 lines)...")
print("=" * 60)

time.sleep(5)

cmd = f"cd {REMOTE_PATH} && docker compose logs --tail=50"
print(f">>> {cmd}")
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
stdout.channel.recv_exit_status()
out = stdout.read().decode()
err = stderr.read().decode()
if out:
    print(out)
if err:
    print(err)

ssh.close()

# Cleanup local tar
os.remove(TAR_FILE)
print("\nLocal deploy.tar.gz cleaned up.")
print("\nDeployment complete! Service at http://192.168.1.214:8000")
