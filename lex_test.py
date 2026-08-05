import re
TAG_RE = re.compile(r'\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$')
OPEN_RE  = re.compile(r'(?i)^\s*(begin|start\s+transaction)\b[^;]*;\s*$')
CLOSE_RE = re.compile(r'(?i)^\s*(commit|end)\b(\s+(work|transaction))?(\s+and(\s+no)?\s+chain)?\s*;\s*$')

def line_top_level(sql):
    states = [True]
    i, n = 0, len(sql)
    dq, in_str, in_line_comment, block_depth = None, False, False, 0
    while i < n:
        ch = sql[i]
        if ch == '\n':
            in_line_comment = False
            i += 1
            states.append(dq is None and not in_str and block_depth == 0)
            continue
        if in_line_comment:
            i += 1; continue
        if block_depth:
            if sql.startswith('/*', i): block_depth += 1; i += 2; continue
            if sql.startswith('*/', i): block_depth -= 1; i += 2; continue
            i += 1; continue
        if in_str:
            if ch == "'":
                if sql.startswith("''", i): i += 2; continue
                in_str = False
            i += 1; continue
        if dq is not None:
            m = TAG_RE.match(sql, i)
            if m and m.group(0) == dq:
                dq = None; i += len(m.group(0)); continue
            i += 1; continue
        if sql.startswith('--', i): in_line_comment = True; i += 2; continue
        if sql.startswith('/*', i): block_depth = 1; i += 2; continue
        if ch == "'": in_str = True; i += 1; continue
        m = TAG_RE.match(sql, i)
        if m: dq = m.group(0); i += len(m.group(0)); continue
        i += 1
    return states, dq, in_str, block_depth

# --- the OLD toggle, so we can prove the new one differs on the exploit ---
def old_toggle(sql):
    states, dq = [True], None
    for ln in sql.split('\n')[:-1]:
        for t in TAG_RE.findall(ln):
            dq = t if dq is None else (None if dq == t else dq)
        states.append(dq is None)
    return states

CASES = [
  ("A1 exploit: $$ in a line comment", "-- $$\nCOMMIT;\n-- $$\n", 1, True),
  ("$$ in a string literal",           "SELECT '$$';\nCOMMIT;\n",  1, True),
  ("$$ in a block comment",            "/* $$ */\nCOMMIT;\n",      1, True),
  ("nested block comment",             "/* a /* b */ $$ */\nCOMMIT;\n", 1, True),
  ("'' escape inside string",          "SELECT 'it''s $$';\nCOMMIT;\n", 1, True),
  ("real plpgsql body END; hidden",    "CREATE FUNCTION f() RETURNS void AS $$\nBEGIN\nEND;\n$$ LANGUAGE plpgsql;\n", 2, False),
  ("tagged body $verify$ hidden",      "DO $verify$\nBEGIN\nCOMMIT;\nEND;\n$verify$;\n", 2, False),
]
fails = 0
for name, sql, line, want in CASES:
    got = line_top_level(sql)[0][line]
    ok = "PASS" if got == want else "FAIL"
    if got != want: fails += 1
    print(f"  [{ok}] {name}: line {line} top_level={got} want={want}")

print("\n  Does the NEW lexer actually differ from the OLD toggle on the exploit?")
sql = "-- $$\nCOMMIT;\n-- $$\n"
print(f"    old toggle says top_level={old_toggle(sql)[1]}  (COMMIT invisible -> would PERSIST)")
print(f"    new lexer  says top_level={line_top_level(sql)[0][1]}  (COMMIT stripped)")
assert old_toggle(sql)[1] is False, "old toggle should have been fooled - test is not proving anything"
print("\n  ==> the defect IS reproduced by the old code and IS caught by the new")
raise SystemExit(1 if fails else 0)
