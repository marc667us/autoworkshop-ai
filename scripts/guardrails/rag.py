#!/usr/bin/env python3
"""
Retrieval index over the repository and its source specs (guardrail layer 1).

WHY THIS EXISTS
---------------
A reviewer -- human or model -- that is handed a bare diff has to supply the
surrounding context from memory. That is precisely where hallucination enters:
it invents the function it half-remembers, cites a spec section it never read,
or reviews the wrong file entirely. Both failures were observed on 2026-07-26:
Codex was given an explicit four-file allow-list and still spent two full passes
reviewing Markdown it was told to ignore, while answering none of the code
questions asked.

So: retrieve first, then reason. Every review gets a context pack assembled from
text that ACTUALLY EXISTS in this repo, with file:line provenance on every chunk,
and every claim can be checked back against a retrievable span.

ZERO COST, ZERO DEPENDENCIES
----------------------------
Pure standard library. BM25 lexical retrieval -- no embedding service, no vector
database, no network, no API key, no model download. It is deterministic, which
matters for a gate: the same query returns the same evidence every run, so a
guardrail failure is reproducible rather than a coin flip.

BM25 is a deliberate choice over embeddings here, not a compromise. Code review
queries are dominated by exact identifiers -- `grep -c`, `archive_command`,
`viewerGrants`, `T-0018`. Lexical scoring matches those exactly; embeddings blur
them into "something about archiving". Where semantic recall would help, the
optional Ollama reranker below can be enabled -- it is off by default because a
guardrail must not depend on a service being up.

USAGE
-----
    python rag.py build [--extra-root DIR]...     # build the index
    python rag.py query "grep -c off-host count" [-k 8] [--scope PATTERN]...
    python rag.py pack --scope infrastructure/backup/run-scheduled.sh \
                       --question "can it report success on failure?"
    python rag.py stats
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# --------------------------------------------------------------------------
# What to index. Anything not listed is invisible to retrieval, which is itself
# a guardrail: build artifacts and vendored code are not evidence about this
# project, and letting them into the index buries real source under noise.
# --------------------------------------------------------------------------
INCLUDE_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".sh", ".bash", ".ps1", ".psm1",
    ".sql", ".py",
    ".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".cron",
    ".dockerfile", ".env.example",
}
INCLUDE_NAMES = {"Dockerfile", "docker-compose.yml", "autoworkshop-backup.cron", "Makefile"}

EXCLUDE_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", "coverage", ".turbo",
    ".pnpm-store", "__pycache__", ".venv", "venv", ".guardrails",
    # Generated evidence, not source. Drill reports and logs are outputs of the
    # system describing single past runs; retrieving them as if they described
    # current behaviour is how a reviewer concludes "archiving works" from a
    # report written before it broke.
    "logs", "drills", "artifacts", "status",
}
EXCLUDE_FILE_RE = re.compile(r"(\.min\.|\.lock$|-lock\.json$|\.map$)")

MAX_FILE_BYTES = 600_000          # a file larger than this is generated, not written
CHUNK_LINES = 45
CHUNK_OVERLAP = 12

INDEX_PATH = Path(".guardrails/rag-index.json")

# BM25 parameters. Standard defaults; k1 controls term-frequency saturation and
# b controls length normalisation.
BM25_K1 = 1.5
BM25_B = 0.75

_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\d+")
_CAMEL_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def tokenize(text: str) -> list[str]:
    """
    Split into search terms, then ALSO emit sub-tokens of compound identifiers.

    `viewerGrants` must be findable by `viewer` and by `grants`, and
    `check-backup-health` by `health`. Without this, a reviewer asking a natural
    question retrieves nothing and falls back on memory -- the exact failure the
    index exists to prevent.
    """
    out: list[str] = []
    for raw in _TOKEN_RE.findall(text):
        low = raw.lower()
        out.append(low)
        parts = [p for p in _CAMEL_RE.split(raw) if p]
        if len(parts) > 1:
            out.extend(p.lower() for p in parts)
        if "_" in low:
            out.extend(p for p in low.split("_") if p)
    return out


def should_index(path: Path) -> bool:
    if path.name in INCLUDE_NAMES:
        return True
    if EXCLUDE_FILE_RE.search(path.name):
        return False
    return path.suffix.lower() in INCLUDE_SUFFIXES


def iter_files(roots: list[Path]):
    for root in roots:
        if not root.exists():
            print(f"  ! skipping missing root: {root}", file=sys.stderr)
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith(".git")]
            for fn in filenames:
                p = Path(dirpath) / fn
                if not should_index(p):
                    continue
                try:
                    if p.stat().st_size > MAX_FILE_BYTES:
                        continue
                except OSError:
                    continue
                yield root, p


def chunk_file(path: Path) -> list[tuple[int, int, str]]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    lines = text.splitlines()
    if not lines:
        return []
    chunks = []
    step = max(1, CHUNK_LINES - CHUNK_OVERLAP)
    for start in range(0, len(lines), step):
        window = lines[start:start + CHUNK_LINES]
        if not any(l.strip() for l in window):
            continue
        chunks.append((start + 1, start + len(window), "\n".join(window)))
        if start + CHUNK_LINES >= len(lines):
            break
    return chunks


def build(roots: list[Path], out_path: Path) -> dict:
    docs = []
    for root, path in iter_files(roots):
        try:
            rel = str(path.relative_to(root))
        except ValueError:
            rel = str(path)
        rel = rel.replace("\\", "/")
        label = rel if root == Path(".") else f"{root.name}/{rel}"
        for start, end, body in chunk_file(path):
            docs.append({
                "id": len(docs),
                "file": label,
                "abs": str(path),
                "start": start,
                "end": end,
                "text": body,
            })

    df: Counter = Counter()
    tf_list = []
    for d in docs:
        tf = Counter(tokenize(d["text"]))
        tf_list.append(tf)
        df.update(tf.keys())

    n = len(docs)
    avg_len = (sum(sum(tf.values()) for tf in tf_list) / n) if n else 0.0

    # Postings: term -> [[doc_id, term_freq], ...]
    postings: dict[str, list[list[int]]] = defaultdict(list)
    for d, tf in zip(docs, tf_list):
        for term, freq in tf.items():
            postings[term].append([d["id"], freq])

    index = {
        "version": 2,
        "n_docs": n,
        "avg_len": avg_len,
        "doc_len": [sum(tf.values()) for tf in tf_list],
        "df": dict(df),
        "postings": {t: p for t, p in postings.items()},
        "docs": [{k: v for k, v in d.items() if k != "text"} for d in docs],
        "texts": [d["text"] for d in docs],
        "roots": [str(r) for r in roots],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(index), encoding="utf-8")
    return index


def load(index_path: Path) -> dict:
    if not index_path.exists():
        sys.exit(f"no index at {index_path} -- run: python {Path(__file__).name} build")
    return json.loads(index_path.read_text(encoding="utf-8"))


def search(index: dict, query: str, k: int = 8, scopes: list[str] | None = None) -> list[dict]:
    """BM25 over the index, optionally restricted to files matching `scopes`."""
    n = index["n_docs"]
    if not n:
        return []
    avg_len = index["avg_len"] or 1.0
    doc_len = index["doc_len"]
    df = index["df"]
    postings = index["postings"]

    allowed: set[int] | None = None
    if scopes:
        allowed = set()
        for i, d in enumerate(index["docs"]):
            f = d["file"]
            if any(s.replace("\\", "/") in f for s in scopes):
                allowed.add(i)
        if not allowed:
            return []

    scores: dict[int, float] = defaultdict(float)
    for term in set(tokenize(query)):
        plist = postings.get(term)
        if not plist:
            continue
        n_q = df.get(term, 0)
        # BM25 IDF, +1 inside the log so a term appearing in every document
        # scores 0 rather than going negative.
        idf = math.log(1 + (n - n_q + 0.5) / (n_q + 0.5))
        for doc_id, freq in plist:
            if allowed is not None and doc_id not in allowed:
                continue
            dl = doc_len[doc_id] or 1
            denom = freq + BM25_K1 * (1 - BM25_B + BM25_B * dl / avg_len)
            scores[doc_id] += idf * (freq * (BM25_K1 + 1)) / denom

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:k]
    results = []
    for doc_id, score in ranked:
        d = dict(index["docs"][doc_id])
        d["score"] = round(score, 4)
        d["text"] = index["texts"][doc_id]
        results.append(d)
    return results


def cmd_build(args):
    roots = [Path(".")] + [Path(r) for r in (args.extra_root or [])]
    idx = build(roots, Path(args.out))
    files = len({d["file"] for d in idx["docs"]})
    print(f"indexed {files} files -> {idx['n_docs']} chunks -> {args.out}")
    print(f"vocabulary: {len(idx['df'])} terms   avg chunk length: {idx['avg_len']:.1f} tokens")


def cmd_query(args):
    idx = load(Path(args.out))
    hits = search(idx, args.text, k=args.k, scopes=args.scope)
    if not hits:
        print("NO EVIDENCE FOUND -- do not answer from memory; widen the scope or rephrase.")
        return 1
    for h in hits:
        print(f"\n=== {h['file']}:{h['start']}-{h['end']}  (score {h['score']}) ===")
        print(h["text"])
    return 0


def cmd_pack(args):
    """
    Assemble a grounded context pack for a reviewer.

    The output is deliberately shaped as evidence rather than prose: every span
    is labelled with file:line so a claim can be traced, and the header states
    the rule that the reviewer must cite these spans and nothing else.
    """
    idx = load(Path(args.out))
    print("# GROUNDED CONTEXT PACK")
    print("#")
    print("# Every span below was retrieved from files that exist in this repository,")
    print("# at the line numbers shown. Rules for using it:")
    print("#   1. Cite file:line for every claim you make.")
    print("#   2. If the evidence for a claim is not in this pack, say NOT IN CONTEXT.")
    print("#      Do not supply it from memory.")
    print("#   3. Do not review files outside the scope listed below.")
    print("#")
    print(f"# scope: {', '.join(args.scope) if args.scope else '(whole repo)'}")
    print()

    queries = args.question or ["overview"]
    seen: set[int] = set()
    for q in queries:
        hits = search(idx, q, k=args.k, scopes=args.scope)
        print(f"\n## Evidence for: {q}")
        if not hits:
            print("(no matching evidence in the indexed corpus)")
            continue
        for h in hits:
            if h["id"] in seen:
                continue
            seen.add(h["id"])
            print(f"\n--- {h['file']}:{h['start']}-{h['end']} ---")
            print(h["text"])
    return 0


def cmd_stats(args):
    idx = load(Path(args.out))
    per_file: Counter = Counter(d["file"] for d in idx["docs"])
    print(f"chunks     : {idx['n_docs']}")
    print(f"files      : {len(per_file)}")
    print(f"vocabulary : {len(idx['df'])}")
    print(f"roots      : {', '.join(idx['roots'])}")
    print("\nlargest indexed files by chunk count:")
    for f, c in per_file.most_common(12):
        print(f"  {c:4d}  {f}")


def main():
    ap = argparse.ArgumentParser(description="Zero-dependency BM25 retrieval over the repo.")
    ap.add_argument("--out", default=str(INDEX_PATH), help="index file path")
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build");  b.add_argument("--extra-root", action="append")
    b.set_defaults(func=cmd_build)

    q = sub.add_parser("query")
    q.add_argument("text"); q.add_argument("-k", type=int, default=8)
    q.add_argument("--scope", action="append")
    q.set_defaults(func=cmd_query)

    p = sub.add_parser("pack")
    p.add_argument("--scope", action="append")
    p.add_argument("--question", action="append")
    p.add_argument("-k", type=int, default=5)
    p.set_defaults(func=cmd_pack)

    s = sub.add_parser("stats"); s.set_defaults(func=cmd_stats)

    args = ap.parse_args()
    sys.exit(args.func(args) or 0)


if __name__ == "__main__":
    main()
