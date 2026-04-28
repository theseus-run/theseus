---
status: current
owner: primitives
kind: research
updated: 2026-04-28
---

# Tool Backends — Next-Gen Alternatives Research

> Status: research note, not current implementation doctrine
> Last updated: 2026-04-28

Research into whether we should build naive tool implementations (ripgrep wrapper, raw file read, bare `Bun.spawn`) or invest in better backends. Constraint: **local only, no SaaS, no API keys.** Native builds (Zig, Rust) and local servers/daemons are allowed.

Companion to [tools](tools.md) (the tool catalog). This doc covers the *how* — what backends and technologies to use for each tool.

Terminology note: this note uses current [Sandbox and Workspace](../runtime/isolation.md)
vocabulary. Older drafts called that slot `WorkspaceContext`.

---

## Bun Native APIs — What We Get For Free

Bun ships Zig-backed implementations that replace several external dependencies. These are fast, built-in, and zero-config.

### `Bun.Glob` — Native Glob Scanning

```ts
import { Glob } from "bun";

const glob = new Glob("**/*.ts");
for await (const file of glob.scan(".")) {
  console.log(file);
}

// Sync variant
for (const file of glob.scanSync(".")) { ... }
```

- Zig-backed, fast native implementation
- Supports `**`, `*`, `?`, `{a,b}`, `[ab]`, `!` negation
- Options: `onlyFiles` (default true), `dot`, `absolute`, `followSymlinks`
- Also available as `fs.glob()` / `fs.globSync()` with array patterns + `exclude` option

**Verdict for `glob` tool:** Use directly. No fast-glob or ripgrep `--files` needed. Zero external deps.

### `Bun.$` — Cross-Platform Shell

```ts
import { $ } from "bun";

// Basic usage
const output = await $`echo hello`.text();  // "hello\n"

// Structured output
for await (const line of $`ls -la`.lines()) { ... }
const data = await $`cat config.json`.json();

// Error handling
const { stdout, stderr, exitCode } = await $`may-fail`.nothrow().quiet();

// Configuration
await $`pwd`.cwd("/tmp").env({ FOO: "bar" });
```

Built in Zig — handwritten lexer, parser, interpreter. Does NOT invoke system shell (`/bin/sh`). Runs in-process.

Key features:
- **Injection-safe by default.** Interpolated variables are treated as single literal strings. `$`ls ${userInput}`` is safe even if userInput contains `; rm -rf /`.
- **Output parsing.** `.text()`, `.lines()`, `.json()`, `.blob()` — no manual stdout buffer management.
- **Error handling.** `.nothrow()` returns exitCode instead of throwing. `ShellError` has `.stdout`, `.stderr`, `.exitCode`.
- **Config.** `.cwd()`, `.env()`, `.timeout()` per-command or global via `$.cwd()`, `$.env()`.
- **Pipes.** `` $`cmd1 | cmd2` `` — native pipe support.
- **Redirection.** `<`, `>`, `2>`, `&>`, `>>` — works with JS objects (Buffer, BunFile, Response).
- **Built-in commands.** `ls`, `rm`, `cat`, `mkdir`, `mv`, `touch`, `which`, `pwd`, `cd`, `echo`, `seq`, `dirname`, `basename` — cross-platform, no external deps.
- **Concurrent by default.** Unlike bash which is sequential, Bun shell runs operations concurrently.

**Verdict for `shell` tool:** Use instead of `Bun.spawn`. Better API, safer defaults, structured output parsing. The injection safety is a significant win — LLM-generated commands can't accidentally inject via string interpolation. One caveat: if the model generates `bash -c "..."` as the command, we're back to system shell territory and Bun's protections don't apply.

### `Bun.file(path)` — Lazy File Reference

```ts
const f = Bun.file("src/index.ts");

f.size;              // bytes, lazy (no read)
f.type;              // MIME type ("text/typescript")
await f.exists();    // boolean
await f.text();      // file contents as string
await f.stream();    // ReadableStream
await f.bytes();     // Uint8Array

// Incremental writing
const writer = f.writer({ highWaterMark: 1024 * 1024 });
writer.write("chunk1");
writer.write("chunk2");
writer.flush();
writer.end();
```

Implements the `Blob` interface. 2x faster than GNU `cat` for large files on Linux.

**Verdict for `read_file` tool:** Use directly.
- `.type` gives MIME type for binary detection (check for non-text types instead of scanning for null bytes)
- `.size` gives file size without reading (pre-check for giant files)
- `.text()` for content
- `.exists()` to check before read

### `Bun.write(dest, data)` — Optimized Writes

