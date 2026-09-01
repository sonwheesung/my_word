# -*- coding: utf-8 -*-
"""t('한국어 원문') 키가 en.json 에 있는지 검사. 이 앱은 원문이 곧 키다."""
import glob
import io
import json
import os
import re

d = json.load(io.open("src/i18n/locales/en.json", encoding="utf-8"))

# 앞에 영숫자·점이 오면 split( / at( / format( 같은 다른 함수다 — 배제한다
pat = re.compile(r"(?<![A-Za-z0-9_.])t\('((?:[^'\\]|\\.)+)'\)")

ESCAPES = [("\\n", "\n"), ("\\t", "\t"), ("\\'", "'"), ('\\"', '"'), ("\\\\", "\\")]


def unescape(raw):
    """⚠ unicode_escape 를 쓰면 안 된다 — UTF-8 바이트를 Latin-1 로 읽어 한글이 깨진다."""
    out = raw
    for a, b in ESCAPES:
        out = out.replace(a, b)
    return out


found = {}
files = glob.glob("src/**/*.tsx", recursive=True) + glob.glob("src/**/*.ts", recursive=True)
for f in files:
    src = io.open(f, encoding="utf-8").read()
    for m in pat.finditer(src):
        found.setdefault(unescape(m.group(1)), os.path.basename(f))

miss = [(k, v) for k, v in found.items() if k not in d]
print("추출한 키 %d개 · en.json %d개" % (len(found), len(d)))
print("영어 번역 누락: %d개" % len(miss))
for k, v in miss[:12]:
    print("  - [%s] %s" % (v, k.replace("\n", " / ")[:72]))
