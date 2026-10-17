#!/usr/bin/env python3
"""Thêm icon Lucide vào shared/icons.js (bỏ qua icon đã có).

  python3 add_icons.py grip-vertical eye eye-off trash-2 sliders-horizontal check

Vì sao cần script: chèn tay vào PATHS rất dễ quên dấu phẩy ở entry cuối
(entry cuối không có ',' nên chèn sau nó là lỗi cú pháp) — script tự xử lý.
"""
import re
import sys
import urllib.request

PATH = "shared/icons.js"


def inner(name: str):
    url = f"https://unpkg.com/lucide-static@latest/icons/{name}.svg"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            svg = r.read().decode()
    except Exception:
        return None
    s = re.sub(r"^.*?<svg[^>]*>", "", svg, flags=re.S)
    s = re.sub(r"</svg>\s*$", "", s, flags=re.S)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r">\s+<", "><", s).strip()
    return s.replace('"', '\\"')


def main(names):
    src = open(PATH, encoding="utf-8").read()

    # 1) bảo đảm entry CUỐI của PATHS có dấu phẩy trước khi chèn thêm
    m = re.search(r"\n(  \};)", src)
    head, tail = src[:m.start()], src[m.start():]
    lines = head.splitlines(keepends=True)
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip().startswith("'"):
            if not lines[i].rstrip().endswith(","):
                lines[i] = lines[i].rstrip("\n") + ",\n"
            break
    src = "".join(lines) + tail

    added = []
    for name in names:
        if re.search(r"^\s*'" + re.escape(name) + r"'\s*:", src, re.M):
            continue
        body = inner(name)
        if not body:
            print("  KHÔNG lấy được:", name)
            continue
        m = re.search(r"\n  \};", src)
        src = src[:m.start() + 1] + f"    '{name}': \"{body}\",\n" + src[m.start() + 1:]
        added.append(name)

    open(PATH, "w", encoding="utf-8").write(src)
    print("đã thêm:", added or "(không có gì mới)")


if __name__ == "__main__":
    main(sys.argv[1:])
