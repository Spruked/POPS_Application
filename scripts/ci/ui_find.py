#!/usr/bin/env python3
"""CI only. Queries a `uiautomator dump` XML for the P.O.P.S. interface tests.

  ui_find.py DUMP topbar-title TEXT   exit 0 if TEXT is an exact node text inside the top bar
                                      (top 15% of the screen); prints the matching bounds
  ui_find.py DUMP tap-tab TEXT        print "x y" of the lowest on-screen node whose text is
                                      exactly TEXT (the bottom tab bar); exit 1 if none
  ui_find.py DUMP contains TEXT       exit 0 if any node's text contains TEXT
"""
import re
import sys
import xml.etree.ElementTree as ET

BOUNDS = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def nodes(path):
    root = ET.parse(path).getroot()
    for node in root.iter("node"):
        match = BOUNDS.fullmatch(node.get("bounds", ""))
        if not match:
            continue
        x1, y1, x2, y2 = map(int, match.groups())
        for label in (node.get("text", ""), node.get("content-desc", "")):
            yield label.strip(), (x1, y1, x2, y2)


def screen_height(path):
    heights = [b[3] for _, b in nodes(path)]
    return max(heights) if heights else 0


def main():
    path, mode, text = sys.argv[1], sys.argv[2], sys.argv[3]
    all_nodes = list(nodes(path))
    if mode == "contains":
        return 0 if any(text in label for label, _ in all_nodes) else 1
    exact = [b for label, b in all_nodes if label == text]
    if mode == "topbar-title":
        limit = screen_height(path) * 0.15
        hits = [b for b in exact if b[3] <= limit]
        for b in hits:
            print(b)
        return 0 if hits else 1
    if mode == "tap-tab":
        if not exact:
            return 1
        x1, y1, x2, y2 = max(exact, key=lambda b: b[1])
        print((x1 + x2) // 2, (y1 + y2) // 2)
        return 0
    raise SystemExit(f"unknown mode {mode}")


if __name__ == "__main__":
    sys.exit(main())