```ts
await Bun.write("output.ts", content);         // string
await Bun.write("copy.ts", Bun.file("src.ts")); // file-to-file (zero-copy where possible)
await Bun.write("data.json", response);          // Response body
```

Uses fastest available syscall per platform:
- Linux: `copy_file_range` (file→file), `sendfile` (pipe→file), `write` (buffer→file)
- macOS: `clonefile` (new file from path), `fcopyfile` (existing file), `write` (buffer→file)

**Verdict for `write_file` tool:** Use directly. Platform-optimal, zero-copy where possible.

### `readdir` from `node:fs` — Fast Directory Listing

```ts
import { readdir } from "node:fs/promises";

const files = await readdir("src");                          // flat
const all = await readdir("src", { recursive: true });       // recursive
```

Bun's `node:fs` implementation is fast (native).

**Verdict for `list_dir` tool:** Use directly.

### What Bun Does NOT Have

- **Content search (grep).** No native API for searching file contents by pattern. Need ripgrep subprocess or build our own.
- **Tree-sitter.** No built-in AST parsing. Need `web-tree-sitter` (WASM) or native Node bindings.
- **File watching with indexing.** `fs.watch` exists but no trigram/inverted index infrastructure.

---

## Code Search — Indexed vs Brute-Force

This is the area with the largest gap between naive and optimized implementations.

### The Landscape

| Tool | Language | Approach | Query Latency | Token Efficiency | Setup Cost |
|---|---|---|---|---|---|
| **ripgrep** | Rust | Brute-force regex, SIMD-optimized | 5–7ms | Low (raw lines) | Zero (binary) |
| **codedb** | Zig | Trigram + inverted word index | O(1) sub-ms | Very high (~20 tok/query) | Daemon process |
| **Zoekt** | Go | Trigram index | <50ms | Medium | Go binary + index |
| **Reflex** | Rust | Trigram + tree-sitter + static analysis | <100ms | Medium | `npm install` |
| **Livegrep** | C++ | Trigram + suffix arrays | ~100x grep | Low | C++ build |
| **Codemogger** | Node.js | tree-sitter + embeddings + sqlite-vec | <100ms | High (semantic chunks) | `npm install` |

### ripgrep — The Industry Standard

Every AI coding agent uses ripgrep (Claude Code, opencode, Cursor, SWE-agent). It's fast enough (5–7ms), universally available, and zero-setup.

Key features for our use case:
- **`--json` flag**: Outputs one JSON object per line — structured results without parsing raw text. Types: `begin` (file start), `match` (hit with line/column/content), `context` (surrounding lines), `end` (file end), `summary` (stats).
- **`--max-count N`**: Limit matches per file.
- **`--sort modified`**: Most recently modified files first (what the agent is working on appears first).
- **`--glob '*.ts'`**: File pattern filtering.
- **`--type ts`**: Built-in file type groups.
- **`-C N`**: Context lines around matches.
- **`.gitignore` aware**: Respects ignore files by default.

```ts
import { $ } from "bun";

// Structured grep via ripgrep --json
const raw = await $`rg --json -C 2 --max-count 5 --sort modified --glob '*.ts' ${pattern} ${root}`.nothrow().text();
const lines = raw.split("\n").filter(Boolean).map(JSON.parse);
const matches = lines.filter(l => l.type === "match");
```

This gives us structured `{path, line_number, lines: {text}}` objects. No raw stdout parsing.

**Performance:** 10x faster than GNU grep. On the Linux kernel source (2GB): 0.06s vs 0.67s. DFA/NFA hybrid regex engine with SIMD optimizations and aggressive literal heuristics.

### codedb — The Token Efficiency Champion

**GitHub:** github.com/justrach/codedb

Pure Zig, zero external dependencies, single binary. Combines three indexing strategies:

**Architecture:**
1. **Trigram index** — 3-character substring index. Every file is decomposed into all possible 3-char sequences. A search query is also decomposed, and only files containing all trigrams are candidates. Narrows 10k files to ~50 candidates per query.
2. **Inverted word index** — word → [doc_id_1, doc_id_2, ...]. O(1) exact identifier lookup. When you search for `readFile`, it hits the index directly without scanning.
3. **Tree-sitter parsing** — structural extraction of symbols (functions, classes, types) with signatures.

**How it works:**
- Indexes once at startup (~3s for large repos, down from 75s after 12x optimization)
- Polls filesystem every 2s for changes, re-indexes only changed files (<2ms per file)
- All queries hit in-memory data structures — no filesystem scan
- Caps: 64KB/file, 15k files max, content cache released for 1000+ file repos (saves 300–500MB)

