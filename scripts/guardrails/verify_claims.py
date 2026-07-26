#!/usr/bin/env python3
"""
Claim verifier (guardrail layer 2) -- catches hallucinated and stale assertions.

WHY THIS EXISTS
---------------
On 2026-07-26 the control files stated that T-0018 and T-0019 were the top open
items. They had shipped hours earlier in 71a17fd. Nothing detected it, because
nothing checks documentation against reality -- documentation is the one artifact
in the repo with no compiler, no test and no type system behind it.

Worse, the fix itself introduced new false claims: a reference to two review
files that did not exist, and a "working tree clean at 3877835" written while
five files were modified. Prose is where unverified assertions accumulate, and a
confidently wrong status file is more dangerous than an obviously stale one --
the next session trusts it and plans against it.

WHAT IT CHECKS (all machine-checkable -- no model, no judgement, no network)
---------------------------------------------------------------------------
  1. PATHS      every repo-relative path referenced in prose must exist
  2. COMMITS    every git SHA cited must resolve in this repository
  3. TASK IDS   every T-#### referenced must exist in TASK_QUEUE.md
  4. STATUS     no document may contradict TASK_QUEUE.md about a task's status
                -- this is the exact failure of 2026-07-26
  5. CITATIONS  every `file:line` citation must exist and be in range

Historical statements are exempt from check 4: a sentence containing "was",
"until", "previously", "no longer" and similar is describing the past on
purpose, and forcing those to match current state would make honest history
unwritable.

Exit codes: 0 clean · 1 findings · 2 usage error.

    python verify_claims.py                 # check the default document set
    python verify_claims.py --strict        # warnings become failures
    python verify_claims.py PATH...         # check specific files
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

# Documents whose factual claims are load-bearing for the next session.
DEFAULT_TARGETS = [
    ".claude/SESSION_HANDOVER.md",
    ".claude/TASK_QUEUE.md",
    ".claude/CURRENT_PHASE.md",
    ".claude/CURRENT_TASK.md",
    "docs/05-database/BACKUP_AND_RESTORE.md",
    "README.md",
]

# `reviews/` is deliberately NOT in the default set. A review is a point-in-time
# record: it SHOULD say "nothing is scheduled" if that was true when it was
# written. Rewriting history to satisfy a linter would destroy the audit trail.
# Their citations are still checkable via --citations-only.

TASK_QUEUE = Path(".claude/TASK_QUEUE.md")

STATUS_WORDS = ["done", "queued", "partial", "blocked", "in progress", "complete"]
HISTORICAL_MARKERS = [
    "was ", "were ", "until", "previously", "no longer", "used to", "had ",
    "shipped without", "said otherwise", "went stale", "before", "history",
    "originally", "at the time", "old ", "stale", "stopped", "stated",
]

# A token that looks like a path: has a slash and a file-ish suffix.
PATH_RE = re.compile(r"`([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron|txt))`")
# file:line or file:line-line
CITE_RE = re.compile(r"`?([A-Za-z0-9_./\-]+\.(?:ts|tsx|js|sh|ps1|sql|py|md|json|yml|yaml|cron)):(\d+)(?:-(\d+))?`?")
SHA_RE = re.compile(r"`([0-9a-f]{7,40})`")
TASK_RE = re.compile(r"\bT-(\d{4})\b")

# How close a status word must be to a task id to count as a claim about it.
PROXIMITY = 45


class Findings:
    def __init__(self) -> None:
        self.items: list[tuple[str, str, str]] = []   # (level, where, message)

    def add(self, level: str, where: str, msg: str) -> None:
        self.items.append((level, where, msg))

    @property
    def failures(self) -> int:
        return sum(1 for lvl, _, _ in self.items if lvl == "FAIL")

    @property
    def warnings(self) -> int:
        return sum(1 for lvl, _, _ in self.items if lvl == "WARN")


def git_object_exists(sha: str) -> bool:
    try:
        r = subprocess.run(
            ["git", "cat-file", "-t", sha],
            capture_output=True, text=True, timeout=15,
        )
        return r.returncode == 0 and r.stdout.strip() == "commit"
    except (OSError, subprocess.SubprocessError):
        return False


def canonical_task_status(queue_text: str) -> dict[str, str]:
    """
    Parse the TASK_QUEUE table -- it is the single source of truth for status.

    The status cell is prose as well as a verdict: T-0003 reads
    "**partial** -- organizations + tenant DB layer + audit done; ... outstanding".
    Scanning for the first status word anywhere in that cell returns "done",
    which is the opposite of what the row says. So the **bolded** verdict wins,
    and only if there is none do we fall back to a bare scan.
    """
    statuses: dict[str, str] = {}
    for line in queue_text.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        m = TASK_RE.search(cells[0])
        if not m:
            continue
        cell = cells[3]
        bold = re.findall(r"\*\*([^*]+)\*\*", cell)
        candidates = [b.lower() for b in bold] or [cell.lower()]
        chosen = None
        for cand in candidates:
            for w in STATUS_WORDS:
                if w in cand:
                    chosen = w
                    break
            if chosen:
                break
        if chosen:
            statuses[f"T-{m.group(1)}"] = chosen
    return statuses


def resolve_path(ref: str, repo_files: dict[str, list[Path]]) -> bool:
    """
    Does this referenced path point at a real file?

    Documentation legitimately writes paths relative to the directory it is
    talking about -- `./check-backup-health.sh` inside a section whose commands
    all run from `infrastructure/backup`. Demanding repo-root-relative paths
    everywhere would flag correct prose, and a checker that flags correct prose
    is one an operator learns to ignore. So: try root-relative first, then
    accept any unambiguous suffix match elsewhere in the repo.
    """
    clean = ref.lstrip("./")
    if Path(ref).exists() or Path(clean).exists():
        return True
    name = Path(clean).name
    for cand in repo_files.get(name, []):
        if str(cand).replace("\\", "/").endswith(clean):
            return True
    return False


def index_repo_files() -> dict[str, list[Path]]:
    """Map basename -> paths, so a relative reference can be resolved by suffix."""
    out: dict[str, list[Path]] = {}
    skip = {".git", "node_modules", ".next", "dist", "build", ".guardrails", "__pycache__"}
    for p in Path(".").rglob("*"):
        parts = set(p.parts)
        if parts & skip or not p.is_file():
            continue
        out.setdefault(p.name, []).append(p)
    return out


def is_historical(line: str) -> bool:
    low = line.lower()
    return any(mark in low for mark in HISTORICAL_MARKERS)


def check_document(path: Path, canonical: dict[str, str], f: Findings, citations_only: bool,
                   repo_files: dict[str, list[Path]]) -> None:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        f.add("FAIL", str(path), f"cannot read: {e}")
        return

    for lineno, line in enumerate(text.splitlines(), 1):
        where = f"{path}:{lineno}"

        # --- 5. citations: file:line must exist and be in range ------------
        for m in CITE_RE.finditer(line):
            target, start, end = m.group(1), int(m.group(2)), m.group(3)
            tp = Path(target)
            if not tp.exists():
                continue        # handled by the path check below
            try:
                n_lines = len(tp.read_text(encoding="utf-8", errors="replace").splitlines())
            except OSError:
                continue
            hi = int(end) if end else start
            if start < 1 or hi > n_lines:
                f.add("FAIL", where,
                      f"citation {target}:{m.group(2)}{'-' + end if end else ''} is out of range "
                      f"(file has {n_lines} lines)")

        if citations_only:
            continue

        # --- 1. paths must exist -------------------------------------------
        for m in PATH_RE.finditer(line):
            ref = m.group(1)
            if ref.startswith(("http", "//")) or " " in ref:
                continue
            # Bare filenames without a directory are usually generic prose
            # ("a package.json"), not a claim about a specific file here.
            if "/" not in ref:
                continue
            if not resolve_path(ref, repo_files):
                f.add("FAIL", where, f"referenced path does not exist: {ref}")

        # --- 2. commit SHAs must resolve ------------------------------------
        for m in SHA_RE.finditer(line):
            sha = m.group(1)
            if not re.fullmatch(r"[0-9a-f]+", sha):
                continue
            # Skip things that are plainly not SHAs: all digits, or hex that is
            # actually a status code like 0xC000013A written without the 0x.
            if sha.isdigit():
                continue
            if not git_object_exists(sha):
                f.add("WARN", where, f"cited commit does not resolve in this repo: {sha}")

        # --- 3 & 4. task ids and status agreement ---------------------------
        for m in TASK_RE.finditer(line):
            tid = f"T-{m.group(1)}"
            if tid not in canonical:
                f.add("FAIL", where, f"{tid} is referenced but is not in TASK_QUEUE.md")
                continue
            if path.samefile(TASK_QUEUE) if TASK_QUEUE.exists() else False:
                continue
            if is_historical(line):
                continue
            # Only a status word in the SAME CLAUSE is a claim about this id.
            # "the backup thread is complete, with delivery outstanding as
            # T-0023" describes the thread; "(T-0018). Phase 4 is blocked by..."
            # describes Phase 4. Clause boundaries separate them; raw proximity
            # does not, and a checker that flags correct prose gets switched off.
            lo = max((line.rfind(c, 0, m.start()) for c in ".;:"), default=-1) + 1
            hi_candidates = [line.find(c, m.end()) for c in ".;:"]
            hi_candidates = [h for h in hi_candidates if h != -1]
            hi = min(hi_candidates) if hi_candidates else len(line)
            clause = line[lo:hi]
            low = clause.lower()

            # "X is blocked ON T-0003" states a dependency, not T-0003's status.
            dep = re.search(r"blocked\s+on\s+" + re.escape(tid), clause, re.I)
            claimed = [w for w in STATUS_WORDS if w in low]
            if dep:
                claimed = [w for w in claimed if w != "blocked"]
            if not claimed:
                continue
            truth = canonical[tid]
            # "complete" and "done" are the same claim.
            norm = {"complete": "done"}
            claimed_n = {norm.get(c, c) for c in claimed}
            truth_n = norm.get(truth, truth)
            if truth_n not in claimed_n:
                f.add("WARN", where,
                      f"{tid} is described as {sorted(claimed_n)} but TASK_QUEUE.md says '{truth}'")


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify factual claims in project documentation.")
    ap.add_argument("targets", nargs="*", help="files to check (default: control files)")
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
    ap.add_argument("--citations-only", action="store_true",
                    help="only validate file:line citations (safe for reviews/)")
    args = ap.parse_args()

    if not TASK_QUEUE.exists():
        print(f"! {TASK_QUEUE} not found -- run from the repository root", file=sys.stderr)
        return 2

    canonical = canonical_task_status(TASK_QUEUE.read_text(encoding="utf-8", errors="replace"))
    targets = [Path(t) for t in (args.targets or DEFAULT_TARGETS)]

    repo_files = index_repo_files()
    f = Findings()
    checked = 0
    for t in targets:
        if not t.exists():
            f.add("WARN", str(t), "target document does not exist")
            continue
        checked += 1
        check_document(t, canonical, f, args.citations_only, repo_files)

    print(f"=== claim verification -- {checked} document(s), "
          f"{len(canonical)} known task ids ===")
    if not f.items:
        print("  OK        every checked claim resolves")
    for level, where, msg in f.items:
        print(f"  {level:<9} {where}: {msg}")

    print()
    if f.failures or (args.strict and f.warnings):
        print(f"RESULT: FAIL -- {f.failures} failure(s), {f.warnings} warning(s)")
        return 1
    if f.warnings:
        print(f"RESULT: PASS WITH WARNINGS -- {f.warnings} warning(s)")
        return 0
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
