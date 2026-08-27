# S9-DEF-013 — cross-Python project-book determinism

## Observed final-closeout failure

The final closeout ran the repository command under the host Python 3.14.3:

```powershell
npm.cmd run docs:book:check
```

Observed sanitized result:

```text
Generated project book is stale. Run: npm run docs:book
exit 1
```

The same committed source and DOCX passed under the bundled document runtime,
Python 3.12.13. A temporary package comparison showed identical uncompressed
entry names, lengths and SHA-256 hashes, but different compressed lengths.
The remaining nondeterminism was therefore DEFLATE output produced by different
host zlib implementations, not project-book content. Temporary diagnostics were
kept outside Git and contained no credentials or personal data.

## Forward repair and regression

`scripts/generate-project-book.py` now writes sorted, normalized OPC entries as
`ZIP_STORED`. This remains a valid DOCX package and removes the host zlib version
from the artifact bytes. `project-book-contract.test.ts` requires stored entries
and rejects any return to `ZIP_DEFLATED`; that regression fails on the previous
generator.

Exact commands run:

```powershell
npm.cmd run docs:book
npm.cmd run docs:book:check
& 'C:\Users\Tal\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/generate-project-book.py --check
npm.cmd run test -- src/lib/project-book-contract.test.ts
```

Observed sanitized result:

```text
host Python 3.14.3: Generated project book is current and deterministic.
bundled Python 3.12.13: Generated project book is current and deterministic.
project-book-contract.test.ts: 1 file, 4 tests passed
```

## Page-by-page render verification

The regenerated `docs/project-book.docx` was opened read-only in Microsoft Word
16, exported to PDF, and rendered with bundled Poppler at 144 DPI.

Observed sanitized result:

```text
Pages: 5
Page size: 612 x 792 pts (Letter)
page-1.png ... page-5.png rendered successfully
Visual inspection: 5/5 clean; no clipping, overlap, table overflow, broken
RTL/mixed-script glyph, or header/footer defect.
```

No Hosted, Production, native 200% zoom, evaluator-access or human-rehearsal
result is inferred by this evidence.