**Performance claims:**
- 538x faster than ripgrep on pre-indexed queries (O(1) vs O(n) filesystem scan)
- 200–1600x fewer tokens in output (structured symbol results vs raw line dumps)
- Sub-millisecond query latency

**16 MCP tools:**
- `tree` — file tree with symbol counts
- `outline` — symbol extraction for a file
- `symbol` — find symbol definitions across codebase
- `search` — full-text trigram search
- `word` — exact word lookup (inverted index)
- `deps` — dependency graph
- `read` / `edit` — file operations with version tracking
- `snapshot` — portable index snapshot for instant startup
- `bundle` — package files for context
- `remote` — query public GitHub repos without cloning

**Runs as:** HTTP server (port 7719) or MCP server over stdio.

**Language support:** Zig, Python, TypeScript/JavaScript, Rust, PHP, C# (tree-sitter parsers).

**The key insight:** Most search queries from coding agents are identifier lookups ("where is `readFile` defined?", "who calls `dispatch`?"). The inverted word index answers these in O(1). The trigram index handles regex patterns. Together they cover 95%+ of agent search needs without scanning the filesystem.

### Zoekt — Google-Proven at Scale

**GitHub:** github.com/sourcegraph/zoekt (maintained fork)

Originally built by Han-Wen Nienhuys at Google for Google's internal code search. Now maintained by Sourcegraph.

