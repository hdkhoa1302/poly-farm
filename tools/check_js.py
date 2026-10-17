#!/usr/bin/env python3
"""Kiểm cú pháp JS trong mọi file .html của repo.

Vì sao cần: một dấu phẩy thiếu trong mảng APPS của Hub làm CHẾT TOÀN BỘ script
(trang kẹt ở "Đang khởi động…", không app nào hiện) — mà HTML thì không có
linter nào bắt được. Script này tách từng khối <script> rồi cho `node --check`
soi, và kiểm cả importmap như JSON.

Dùng:
    python3 tools/check_js.py            # quét cả repo
    python3 tools/check_js.py index.html # chỉ 1 file

Thoát mã 1 nếu có lỗi — dùng được làm bước chặn trước khi push.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT_RE = re.compile(r"<script([^>]*)>(.*?)</script>", re.S | re.I)
ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')


def scripts(html: str):
    """[(attrs, body)] của các khối <script>."""
    for m in SCRIPT_RE.finditer(html):
        attrs = dict(ATTR_RE.findall(m.group(1)))
        yield attrs, m.group(2)


def check_file(path: str) -> list:
    """[(dòng, thông báo)] — rỗng nghĩa là sạch."""
    rel = os.path.relpath(path, ROOT)
    html = open(path, encoding="utf-8").read()
    bad = []

    for i, (attrs, body) in enumerate(scripts(html), 1):
        if "src" in attrs:                       # script ngoài, không kiểm ở đây
            continue
        kind = (attrs.get("type") or "").strip()
        line0 = html[:html.find(body)].count("\n") + 1 if body.strip() else 1

        if kind == "importmap":
            try:
                json.loads(body)
            except Exception as e:
                bad.append((line0, f"importmap #{i} không phải JSON hợp lệ: {e}"))
            continue
        if not body.strip():
            continue

        suffix = ".mjs" if kind == "module" else ".js"
        with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False, encoding="utf-8") as f:
            f.write(body)
            tmp = f.name
        try:
            r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True, timeout=60)
            if r.returncode != 0:
                msg = (r.stderr or r.stdout).strip().splitlines()
                detail = next((l for l in msg if "SyntaxError" in l or "Error" in l), msg[0] if msg else "?")
                bad.append((line0, f"script #{i}{' (module)' if kind == 'module' else ''}: {detail.strip()}"))
        finally:
            os.unlink(tmp)
    return bad


def main() -> int:
    if len(sys.argv) > 1:
        files = [os.path.join(ROOT, a) if not os.path.isabs(a) else a for a in sys.argv[1:]]
    else:
        files = []
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
            files += [os.path.join(dirpath, f) for f in filenames if f.endswith(".html")]
        files.sort()

    total = 0
    for p in files:
        if not os.path.exists(p):
            print("  thiếu file:", p)
            total += 1
            continue
        bad = check_file(p)
        if bad:
            total += len(bad)
            print(f"✗ {os.path.relpath(p, ROOT)}")
            for line, msg in bad:
                print(f"    dòng ~{line}: {msg}")
        else:
            print(f"✓ {os.path.relpath(p, ROOT)}")

    if total:
        print(f"\n{total} lỗi cú pháp — ĐỪNG push.")
        return 1
    print(f"\n{len(files)} file sạch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
