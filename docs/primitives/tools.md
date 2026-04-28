---
status: current
owner: primitives
kind: research
updated: 2026-04-28
---

# Tools — The Agent's Hands

> Status: research note with current implementation snapshot
> Last updated: 2026-04-28

What tools should a coding agent have? We studied six production systems — opencode, Claude Code, Cursor, Aider, SWE-agent, and Codex CLI — to find the minimal set that makes an agent genuinely useful. This document is the result: a tiered catalog with design notes, rationale, and cross-system comparison.

The short answer: **6 irreducible tools** (`read_file`, `list_dir`, `search_replace`, `shell`, `grep`, `glob`), **3 high-leverage additions** (`write_file`, `multi_edit`, `web_fetch`), and a few scaffolding tools that will thin as models improve. Everything else is either covered by shell or better served by MCP.

## Current Implementation

Concrete first-party tools currently live in `packages/theseus-tools/src`.

Implemented today:

- `read_file`
- `write_file`
- `search_replace`
- `list_dir`
- `glob`
- `grep`
- `shell`
- `outline`

There is no first-party `multi_edit` or `web_fetch` tool in this package today.
Tool selection for runtime dispatch goes through `ToolCatalog` in
`packages/theseus-runtime/src/tool-catalog.ts`.

---

## How Other Systems Do It

### Claude Code — Structured Intent Over Shell

**18 tools.** The philosophy: don't make the LLM parse shell output when you can give it structured tools.