**How trigram indexing works (Russ Cox's algorithm):**
1. Build posting lists: for every 3-char sequence in the corpus, record which files contain it and at what byte offsets.
2. Given a regex query, decompose it into required trigrams. Example: `readFile` requires trigrams `rea`, `ead`, `adF`, `dFi`, `Fil`, `ile`.
3. Intersect posting lists for all required trigrams → candidate set (~50 files out of 10k).
4. Verify regex match only on candidates — ~100x speedup over brute-force.

**Performance:** Sub-50ms search on ~2GB Android codebase (50k+ files).

**Features:**
- BM25 scoring (alternative to simple frequency ranking)
- Streaming results
- JSON API
- Language-agnostic (trigram indexing works on any text)
- Index sharding for very large corpora

**Tradeoff vs codedb:** Zoekt is a Go binary (heavier), but proven at massive scale. codedb is lighter (Zig, zero deps) and adds tree-sitter symbol extraction. For our scale (single repo, <15k files), codedb is the better fit.

### Reflex — Rust Hybrid (Trigram + Tree-Sitter + Static Analysis)

**GitHub:** github.com/reflex-search/reflex

Combines three approaches in one tool:
1. Trigram indexing for fast full-text search
2. Tree-sitter parsing for symbol extraction
3. Static analysis for dependency tracking

```bash
npm install -g reflex-search
```

**Features:**
- Sub-100ms latency via lightweight incremental cache
- Incremental reindexing (changed files only)
- Structured results (symbols, spans, scopes)
- Live TUI for interactive exploration
- 14 languages: Rust, TypeScript, Vue, Svelte, PHP, Python, Go, Java, C/C++, C#, Ruby, Kotlin, Zig

**Interesting because** it's the only tool combining all three approaches (trigram + AST + static analysis) in a single binary. Available via npm.

---

## Code Understanding — AST vs Raw Text

Reading raw file content is the biggest token sink in agent workflows. A 500-line TypeScript file is ~3,000 tokens. Its outline (function/class signatures) is ~300 tokens. 10x savings.

### Token Efficiency by Approach

| Approach | Tokens (500-line file) | Savings | How |
|---|---|---|---|
| **Raw file read** | ~3,000 | Baseline | Return file as-is with line numbers |
| **Tree-sitter skeleton** | ~300–600 | 60–80% | Function/class signatures only (like `.d.ts`) |
| **Aider repo map** | ~50–200 | 80–95% | PageRank on dependency graph, fit to token budget |
| **codedb outline** | ~200–400 | 70–80% | Tree-sitter symbol extraction, structured output |
| **Pointer-only results** | ~20 | 99% | Just file:line — model calls read_file if it needs content |

### Tree-Sitter — The Universal Building Block

Tree-sitter is an incremental parsing system supporting 66+ languages. It builds a concrete syntax tree and can update it efficiently when source changes.

**What it extracts:**
- Function/method definitions with full signatures
- Class/interface/type declarations
- Import/export statements
- Call sites
- Trait implementations (Rust), protocol conformances (Swift), etc.

**Performance:**
- Parse a file: <1ms
- Incremental re-parse after edit: microseconds
- Memory: proportional to file size

**For JavaScript/TypeScript integration:**
- `web-tree-sitter`: WASM-based, works in any JS runtime (Bun, Node, browser). ~2MB WASM binary.
- `tree-sitter` npm package: native Node bindings via node-gyp. Faster than WASM but requires native compilation.
- Each language needs a grammar file (~100KB–1MB WASM per language).

**Example output (outline of a TypeScript file):**

```
src/tool/index.ts
  class ToolError extends Data.TaggedError("ToolError")     :38
  class ToolErrorRetriable extends Data.TaggedError(...)     :45
  class ToolErrorInput extends Data.TaggedError(...)         :52
  class ToolErrorOutput extends Data.TaggedError(...)        :59
  type ToolSafety = "readonly" | "write" | "destructive"     :74
  interface SchemaAdapter<T>                                  :90
  const manualSchema = <T>(json, decode) => SchemaAdapter<T>  :98
  interface ToolContext                                       :108
  const toolContext = (tool: string): ToolContext              :116
  interface Tool<I, O>                                        :125
  type ToolDef<I, O>                                          :155
  const defineTool = <I, O>(def: ToolDef<I, O>): Tool<I, O>  :175
  type ToolDefEffect<I, O>                                    :226
  const defineToolEffect = <I, O>(def): Tool<I, O>            :250
  interface ToolResult                                        :276
  type ToolAny = Tool<any, any>                               :288
  const toolCapabilities = (tools) => string[]                :295
  const toolHasCapability = (tools, cap) => boolean           :300
  const toolsWithoutCapability = (tools, cap) => ToolAny[]    :304
  const toolsWithMaxSafety = (tools, max) => ToolAny[]        :310
```

~400 tokens vs ~3,000 for the full file. The model knows what exists, what the types are, and where to look. When it needs the actual implementation of `defineTool`, it calls `read_file` with offset/limit.

### Aider's Repo Map — The Proven Context Optimization

Aider builds a "repository map" at session start and regenerates it after each edit. This is the single biggest context optimization in production use.

**How it works:**
1. Extract symbols from all files via tree-sitter (function/class/type names with signatures)
2. Build a dependency graph (file A imports from file B → edge A→B)
3. Run PageRank with personalization (weight files relevant to current task higher)
4. Binary search to find the largest subset of symbols that fits within a token budget (default 1,024 tokens, 15% tolerance)
5. Inject the result into the system prompt

**The result** is a compact map of "here's what exists in this codebase, ranked by relevance to your task." The model gets orientation without reading any files. When it needs details, it reads specific files/regions.

**Token budget control:** The binary search is elegant — try including more symbols, measure tokens, if over budget remove least-relevant symbols. Converges in ~5 iterations.

### Practical Approach for Theseus

Two tools, not one:

1. **`read_file`** — returns raw content with line numbers (for when the model needs actual code)
2. **`outline`** — returns tree-sitter skeleton (for orientation — "what's in this file?")

Plus a session-level optimization:

3. **Repo map** injected into system prompt on session start — tree-sitter symbols ranked by relevance. Regenerated after edits. This is Phase 2.

---

## Semantic Search — The Local-Only Stack

The fully offline semantic search pipeline exists today. No API keys, no cloud services.

### The Pipeline

```
tree-sitter (parse/chunk) → embedding model (vectorize) → vector store (index) → cosine similarity (query)
```

### Components

**Ollama — Local Embedding Models**
- Models: `all-minilm` (22M params, fast, 384-dim), `nomic-embed-text` (768-dim), `qwen3-embedding` (1024-dim)
- REST API on localhost (default port 11434)
- ~5ms per embedding
- Rule: must use same model for indexing and querying
- Size: ~500MB for a small model

**sqlite-vec — Vector Search in SQLite**
- SQLite extension for vector similarity search
- Single `.db` file — no server, no infrastructure
- Cosine similarity queries in <10ms for tens of thousands of vectors
- Can store embeddings alongside full-text index (FTS5) in the same database
- Works with any SQLite client

**Chroma — Zero-Config Vector Database**
- "Three lines of Python, working vector DB"
- SQLite backend for local persistent storage
- Client-server mode available for multi-client setups
- Native RAG pipeline integration
- Vector search + metadata filtering

### All-in-One Solutions

**Codemogger** (github.com/glommer/codemogger)
- Scans directory (respects .gitignore)
- Tree-sitter chunks code into semantic units (functions, structs, classes, impl blocks)
- Embeds with all-MiniLM-L6-v2 **shipped with the binary** (zero external deps)
- Stores in SQLite with FTS + vector search
- 3 MCP tools: `codemogger_search`, `codemogger_index`, `codemogger_reindex`
- 13 languages: Rust, C, C++, Go, Python, Zig, Java, Scala, JS, TS, TSX, PHP, Ruby
- Everything in one SQLite file

**Context+** (github.com/ForLoopCodes/contextplus, 1,725 stars)
- Tree-sitter AST parsing via web-tree-sitter WASM (43 languages)
- Ollama vector embeddings with disk cache in `.mcp_data/`
- Spectral clustering groups semantically related files
- Blast radius analysis (trace where symbols are used, what changes might break)
- Wikilink hub graph (Obsidian-style feature → implementation mapping)
- 17 MCP tools
- Requires Ollama running locally

**Code Index MCP** (github.com/johnhuang316/code-index-mcp)
- Sub-100ms query latency
- 48 languages
- Local indexing (no external APIs)
- Symbol + text search

### Verdict

Semantic search is viable locally but adds significant complexity:
- Ollama: ~500MB download for embedding model
- Indexing: seconds to minutes depending on repo size
- Quality: good for conceptual queries ("where do we handle auth?"), worse than grep for exact matches ("find `readFile`")

**Recommendation:** Don't build into core tools. Make it pluggable via MCP. Codemogger or Context+ can be dropped in as MCP servers alongside our tools. Our `grep` + `glob` handle 80% of search needs. The 20% that needs semantic understanding can come from MCP — same `Tool<I, O>` interface either way.

---

## Sandboxing — Shell Isolation

### The Landscape

| Approach | Startup | Memory Overhead | Isolation Level | Platform | Local |
|---|---|---|---|---|---|
| **Bun.spawn / Bun.$** | <1ms | None | Process only | All | Yes |
| **Bun Workers** | <1ms | Minimal | Thread (JS only) | All | Yes |
| **nsjail** (Google) | <10ms | Minimal | Namespaces + seccomp-bpf | Linux | Yes |
| **Docker container** | 100–500ms | ~50MB | Container | All | Yes |
| **Sandcastle** (Docker + worktree) | ~200ms | ~50MB | Container + git isolation | All | Yes |
| **Firecracker** (AWS microVM) | 125ms | <5MB per VM | Full VM | Linux | Yes |
| **gVisor** (Google) | ~200ms | ~20MB | User-space kernel | Linux | Yes |

### nsjail — Lightweight Linux Sandboxing

Google's production sandboxing tool. Uses Linux namespaces (PID, mount, network, user) + seccomp-bpf syscall filtering + cgroups for resource limits. No full virtualization overhead.

For our use case: wrap `Bun.$` calls with nsjail for filesystem/network isolation. The command doesn't change; nsjail wraps it. Linux-only, so macOS development needs a different approach (Docker).

### Sandcastle — Parallel Agent Isolation

**GitHub:** github.com/mattpocock/sandcastle

TypeScript library for running AI agents in isolated Docker containers + git worktrees:

1. Creates git worktree at `.sandcastle/worktrees/{name}`
2. Bind-mounts worktree into Docker container
3. Agent operates inside container (full isolation)
4. Commits appear immediately on host (bind mount = direct filesystem access)
5. On completion: fast-forward merge from worktree branch to target branch

**Why this matters for Theseus:** Multiple agents (e.g., two Forge instances) can work on the same repo in parallel without conflicts. Each gets its own worktree + container. Commits don't interfere. Merge happens after task completion.

### Firecracker — MicroVM (The Nuclear Option)

AWS's open-source microVM. 125ms startup, <5MB memory per VM, 150 VMs/second creation rate. Production-proven (AWS Lambda runs on Firecracker).

Overkill for local dev, but interesting for hosted Theseus deployments where you need hard isolation between untrusted agent workloads.

### Practical Approach for Theseus

**Phase 1 (now):** `Bun.$` with timeout + output cap. No sandboxing. The `shell` tool contract (`Tool<I, O>`) doesn't change when we add isolation later.

**Phase 2:** Sandcastle's worktree pattern for parallel agents via explicit
Sandbox/Workspace wiring. Docker on macOS, nsjail on Linux. The tool definition
stays the same; isolation wraps execution at the runtime level.

**The key design decision:** Sandboxing is a runtime concern, not a tool concern.
Our `shell` tool is `{ name: "shell", safety: "destructive", capabilities:
["shell.exec"] }`. The runtime decides whether to execute it bare, in a
container, or in a microVM. Sandbox/Workspace identity is the current conceptual
slot for this.

---

## Token-Efficient Output Formatting

Independent of backend choice, output formatting has massive impact on token efficiency. This is the lowest-effort, highest-impact improvement.

### The Problem

Most agent tools dump raw content:

```
# grep: 50 matches = ~5,000 tokens of raw output
src/tool/index.ts:38:export class ToolError extends Data.TaggedError("ToolError")<{
src/tool/index.ts:39:  readonly tool: string;
src/tool/index.ts:40:  readonly message: string;
... (50 more lines)

# read_file: 300-line file = ~2,000 tokens
     1  import { Data, Effect } from "effect";
     2
     3  // ---------------------------------------------------------------------------
... (300 lines)
```

The model reads all of it. Most of it is noise.

### The Fix: Structured, Capped, Pointer-Based Output

**grep results — structured JSON, capped:**
```json
{
  "pattern": "ToolError",
  "matches": 12,
  "showing": 5,
  "results": [
    { "file": "src/tool/index.ts", "line": 38, "content": "export class ToolError extends Data.TaggedError..." },
    { "file": "src/tool/index.ts", "line": 45, "content": "export class ToolErrorRetriable extends..." },
    ...
  ],
  "truncated": true,
  "remaining": 7
}
```

**read_file — line-numbered with truncation indicator:**
```
[1-200 of 314 lines]
     1→import { Data, Effect } from "effect";
     2→
     ...
   200→};
[truncated — use offset/limit for remaining 114 lines]
```

**outline — signatures only (proposed new tool):**
```
src/tool/index.ts (314 lines)
  class ToolError extends Data.TaggedError("ToolError")        :38
  class ToolErrorRetriable extends Data.TaggedError(...)       :45
  interface SchemaAdapter<T>                                    :90
  const defineTool = <I, O>(def: ToolDef<I, O>): Tool<I, O>   :175
  const defineToolEffect = <I, O>(def): Tool<I, O>             :250
  [14 exports total]
```

### The Key Insight

**Most tools should return pointers (file:line), not full content.** The model can then `read_file` the specific region it needs. This is how codedb achieves 200–1600x token reduction over grep:

| Approach | Tokens for "find ToolError" |
|---|---|
| ripgrep raw output (12 matches + context) | ~1,200 |
| Structured JSON (12 matches, no context) | ~300 |
| Pointer-only (12 file:line pairs) | ~60 |
| codedb symbol search | ~20 |

The model doesn't need to *see* the code to know *where* it is. It needs to see the code when it's ready to understand or edit it.

---

## Structural Search/Replace — GritQL, ast-grep, Comby

This is a category we didn't cover in [tools](tools.md) and it changes the picture for `search_replace` and `grep`. Instead of text matching (exact string, regex), structural tools match against the AST — they understand code structure.

### The Design Space

| Approach | Ease | Precision | Expressiveness |
|---|---|---|---|
| **Regex** (ripgrep) | Easy | Low (text-level) | Medium |
| **Comby** | Easy | Medium (structural but not AST-aware) | Low |
| **ast-grep** | Medium (code patterns + YAML) | High (AST-aware) | Medium |
| **GritQL** | Hard (new DSL) | High (AST-aware) | High (logic programming features) |
| **Semgrep** | Medium | High | High (but heavy, Java-based) |

All tree-sitter-based tools (ast-grep, GritQL) share the same foundation but differ in query language and expressiveness.

### ast-grep — The Practical Choice

**GitHub:** github.com/ast-grep/ast-grep (Rust, 15k+ stars)

Write a code pattern, get structural matches. The query IS valid code with metavariable holes:

```bash
# Find all console.log calls
ast-grep --lang ts -p 'console.log($MSG)'

# Find async functions without try-catch
ast-grep --lang ts -p 'async function $NAME($$$ARGS) { $$$ }'

# Structural replace
ast-grep --lang ts -p 'console.log($MSG)' -r 'logger.info($MSG)'
```

**Why ast-grep over GritQL:**

1. **LLMs can write it.** The pattern syntax IS the target language with `$` metavariables. Claude/GPT already know how to write TypeScript — they just add `$HOLES`. No new DSL to learn. ast-grep has an official [llms.txt](https://ast-grep.github.io/advanced/prompting.html) and a Claude Code skill.

2. **Performance.** ast-grep in Rust is consistently fast. GritQL had a documented case of 70 seconds for one complex rule vs 0.5 seconds in ast-grep for the same task.

3. **Maturity.** Full search, lint, and rewrite. YAML config for complex rules. VSCode extension with structural search/replace UI. Interactive playground.

4. **MCP server exists.** [ast-grep-mcp](https://github.com/ast-grep/ast-grep-mcp) — experimental but functional. AI follows a 5-step process: understand request → write example code → generate pattern → test against example → search codebase.

5. **Polyglot.** Same syntax works across all tree-sitter-supported languages.

**LLM accuracy reality check:** ast-grep's own blog tested three models:
- **O3**: Hallucinated extensively, invented syntax resembling CodeQL. Bad.
- **Gemini**: Borrowed from Semgrep syntax, decent error recovery.
- **Claude**: Most promising — produced syntactically valid rules, struggled with subtle semantics.

Key finding: LLMs need **structured prompting with verification loops** to generate reliable ast-grep rules. Raw "write me a pattern" fails. The ast-grep MCP server handles this with a 5-step iterative process (write pattern → test → fix → test → search).

### GritQL — More Powerful, Harder to Use

**GitHub:** github.com/biomejs/gritql (Rust, Biome ecosystem)

```grit
// Find console.log and replace with winston
`console.log($msg)` => `winston.log($msg)`

// With conditions (logic programming)
`$fn($args)` where {
  $fn <: not within `try { $_ }`,
  $fn <: `fetch`
}
```

**Strengths:**
- More expressive than ast-grep (where clauses, logic operators, negation)
- Biome ecosystem integration (linter plugin)
- Production users for large migrations (OpenAI SDK 0.x → 1.0, MobX → React hooks)
- [Custom workflows](https://docs.grit.io/workflows/tutorial) that combine GritQL + LLM transforms

**Weaknesses:**
- **LLMs struggle with the DSL.** It's a new language that's not heavily represented in training data. Models hallucinate GritQL syntax.
- **Performance issues.** Complex rules can be orders of magnitude slower than ast-grep.
- **Documentation fragmented** between Biome docs and Grit.io docs.
- **Beta in Biome.** Currently diagnostics only — no automated fixes yet.
- **No type resolution.** Can't distinguish between `foo.bar()` on class A vs class B.

### Comby — The Simplest

**GitHub:** github.com/comby-tools/comby

```
# Pattern matching with :[holes]
comby 'console.log(:[msg])' 'logger.info(:[msg])' .ts
```

Not AST-aware — matches structural patterns without parsing. This means it works on ANY text format (JSON, YAML, Markdown, not just code), but can match across AST boundaries incorrectly. Can't express complex conditions.

### Why Nobody Uses Structural Search in Agents (Yet)

1. **Plain text search/replace works well enough.** At 84%+ success rate (Aider data), exact string match with fuzzy fallback covers most cases. The remaining 16% is mostly LLM formatting errors, not structural mismatch.

2. **LLMs can't reliably write structural queries.** The model needs to learn a new DSL (GritQL) or understand metavariable conventions (ast-grep). Current models are getting better but not reliable without iterative verification.

3. **Extra complexity for marginal gain.** Adding ast-grep as a dependency (Rust binary) to do what exact string match already does 84% of the time is a hard sell.

4. **The real win is elsewhere.** Post-edit diagnostics (tsc check) catches more errors than structural search would prevent. Token-efficient output formatting saves more tokens than structural queries.

### When Structural Search DOES Win

- **Refactoring patterns.** "Rename all uses of `Effect.catchAll` to `Effect.catch`" — structural replace handles this perfectly, text replace would miss variations.
- **Code analysis.** "Find all async functions that don't handle errors" — impossible with regex, one pattern with ast-grep.
- **Cross-language consistency.** Same pattern syntax works for TS, Python, Rust, Go.
- **Migration scripts.** API changes across a codebase (OpenAI SDK migration). GritQL production users confirm this.

### Verdict for Theseus

**Phase 1: Don't include.** Plain text `search_replace` + `grep` (ripgrep) covers 80%+ of use cases. Add post-edit tsc diagnostics for the quality win.

**Phase 2: ast-grep as optional upgrade.** Expose as an additional tool (`structural_search` / `structural_replace`) alongside plain text tools. Use the ast-grep MCP server or shell out via `Bun.$`. The model chooses: simple text search for simple queries, structural search for refactoring patterns.

**Why ast-grep over GritQL for us:**
- LLMs can write patterns more reliably (it's just code with holes)
- Better performance
- MCP server exists
- We already use Biome for linting — GritQL in Biome is for lint rules, not agent tools
- ast-grep has an `llms.txt` and Claude skill — they've thought about the AI integration

---

## Recommendation Summary

### Phase 1 — Build Now (Bun Native + ripgrep)

| Tool | Backend | Key Decision |
|---|---|---|
| `read_file` | `Bun.file()` | `.type` for binary detection, `.size` for pre-check, 2000-line cap |
| `write_file` | `Bun.write()` | Platform-optimal syscalls, zero-copy where possible |
| `list_dir` | `readdir` (node:fs) | Bun's fast implementation, noise filtering in tool logic |
| `glob` | `Bun.Glob` | Native Zig scanner, zero external deps |
| `grep` | ripgrep via `Bun.$` | `rg --json` for structured output, parse into typed results, cap at 100 |
| `search_replace` | `Bun.file()` + `Bun.write()` | Read → replace in memory → write. Fuzzy fallback in TS. Post-edit tsc. |
| `shell` | `Bun.$` | Template literals, injection-safe, `.text()` / `.lines()`, `.nothrow()` |
| `outline` (new) | `web-tree-sitter` (WASM) | Tree-sitter skeleton: signatures without bodies. 60–80% token savings. |

**ripgrep `--json` note:** The `--json` flag outputs one JSON object per line. Match objects have `{type: "match", data: {path: {text}, lines: {text}, line_number, ...}}`. Combined with `--max-count`, `--sort modified`, `--glob`, we get a fully structured grep from one subprocess call. No stdout parsing.

### Phase 2 — Plug In Later (MCP + Sandbox/Workspace)

| Capability | Solution | Interface |
|---|---|---|
| Indexed search | codedb or Codemogger MCP server | Same `Tool<I, O>`, capability `fs.read` |
| Semantic search | Codemogger (ships own embedding model) or Context+ (Ollama) | MCP tools |
| Blast radius | Context+ spectral clustering | MCP tools |
| Repo map | Aider-style PageRank + tree-sitter, inject into system prompt | Session-level, not a tool |
| Parallel isolation | Sandcastle pattern (Docker + worktree) via Sandbox/Workspace | Runtime concern, not tool concern |
| Hard sandboxing | nsjail (Linux) / Docker (macOS) wrapping `Bun.$` | Runtime concern via Sandbox/Workspace |
| Structural search/replace | ast-grep CLI or MCP server | Optional `Tool<I, O>`, model chooses text vs structural |

### What NOT to Build Into Core

| Thing | Why Not |
|---|---|
| Trigram/inverted index | codedb does this better than we would. Use as MCP when needed. |
| Embedding infrastructure | Too much infra (Ollama + vector store). MCP slot via Codemogger/Context+. |
| Docker/VM sandbox | Deferred to Sandbox/Workspace wiring. Tool contract doesn't change. |
| Full LSP suite | Start with `find_references` only. Expand if needed. |
| Custom search engine | ripgrep + structured output formatting covers 80%. Indexed search via MCP for the rest. |

---

## Sources

- [codedb](https://github.com/justrach/codedb) — Zig trigram + inverted index code intelligence server
- [Context+](https://github.com/ForLoopCodes/contextplus) — tree-sitter + Ollama + spectral clustering MCP
- [Codemogger](https://github.com/glommer/codemogger) — tree-sitter + embedded ML model + sqlite-vec
- [Reflex](https://github.com/reflex-search/reflex) — Rust trigram + tree-sitter + static analysis
- [Zoekt](https://github.com/sourcegraph/zoekt) — Google trigram code search (Sourcegraph fork)
- [Livegrep](https://github.com/livegrep/livegrep) — trigram + suffix array interactive search
- [Sandcastle](https://github.com/mattpocock/sandcastle) — Docker + git worktree agent isolation
- [Aider repo map](https://aider.chat/docs/repomap.html) — PageRank + tree-sitter context optimization
- [ripgrep](https://github.com/BurntSushi/ripgrep) — Rust regex search (industry standard)
- [sqlite-vec](https://github.com/asg017/sqlite-vec) — SQLite vector search extension
- [Bun Glob API](https://bun.sh/docs/api/glob)
- [Bun Shell API](https://bun.sh/docs/runtime/shell)
- [Bun File I/O](https://bun.sh/docs/api/file-io)
- [Russ Cox: Regular Expression Matching with a Trigram Index](https://swtch.com/~rsc/regexp/regexp4.html)
- [Firecracker microVMs](https://firecracker-microvm.github.io/)
- [nsjail](https://github.com/google/nsjail)
- [tree-sitter](https://github.com/tree-sitter/tree-sitter)
- [ast-grep](https://github.com/ast-grep/ast-grep) — Rust structural search/lint/rewrite
- [ast-grep MCP](https://github.com/ast-grep/ast-grep-mcp) — MCP server for AI agents
- [ast-grep LLM prompting guide](https://ast-grep.github.io/advanced/prompting.html)
- [ast-grep agent journey](https://ast-grep.github.io/blog/ast-grep-agent.html) — LLM rule generation experiments
- [GritQL](https://github.com/biomejs/gritql) — declarative code query language (Biome ecosystem)
- [GritQL vs ast-grep comparison](https://dev.to/herrington_darkholme/biomes-gritql-plugin-vs-ast-grep-your-guide-to-ast-based-code-transformation-for-jsts-devs-29j2)
- [Code search design space](https://ast-grep.github.io/blog/code-search-design-space.html) — ast-grep's taxonomy of approaches
- [Comby](https://github.com/comby-tools/comby) — structural pattern matching (not AST-aware)
