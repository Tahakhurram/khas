#!/usr/bin/env python3
"""
Create the KHAS usernames and passwords.

Run this yourself, in your own terminal (NOT inside an AI assistant):
    python3 tools/create_logins.py

What it does:
  1. Asks for three fine-grained GitHub tokens (input is hidden):
       OWNER  token  -> repos khas-data + khas-inbox, Contents: Read and write
       HOSTEL token  -> repo hostel-data only,        Contents: Read-only
       STAFF  token  -> repo khas-inbox only,         Contents: Read and write
  2. Checks each token can reach exactly what it should (and that the staff token can NOT open khas-data).
  3. Generates a strong random password for each login.
  4. Encrypts the right tokens with each password -> users.json (safe to publish: without the
     password the tokens cannot be recovered).
  5. Uploads credentials.xlsx (usernames + passwords) to the PRIVATE khas-data repo.
  6. Commits users.json in this app repo and pushes it if a remote is set.

Passwords are never printed. Open credentials/credentials.xlsx in khas-data to read them.
Re-run it whenever a token expires or you want to replace all passwords.
"""
import base64, datetime, getpass, io, json, os, secrets, subprocess, sys, urllib.error, urllib.request

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import openpyxl
from openpyxl.styles import Font, PatternFill

GH_OWNER = "Tahakhurram"
DATA_REPO, INBOX_REPO, HOSTEL_REPO = "khas-data", "khas-inbox", "hostel-data"
ITERATIONS = 600_000
# (username, role, display name). Display names are stored inside the encrypted part, not in public.
USERS = [
    ("khurram", "owner", "Khurram Suleman"), ("asma", "owner", "Asma Khurram"), ("taha", "owner", "Taha Khurram"), ("khizer", "owner", "Khizer Khurram"),
    ("owner5", "owner", "Owner 5 (backup)"), ("owner6", "owner", "Owner 6 (backup)"),
    ("staff1", "staff", "Staff 1"), ("staff2", "staff", "Staff 2"),
]
ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alike characters
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def b64(b): return base64.b64encode(b).decode()


def make_password():
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(4))  # e.g. Kx7m-Pq2r-Tz8w-Hn4c


def encrypt(password, payload):
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode())
    return {"salt": b64(salt), "iv": b64(iv), "ct": b64(AESGCM(key).encrypt(iv, json.dumps(payload).encode(), None))}


def gh(token, method, path, body=None):
    req = urllib.request.Request("https://api.github.com" + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}


def access(token, repo):
    """'write', 'read' or 'none'."""
    status, info = gh(token, "GET", f"/repos/{GH_OWNER}/{repo}")
    if status != 200: return "none"
    return "write" if info.get("permissions", {}).get("push") else "read"


def require(label, token, repo, want):
    got = access(token, repo)
    if got != want:
        sys.exit(f"{label} token: expected '{want}' access to {GH_OWNER}/{repo} but found '{got}'. Fix the token's repository access and permissions, then run this again.")
    print(f"  {label} token -> {repo}: {got}  OK")


def main():
    print(f"Repos: {GH_OWNER}/{DATA_REPO}, {GH_OWNER}/{INBOX_REPO}, {GH_OWNER}/{HOSTEL_REPO}\n")
    owner_token = getpass.getpass("Paste the OWNER token (khas-data + khas-inbox, read and write; hidden): ").strip()
    hostel_token = getpass.getpass("Paste the HOSTEL token (hostel-data, read-only; hidden. Press Enter to skip the hostel link): ").strip()
    staff_token = getpass.getpass("Paste the STAFF token (khas-inbox only, read and write; hidden): ").strip()

    require("Owner", owner_token, DATA_REPO, "write")
    require("Owner", owner_token, INBOX_REPO, "write")
    require("Staff", staff_token, INBOX_REPO, "write")
    require("Staff", staff_token, DATA_REPO, "none")      # staff must never be able to open the books
    require("Staff", staff_token, HOSTEL_REPO, "none")
    if hostel_token:
        got = access(hostel_token, HOSTEL_REPO)
        if got == "none": sys.exit(f"Hostel token cannot open {GH_OWNER}/{HOSTEL_REPO}.")
        print(f"  Hostel token -> {HOSTEL_REPO}: {got}  OK" + ("  (read-only is safer; KHAS never writes there)" if got == "write" else ""))
    else:
        print("  No hostel token: KHAS will run without the hostel feed.")

    today = datetime.date.today().isoformat()
    records, rows = [], []
    for username, role, name in USERS:
        pw = make_password()
        if role == "owner":
            payload = {"token": owner_token, "hostelToken": hostel_token, "owner": GH_OWNER, "name": name,
                       "repos": {"data": DATA_REPO, "inbox": INBOX_REPO, "hostel": HOSTEL_REPO if hostel_token else ""}}
        else:
            payload = {"token": staff_token, "owner": GH_OWNER, "name": name, "repos": {"inbox": INBOX_REPO}}
        records.append({"username": username, "role": role, **encrypt(pw, payload)})
        rows.append((username, pw, role.capitalize(), name, today))

    with open(os.path.join(APP_DIR, "users.json"), "w") as f:
        json.dump({"version": 1, "iterations": ITERATIONS, "users": records}, f, indent=2)
        f.write("\n")

    # credentials.xlsx -> private data repo (never written to this public repo, never printed)
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Credentials"
    ws.append(["Username", "Password", "Role", "For", "Created", "Given to"])
    for r in rows: ws.append(list(r) + [""])
    for c in ws[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="1F4D3A")
    for col, w in zip("ABCDEF", (14, 24, 10, 22, 12, 24)): ws.column_dimensions[col].width = w
    buf = io.BytesIO(); wb.save(buf)
    path = f"/repos/{GH_OWNER}/{DATA_REPO}/contents/credentials/credentials.xlsx"
    status, existing = gh(owner_token, "GET", path)
    body = {"message": "Update login credentials", "content": b64(buf.getvalue())}
    if status == 200: body["sha"] = existing["sha"]
    status, _ = gh(owner_token, "PUT", path, body)
    if status not in (200, 201): sys.exit(f"Upload of credentials.xlsx failed (HTTP {status}).")

    subprocess.run(["git", "-C", APP_DIR, "add", "users.json"], check=True)
    subprocess.run(["git", "-C", APP_DIR, "commit", "-m", "Update encrypted logins"], check=False)
    has_remote = subprocess.run(["git", "-C", APP_DIR, "remote"], capture_output=True, text=True).stdout.strip()
    if has_remote: subprocess.run(["git", "-C", APP_DIR, "push"], check=True)
    else: print("\nNo git remote set yet: users.json is committed locally. Push it once the khas repo exists on GitHub.")

    print(f"\n{len(rows)} logins created: " + ", ".join(r[0] for r in rows))
    print(f"Passwords are in {GH_OWNER}/{DATA_REPO} -> credentials/credentials.xlsx (private). They are not shown here.")


if __name__ == "__main__":
    main()