Core set: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `MultiEdit`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoRead`, `TodoWrite`, plus agent/task tools.

The defining design choice: **Bash is explicitly forbidden from doing file operations.** The system prompt says "do NOT use bash to run `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`" — forcing the model into dedicated tools instead. This isn't a limitation; it's a legibility choice. When the model calls `Grep`, its intent is transparent. When it pipes `find | grep | awk`, intent is buried in shell syntax and failures are harder to diagnose.

Key details per tool:
- **Read**: 2,000 line default cap. Supports offset/limit for large files. Returns `cat -n` format (line numbers). Can read images (multimodal), PDFs (page ranges), and Jupyter notebooks. Truncates lines >2,000 chars. The model must read before editing — enforced at the tool level.
- **Edit**: Exact string replacement. `old_string` must be unique in the file, or `replace_all: true` must be set. Forces awareness — no blind edits.
- **Write**: Full file overwrite only. For new files or complete rewrites. Refuses to write if the file wasn't read first (prevents clobbering).
- **Bash**: 2-minute default timeout (configurable to 10 min). Can run in background. The escape hatch for everything tools don't cover.
- **Glob**: Pattern matching (`**/*.ts`), results sorted by modification time. No `find` needed.
- **Grep**: Ripgrep under the hood. Supports regex, context lines (`-A`/`-B`/`-C`), file type filtering, three output modes (`content`, `files_with_matches`, `count`). Head limit for capping results.

**Why this matters for us:** Claude Code proves that a structured toolset with enforced boundaries (no grep in bash) produces more legible, recoverable agent behavior than an open shell. The 6 core tools (`read_file`, `write_file`, `search_replace`, `shell`, `glob`, `grep`) are the irreducible set — everything else is ergonomic.

### opencode — The Kitchen Sink (25 Tools)

**25 tools** across file ops, LSP, diagnostics, task management, and lifecycle. The most comprehensive toolset we studied.

Organized by domain:
- **File ops (8):** read, write, edit (search/replace), multi-edit, glob, grep, patch (unified diff), list directory
- **LSP (9):** diagnostics, hover, definition, references, implementation, rename, code actions, document symbols, workspace symbols
- **Shell (1):** full shell with configurable timeout
- **Task management (2):** todo read/write
- **Web (2):** web fetch, web search
- **Lifecycle (3+):** capsule tools (open, lock, close, log, read, list, render, reopen)

The standout features:

**Search/replace with 9 fuzzy fallback strategies.** When exact match fails, opencode tries: whitespace normalization, indent normalization, line-ending normalization, leading/trailing whitespace trim, collapsed whitespace, approximate matching, and more. This is the single biggest investment in edit reliability we found anywhere.

**Post-edit diagnostics.** After every file edit, opencode runs LSP diagnostics on the affected file and returns errors as part of the tool result. The model sees "your edit introduced 2 type errors on lines 45 and 67" immediately, not on the next test run. This is the single biggest quality lever — fast feedback loops beat retry loops.

**Full LSP suite (9 operations).** Go-to-definition, find-references, hover, rename, code actions, document/workspace symbols, implementation, diagnostics. This is arguably too many tools — the model has to choose between 25 options. But each operation is genuinely useful for code understanding.

**Why this matters for us:** opencode shows what "maximally capable" looks like. We don't want 25 tools (too much choice for the model), but the fuzzy search/replace fallback and post-edit diagnostics are must-steal ideas.

### Cursor — Semantic Search + Structured Edits

**~12 tools.** The differentiator: **custom-trained embedding model** for semantic codebase search.

Core architecture:
- **Semantic search**: Custom embedding model (not OpenAI/third-party). Indexes codebase on first use, local to workspace. Natural language queries like "where do we handle authentication?" retrieve relevant code without exact keyword matches.
- **Grep**: Regex search for exact matches.
- **The combination**: Semantic search identifies candidate files/regions → grep refines within those regions. This solves both "semantic drift" (embeddings alone can wander) and "keyword blindness" (grep misses refactored/renamed code).

**Performance data:** Semantic search achieves 12.5% higher accuracy vs. grep alone (range: 6.5%–23.5% depending on model capability). The gap widens for tasks requiring conceptual understanding ("find the rate limiter") vs. literal search ("find `rateLimiter`").

**The Reapply tool.** When an edit fails (search text changed since the model read the file), `reapply` lets the model re-propose without full re-reading. This matters for long agent runs where files change between tool calls. Most other systems handle this at the edit-tool level (fuzzy matching); Cursor makes it a separate tool.

**Why this matters for us:** We're not building semantic search (requires embedding infrastructure), but the grep + glob combination covers 80% of the use case. Semantic search slots in via MCP later without changing the core toolset.

### Aider — Edit Format Elasticity

**Minimal tools, maximum format flexibility.** Aider's core innovation: the best edit format depends on the model.

Four edit formats:

| Format | How It Works | Best For |
|---|---|---|
| **whole** | Model returns entire file in a code fence | Small files, simple models. Expensive — full file even for 1-line edits. |
| **diff** | `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` blocks | GPT-4, Claude. 84%+ success rate. The de facto standard. |
| **udiff** | Unified diff format with `---`, `+++`, `@@`, `-`/`+` prefixes | GPT-4 Turbo. Explicit removal markers reduce "lazy coding" (model replacing code with comments). |
| **diff-fenced** | Diff format with file path inside the fence | Gemini. Addresses Gemini-specific issues with path placement. |

**Key insight: edit format is model-dependent.** GPT-4 was trained on diffs; Claude handles search/replace blocks naturally; Gemini has idiosyncratic fence conventions. Aider auto-detects the model family and selects the format. Most other systems hardcode one format.

**Repository Map.** At session start, Aider generates a lightweight file tree + symbol index (exported function/class names). This goes into the system prompt as a "bird's eye view" — enough for the model to know what exists without reading every file. Regenerated after each edit to stay current.

**Error recovery.** When a search block isn't found:
1. Aider provides specific feedback: "Search block on lines X–Y not found; showing current content."
2. The model re-reads and retries.
3. Recovery is visible in the conversation, not hidden in retry logic.

**Why this matters for us:** We'll use search/replace blocks (the `diff` format). It works well with Claude and has the highest empirical success rate. The repo-map concept maps to our `find_references` / skeleton approach — give the model structure without flooding context.

### SWE-agent — The Evolution From Custom Tools to Bash

**The most instructive trajectory.** SWE-agent went from 10 custom tools (v1) to "just bash" (mini-SWE-agent), demonstrating how model capability reshapes tool design.

**v1: 10 custom tools for the Agent-Computer Interface (ACI)**

The NeurIPS 2024 paper's thesis: a Linux shell is not a good interface for language model agents. Humans handle context switching and output parsing; models benefit from structured, domain-specific interfaces.

The tools:
- `open(file, start_line, end_line)` — open file with scrollable viewport
- `goto(line_number)` — move viewport
- `scroll_up()` / `scroll_down()` — 100-line window navigation
- `search_file(query)` — search within open file
- `search_dir(query)` — search across all files
- `find_file(pattern)` — find files by name
- `create(file_path)` — create new file
- `edit(start_line, end_line, replacement)` — replace lines in viewport
- `run_tests()` — execute tests
- `submit()` — finalize

The **viewport model** (open → scroll → edit) mirrors a human using vim. It works — 12.5% pass rate on SWE-bench (vs. 3–4% for non-interactive LLMs at the time), 87.7% on HumanEvalFix.

**v2 / mini-SWE-agent: just bash**

Then models got better. mini-SWE-agent (~100 lines of Python) achieves **>74% SWE-bench verified** with **only bash**. No custom tools.

Each action is completely stateless:
```python
subprocess.run(["bash", "-c", "command"])  # no persistent shell session
```

Why bash-only works now:
- Models compose shell commands creatively (`gh pr create`, not a custom `submit` tool)
- Models navigate files via `cat`, `head`, `grep` without a custom viewer
- Models parse subprocess output without custom formatting
- No tool documentation overhead — bash is universal knowledge
- Sandboxing is trivial: swap `subprocess.run` → `docker exec`

**The tradeoff:** v1 had higher per-tool quality (structured feedback, guardrails). mini-SWE-agent has lower per-action quality but is simpler, cheaper, and works with any model. For production, simplicity wins.

**What this means for the field:** The SWE-agent trajectory predicts that custom tools will thin over time. Structured tools are worth the complexity *today* because they improve feedback quality, but the number of tools should be as small as possible. The viewport model (open/scroll/goto) is already obsolete — `read_file` with offset/limit is sufficient for modern context windows.

**Why this matters for us:** We're building structured tools (not bash-only) because feedback quality matters. But we should build the minimum set and resist tool proliferation. SWE-agent v1's 10 tools → bash is a cautionary tale about overbuilding.

### Codex CLI (OpenAI) — Shell + Patch, Nothing More

**2 tools.** The most minimal production system.

- **Shell execution** with configurable sandboxing
- **apply_patch** — structured file edit using unified diff format

**apply_patch format:**
```
*** Begin Patch
--- a/path/to/file.ts
+++ b/path/to/file.ts
@@ -10,5 +10,6 @@
 context line
-old line
+new line
+added line
 context line
*** End Patch
```

Uses **context lines to anchor edits**, not line numbers. This is more robust when files change between reads and edits — the context identifies the location even if line numbers shift.

**Sandboxing levels:**
1. **No sandbox** (`--dangerously-bypass`): full filesystem + network access
2. **Policy-based**: restrict network; allow `/tmp` or workspace writes without approval
3. **Containerized** (Linux): minimal container with firewall restrictions; project directory mounted in

**Approval gates.** Codex emphasizes user approval for each file edit or shell command. This is a safety boundary: the model proposes, the user approves. Different philosophy from auto-executing tools.

**Why 2 tools are enough:** Shell covers everything the model knows how to do via CLI — running tests, installing dependencies, git operations, network requests. apply_patch covers all file edits. Together, they're functionally complete. The cost is that the model must compose all discovery (find files, search content) via shell commands, which is less legible than structured tools.

**Why this matters for us:** Codex CLI proves you can build a useful agent with almost nothing. But we prefer structured tools for legibility and feedback quality. Our `search_replace` is simpler and more reliable than unified diffs (models format diffs poorly — Aider's data confirms this).

### Devin — Full IDE, Cloud-Hosted

**Not a toolset — an environment.** Devin runs on cloud instances with a full IDE, terminal, and browser.

- Full shell access (persistent terminal sessions)
- VS Code-like editor with real-time edits (not diff patches)
- Web browser for documentation and debugging
- Replay timeline showing every action
- VS Code Live Share for human collaboration

The key difference: Devin doesn't need "tools" in the traditional sense because it operates an entire development environment. Edits are made directly in the editor. Tests are run in a persistent terminal. The "tool" is the IDE itself.

**Iterative development loop:**
1. Run tests
2. Parse failures
3. Make edits in editor
4. Repeat until green

This is human-like development, not tool-mediated function calling. It works because Devin is cloud-hosted — latency and state management are handled by the infrastructure.

**Why this matters for us:** Devin represents the other end of the spectrum — maximum capability, maximum cost. For a local, lightweight harness like Theseus, structured tools are the right abstraction. But Devin's iterative test-fix loop is a pattern we should replicate: `search_replace → tsc check → fix → test → fix`.

---

## The Catalog

### Tier 1 — Irreducible

Every coding agent needs these 6 tools. They appear in every system we studied (sometimes under different names, sometimes composed via shell, but always present functionally).

#### read_file

**Read file contents with offset/limit.**

| | |
|---|---|
| Safety | `readonly` |
| Capabilities | `fs.read` |
| Why irreducible | The agent needs to see code before it can modify it. Every system has this. |

Parameters:
- `path: string` — absolute file path
- `offset?: number` — line number to start from (1-indexed)
- `limit?: number` — max lines to return

Design:
- **Line cap: 2,000 lines** (Claude Code's number; opencode is similar). Return a truncation indicator when capped so the model knows to use offset/limit.
- **Binary detection.** Check first 8KB for null bytes. If binary, return "Binary file, N bytes" instead of garbage.
- **Line number format.** Return `cat -n` style (`  1\tcontent`). Models use line numbers for orientation and in error messages.
- **Encoding.** UTF-8 with fallback to latin-1 for legacy files. Don't crash on encoding errors.

Cross-system comparison:
- Claude Code: 2,000 line cap, supports images/PDFs/notebooks, truncates lines >2,000 chars
- opencode: similar caps, returns diagnostics alongside file content
- SWE-agent v1: `open()` with viewport model (100 lines visible at a time) — obsolete with modern context windows
- Codex CLI: no dedicated read tool; uses `cat` via shell

#### list_dir

**List directory contents.**

| | |
|---|---|
| Safety | `readonly` |
| Capabilities | `fs.read` |
| Why irreducible | Orientation — the agent needs to know what files exist. |

Parameters:
- `path: string` — directory path

Design:
- **Filter noise.** Exclude `node_modules`, `.git`, `dist`, `build`, `coverage`, `__pycache__`, `.next` by default. These are never useful and flood context.
- **Tree vs flat.** Start with flat listing (one level). Consider tree mode for small directories. Claude Code uses flat; opencode offers both.
- **Entry type indicators.** Suffix directories with `/`, symlinks with `@`. The model needs to know what's a file vs. directory.
- **Sort.** Alphabetical within directories-first, then files. Matches `ls` behavior that models expect.

#### search_replace

**Exact-string replacement in a file.**

| | |
|---|---|
| Safety | `write` |
| Capabilities | `fs.write` |
| Why irreducible | The universal edit primitive. Every system converged on this format. |

Parameters:
- `path: string` — file to edit
- `old: string` — exact text to find
- `new: string` — replacement text

This is the most important tool to get right. The edit format determines agent edit reliability, which determines everything downstream.

**Why search/replace over other formats:**

| Format | Reliability | Why |
|---|---|---|
| **Search/replace** (exact string) | 84%+ (Aider data) | Models produce it naturally. No line numbers to get wrong. No diff syntax to malformat. |
| **Unified diff** (Codex apply_patch) | Lower | Models frequently misformat diffs — wrong context lines, bad hunk headers, missing +/- prefixes. |
| **Line-number edit** (SWE-agent v1) | Fragile | Line numbers shift after edits. Multi-edit sequences compound errors. |
| **Whole file** (Aider whole mode) | 100% | Always works, but expensive — model returns entire file for 1-line edits. |

Every major system converged on search/replace: Claude Code (`Edit`), opencode (`edit`), Aider (`diff` mode), Cursor (search/replace). SWE-agent abandoned line-number edits. Codex CLI uses unified diffs but is the exception. Our tool: `search_replace`.

**Fuzzy fallback strategies.** When exact match fails (model formatting drift: trailing whitespace, inconsistent indentation, tab/space confusion):

opencode implements 9 fallback strategies. We start with 2:
1. **Whitespace normalization.** Collapse runs of whitespace, trim lines, compare. Catches indent drift and trailing spaces.
2. **Leading-indent normalization.** Strip common leading indent from both `old` and file content, compare, then re-indent the replacement to match the file.

More strategies can be added later. The goal is: exact match first (fast, reliable), then one cheap normalization pass, then fail with a clear error message.

**Post-edit diagnostics.** After every edit, run `tsc --noEmit` on the file (or equivalent LSP check) and return diagnostics as part of the tool result. This is the single biggest quality lever — the model sees type errors immediately, not on the next test run.

```
✓ Replaced 1 occurrence in src/agent.ts

⚠ 2 diagnostics:
  src/agent.ts:45 — TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
  src/agent.ts:67 — TS2304: Cannot find name 'oldVariable'.
```

**Context window around edit.** After replacement, return a few lines of context around the edit site. Helps the model verify the edit landed correctly without a full re-read.

#### shell

**Execute a shell command.**

| | |
|---|---|
| Safety | `destructive` |
| Capabilities | `shell.exec` |
| Why irreducible | The escape hatch — everything the model knows how to do via CLI. Tests, git, curl, package managers, build tools. |

Parameters:
- `command: string` — shell command to execute
- `timeout?: number` — timeout in ms (default: 30,000)

Design:
- **Timeout: 30 seconds default** (configurable via `THESEUS_SHELL_MAX_OUTPUT`). Long enough for most builds/tests, short enough to catch runaway processes.
- **Output cap: 8KB** (configurable). Truncate from the middle, keeping first and last sections. Models need to see the beginning (command echo, initial output) and end (error messages, exit codes).
- **Exit code.** Always return exit code. `0` = success, non-zero = failure. The model uses this to decide whether to retry.
- **Working directory.** Default to workspace root. Persistent across calls within a session (the model expects `cd` to stick).
- **No interactive mode.** Commands that need stdin (vim, less, `git rebase -i`) will hang. Detect and fail fast.

**Why destructive, not write.** Shell can do anything — `rm -rf /`, `git push --force`, `curl -X DELETE`. The capability is `shell.exec` so it can be filtered out of read-only toolsets entirely via `toolsWithoutCapability`.

**Sandboxing.** Deferred to runtime Sandbox/Workspace wiring. The tool contract
doesn't change; isolation wraps execution rather than changing the tool
definition.

Cross-system comparison:
- Claude Code: 2-minute timeout, background execution supported, explicit restrictions on file operations
- opencode: configurable timeout, truncation with "middle elided" marker
- SWE-agent v2: stateless `subprocess.run` per command (no persistent session)
- Codex CLI: approval gates before execution, multiple sandboxing levels
- Devin: persistent terminal session (cloud-hosted, different paradigm)

#### grep

**Regex search across file contents.**

| | |
|---|---|
| Safety | `readonly` |
| Capabilities | `fs.read` |
| Why irreducible | Discovery — finding where things are defined, used, referenced. Every coding task starts with "where is X?" |

Parameters:
- `pattern: string` — regex pattern
- `path?: string` — directory to search (default: workspace root)
- `glob?: string` — file pattern filter (`*.ts`, `*.{ts,tsx}`)
- `contextLines?: number` — lines of context around each match

Design:
- **Ripgrep under the hood.** Fast, respects `.gitignore`, handles binary files correctly.
- **Result cap: 100 matches.** After 100 matches, return a count of remaining matches. Prevents context flooding on broad patterns.
- **Output format.** `file:line:content` grouped by file. Models parse this format naturally.
- **Recency-sorted.** Sort files by modification time (most recently modified first). The code the model is working on is usually the code it recently changed.

Cross-system comparison:
- Claude Code: three output modes (`content`, `files_with_matches`, `count`), file type filtering, head/offset limit, multiline mode
- opencode: similar ripgrep wrapper, result caps
- SWE-agent v1: `search_dir(query)` — regex but less configurable
- Codex CLI: grep via shell — works but unstructured output

#### glob

**Find files by glob pattern.**

| | |
|---|---|
| Safety | `readonly` |
| Capabilities | `fs.read` |
| Why irreducible | Discovery — "what files match this pattern?" without reading file contents. |

Parameters:
- `pattern: string` — glob pattern (`**/*.ts`, `src/components/**/*.tsx`)
- `path?: string` — base directory (default: workspace root)

Design:
- **Result cap: 100 files.** Same rationale as grep — prevent context flooding.
- **Recency-sorted.** Most recently modified files first.
- **Respect `.gitignore`.** Never return `node_modules`, `.git`, etc.
- **Implementation.** ripgrep `--files --glob` or `fast-glob`. Both are fast enough.

**Why `grep` and `glob` are separate:** Different intent. `grep` answers "where does this pattern appear in file contents?" `glob` answers "what files exist matching this name pattern?" Merging them forces the model to specify empty patterns or ignore results, which is more error-prone than two clear tools.

---

### Tier 2 — High Leverage

Significant capability uplift. Not strictly necessary (`search_replace` + `shell` cover the functionality), but the structured approach gives better feedback and reduces round trips.

#### write_file

**Create or overwrite a file.**

| | |
|---|---|
| Safety | `write` |
| Capabilities | `fs.write` |
| Use case | New files only — `search_replace` for edits to existing files. |

Parameters:
- `path: string` — file path
- `content: string` — full file content

Design:
- **New files only.** If the file exists, warn and require explicit confirmation (or use `search_replace`). Claude Code enforces "read before write" to prevent clobbering.
- **Create parent directories.** `mkdir -p` semantics. The model shouldn't have to create directories separately.
- **Post-write diagnostics.** Same as `search_replace` — run tsc check, return diagnostics.
- **Auto-format.** If a formatter is available (biome, prettier), run it after write. Avoids the model needing to match project formatting conventions perfectly.

#### multi_edit

**Multiple search/replace operations in one file, applied sequentially.**

| | |
|---|---|
| Safety | `write` |
| Capabilities | `fs.write` |
| Use case | Multi-point edits without round-trip overhead. |

Parameters:
- `path: string` — file to edit
- `edits: Array<{ old: string, new: string }>` — edits applied in order

Design:
- **Sequential application.** Each edit is applied against the result of the previous one. Order matters.
- **Atomic.** If any edit fails, all edits are rolled back. The file is either fully updated or unchanged.
- **Single diagnostic check at the end.** Don't run tsc after each sub-edit — run once when all edits are applied.
- **Why this exists.** A function rename that touches 5 sites in one file requires 5 `search_replace` calls (5 LLM round trips) or 1 `multi_edit` call. opencode and Claude Code both have this.

#### web_fetch

**Fetch a URL, convert HTML to markdown.**

| | |
|---|---|
| Safety | `readonly` |
| Capabilities | `web.read` |
| Use case | Reading documentation, API specs, issue content. |

Parameters:
- `url: string` — URL to fetch
- `prompt?: string` — optional extraction prompt ("what are the breaking changes?")

Design:
- **HTML → markdown conversion.** Strip navigation, ads, boilerplate. Return the content section.
- **Content cap: 8KB–16KB.** Summarize if larger. The model doesn't need the full page.
- **Timeout: 10 seconds.** Fail fast on slow servers.
- **No authentication.** This is for public URLs. Authenticated services (GitHub, Jira) should use MCP servers with proper auth.

---

### Tier 3 — Scaffolding

Valuable now, may thin as models improve. These are scaffolding tools — they compensate for model limitations that are shrinking with each generation.

#### find_references

**TypeScript Language Service: find references, go to definition.**

| | |
|---|---|
| Safety | `readonly` |
| Capabilities | `lsp` |
| Use case | Code navigation — "who calls this function?" "where is this type defined?" |

Design:
- **In-process, no subprocess.** Use the TS Language Service API directly (`getReferencesAtPosition`, `getDefinitionAtPosition`). No LSP server overhead.
- **Start with 2 operations.** Find references + go to definition. opencode has 9 LSP operations; that's too many tools for the model to choose between.
- **Expand if needed.** Rename, hover, document symbols are useful but can be added incrementally.

**Why scaffolding:** As models get better at reading code and understanding structure from context, they'll need fewer LSP operations. `grep` + `read_file` already solve 80% of navigation. `find_references` solves the remaining 20% (cross-file reference tracking, rename safety checks).

#### todo_read / todo_write

**Session-scoped task list.**

| | |
|---|---|
| Safety | `readonly` / `write` |
| Capabilities | `state` |
| Use case | The model tracking its own multi-step plan. |

Design:
- **Simple list.** Array of `{ id, text, status }`. No hierarchy, no dependencies, no tags.
- **Session-scoped.** Cleared on session end. This is working memory, not persistent storage.
- **Why this is scaffolding.** Every system has it (Claude Code, opencode). But models are getting better at maintaining state in context. Eventually, todo management will be implicit in the conversation, not a separate tool.

#### web_search

**Search the web.**

| | |
|---|---|
| Safety | `readonly` |
| Capabilities | `web.read` |
| Use case | Finding documentation, error solutions, API references. |

Design:
- **External API required.** Exa, Tavily, or similar. Not built into the runtime.
- **Better as MCP.** This is a prime candidate for MCP integration rather than a built-in tool.

---

## What We're NOT Building (and Why)

| Tool | Why Not |
|---|---|
| **apply_patch** (unified diff) | Codex CLI's format. Models misformat diffs frequently — wrong context lines, bad hunk headers. Aider's data shows search/replace at 84%+ success vs. lower for diffs. The field converged on search/replace. |
| **scroll / goto / viewport** | SWE-agent v1 artifact. Designed for small context windows where the model couldn't see the whole file. With modern 128K+ context, `read_file` with offset/limit is sufficient. SWE-agent itself abandoned this model. |
| **batch** (parallel tool execution) | Models and APIs handle parallel tool calls natively. No need for a meta-tool. |
| **reapply** (Cursor) | Cursor's recovery tool for failed edits. Our `search_replace` with fuzzy fallback handles this at the tool level. If the edit fails, the error message tells the model why — it re-reads and retries. |
| **LSP full suite** (9 ops) | opencode's 9 LSP operations is too many tools. The model spends tokens choosing between `hover`, `definition`, `references`, `implementation`, `rename`, `codeActions`, `documentSymbols`, `workspaceSymbols`, `diagnostics`. Start with 2 (references + definition). Expand if needed. |
| **codebase_search** (semantic) | Requires embedding infrastructure (custom model, index pipeline, vector store). `grep` + `glob` cover 80% of search. Semantic search slots in via MCP later — Cursor's approach but without the cost. |
| **open / create** (SWE-agent v1) | `read_file` subsumes `open`. `write_file` subsumes `create`. No need for separate tools. |

---

## Key Design Decisions

### 1. search_replace Over apply_patch

This is the most important decision. The edit format determines agent reliability.

**Evidence from Aider:** search/replace (their `diff` format) achieves 84%+ success rate across GPT-4 and Claude. Unified diff (`udiff`) was introduced specifically because GPT-4 Turbo had issues with the standard format — models have idiosyncratic behaviors around diff syntax.

**Evidence from the field:** Claude Code, opencode, Aider, Cursor all use search/replace. SWE-agent abandoned line-number edits. Only Codex CLI uses unified diffs, and it's the exception.

**Why search/replace works better:**
- No line numbers to get wrong (they shift after edits)
- No diff syntax to malformat (hunk headers, +/- prefixes, context lines)
- The search string is self-documenting — it's the actual code being replaced
- Failure is clear — "text not found" is unambiguous

**Why unified diffs fail:**
- Models frequently omit context lines or get them wrong
- Hunk headers (`@@ -10,5 +10,6 @@`) are easy to miscalculate
- Models confuse `-` (removed) and `+` (added) line prefixes
- Multi-hunk diffs compound errors — one bad hunk breaks the whole patch

### 2. Post-Edit Diagnostics — The Single Biggest Quality Lever

After every `search_replace` / `multi_edit` / `write_file`, run `tsc --noEmit` (or equivalent) and return diagnostics.

**Why this matters more than anything else:**

Without post-edit diagnostics, the feedback loop is:
```
edit → edit → edit → edit → run tests → discover 12 type errors → undo everything
```

With post-edit diagnostics:
```
edit → "2 type errors" → fix → edit → "clean" → edit → "1 error" → fix → run tests → pass
```

The model catches errors one edit at a time instead of accumulating them. opencode does this and it's their strongest feature.

**Implementation:** In-process TypeScript Language Service. `getSemanticDiagnostics(fileName)` runs in milliseconds (incremental, cached). Not `tsc --noEmit` as a subprocess (seconds).

### 3. Shell is Destructive

Shell commands can do anything — `rm -rf /`, `git push --force`, `curl -X DELETE`, `npm publish`. The capability is `shell.exec` so it can be filtered out of read-only toolsets entirely.

Toolset assembly by agent role:
- **Atlas** (read-only planner): `[read_file, list_dir, grep, glob]` — `toolsWithoutCapability(tools, "shell.exec")` + `toolsWithMaxSafety(tools, "readonly")`
- **Forge** (full coder): `[read_file, list_dir, grep, glob, search_replace, multi_edit, write_file, shell]` — all tools

This falls out naturally from the existing `toolsWithoutCapability` / `toolsWithMaxSafety` helpers on Tool.

### 4. MCP = More Tools

External MCP servers surface as `Tool<I, O>` via the same interface. The core toolset is closed and small; everything else is open and pluggable.

Candidates for MCP rather than built-in:
- **web_search** — requires API key (Exa, Tavily, Brave)
- **codebase_search** (semantic) — requires embedding infrastructure
- **database tools** — project-specific
- **CI/CD integration** — project-specific
- **Slack / GitHub / Jira** — requires auth

The tool primitive doesn't change. MCP tools get the same `decode → execute → validate → encode` pipeline, same error types, same capability tags.

### 5. The Shell Paradox

SWE-agent's trajectory (10 tools → bash alone → >74% SWE-bench) suggests that custom tools will thin over time as models improve. mini-SWE-agent proves that bash alone is *sufficient*.

But *sufficient* ≠ *optimal*. Structured tools are worth the complexity because:
- **Intent legibility:** `grep(pattern, "*.ts")` is clearer than parsing `rg pattern --type ts` output
- **Feedback quality:** tool results are typed and structured, not raw stdout
- **Safety boundaries:** capabilities are declared, not inferred from command analysis
- **Error recovery:** tool-level errors are typed and catchable; shell errors are strings

The right answer is **minimum structured tools** — enough for legibility and feedback, not so many that the model drowns in choices. Six core + three optional is the sweet spot we found across all systems.

---

## Comparative Summary

### Edit Mechanisms

| System | Format | Fuzzy Fallback | Post-Edit Check |
|---|---|---|---|
| Claude Code | Exact string match | No | No (manual re-read) |
| opencode | Exact string + 9 fuzzy strategies | Yes (whitespace, indent, approximate) | Yes (LSP diagnostics) |
| Cursor | Search/replace + reapply tool | Separate recovery tool | IDE-level diagnostics |
| Aider | 4 formats (model-dependent) | Re-read on failure | No |
| SWE-agent v1 | Line-number ranges | No | No |
| Codex CLI | Unified diff with context anchoring | No | User approval gate |
| **Theseus** (`search_replace`) | **Exact string + whitespace fallback** | **Yes (2 strategies)** | **Yes (in-process tsc)** |

### Search Mechanisms

| System | Primary | Secondary | Semantic |
|---|---|---|---|
| Claude Code | Grep (ripgrep) | Glob (file patterns) | No |
| opencode | Grep (ripgrep) | Glob + LSP symbols | No |
| Cursor | Grep | Glob | Yes (custom embeddings) |
| Aider | Repo map (symbol index) | grep via shell | No |
| SWE-agent | search_dir / search_file | find_file | No |
| Codex CLI | grep via shell | find via shell | No |
| **Theseus** | **`grep` (ripgrep)** | **`glob` + `find_references`** | **No (MCP slot)** |

### Tool Count

| System | Core Tools | Total Tools | Philosophy |
|---|---|---|---|
| Claude Code | 6 | 18 | Structured tools, bash restricted |
| opencode | 8 | 25 | Kitchen sink — everything built in |
| Cursor | ~6 | ~12 | Semantic search differentiator |
| Aider | 1 (edit) | ~4 | Edit format elasticity |
| SWE-agent v1 | 10 | 10 | Custom ACI for every action |
| mini-SWE-agent | 1 (bash) | 1 | Model capability is enough |
| Codex CLI | 2 | 2 | Shell + patch, nothing more |
| **Theseus** | **6** | **9–12** | **Minimum structured tools** |

---

## Implementation Priority

1. **search_replace** — the linchpin. Get fuzzy fallback and post-edit diagnostics right.
2. **read_file** — with line caps, binary detection, line numbers.
3. **shell** — with timeout, output cap, exit codes.
4. **grep** + **glob** — ripgrep wrappers with result caps.
5. **list_dir** — noise filtering, entry type indicators.
6. **write_file** + **multi_edit** — once the basics work.
7. **find_references** — TS Language Service integration.
