# Design Note 001: Thinking Telemetry Satellite

**Date**: 2026-04-13
**Status**: Draft
**Context**: [AMD Senior AI Director telemetry analysis](https://x.com/tengyanAI/status/2043138374794666490)

## Problem

LLM providers silently degrade model behavior. Anthropic reduced default
thinking effort from "high" to "medium" without telling users. Most users
had no data to notice.

An AMD director caught it because she had 7k sessions of telemetry:
- Median thinking dropped ~2200 → ~600 chars
- Reads-per-edit dropped 6.6x → 2.0x
- Self-contradiction in reasoning tripled
- API requests up 80x (failed attempts → retries → burned tokens)
- CLAUDE.md conventions ignored (insufficient thinking to cross-check)
- Quality is GPU-load-sensitive (5pm/7pm PST worst, late night best)

We cannot force a model to think harder. That's out of our control.
What we can do: **record everything, measure quality signals, detect
degradation, and switch providers when one degrades.**

## Design: Thinking Telemetry Satellite

A Satellite (always-on capsule middleware) that instruments every LLM
call with structured telemetry. Runs passively — zero overhead on the
agent's work, just observes and logs.

### What we record (per LLM call)

```
ThinkingTelemetry {
  // Identity
  mission_id: string
  agent_id: string
  provider: string          // "copilot" | "anthropic" | "openrouter" | ...
  model: string             // "gpt-5.4" | "claude-sonnet-4-6" | ...
  timestamp: Date

  // Thinking quality signals
  thinking_chars: number    // length of reasoning/thinking block
  thinking_tokens: number   // if provider reports it

  // Behavior signals
  reads_before_edit: number // file reads since last file write
  tool_calls: number        // total tools invoked in this turn
  bail_outs: number         // "should I continue?" / "would you like me to..."
  self_contradictions: number // "oh wait, actually..." / "let me reconsider"
  retries: number           // same tool called again with ~same args

  // Cost signals
  input_tokens: number
  output_tokens: number
  latency_ms: number

  // Context signals
  hour_utc: number          // for time-of-day analysis
  day_of_week: number
}
```

### Derived metrics (computed over windows)

| Metric | What it measures | AMD baseline |
|---|---|---|
| `median_thinking_chars` | reasoning depth | 2200 → 600 = nerf |
| `reads_per_edit` | research before action | 6.6 → 2.0 = nerf |
| `bail_rate` | model trying to quit | 0 → 10/day = nerf |
| `contradiction_rate` | reasoning coherence | tripled = nerf |
| `retry_rate` | failed attempts | 80x increase = nerf |
| `cost_per_success` | efficiency | up = nerf |
| `quality_by_hour` | load-sensitivity | 5pm bad, 2am good |

### Where it lives

- **Capsule events**: each telemetry record is a capsule event
  (`kind: "telemetry.thinking"`). Persisted in session log automatically.
- **Satellite**: `ThinkingTelemetrySatellite` wraps the LanguageModel
  provider, intercepts responses, extracts signals, writes to capsule.
  The agent and tools don't know it's there.

### What it enables

**Detection** — compare metrics across time windows. If `median_thinking_chars`
drops 70% in a week, something changed. Alert.

**Provider comparison** — run same mission on two providers, compare
telemetry. Pick the one that reads more before editing.

**Time-of-day routing** — if 5pm PST is measurably worse, schedule
heavy missions for off-peak or route to a different provider.

**Model switching** — when a provider degrades past threshold, the
harness can automatically prefer a different provider for new missions.

**Capsule review** — weekly/biweekly review of telemetry aggregates.
Human looks at trends, decides if provider config needs updating.
Not automatic — human authority over provider decisions.

## What this is NOT

- Not a way to make models think harder. Can't control that.
- Not a prompt trick or enforcement gate. Passive observation only.
- Not automatic model switching (yet). Human reviews, human decides.
- Not provider-specific. Same telemetry shape regardless of model.

## Implementation sketch

```
ThinkingTelemetrySatellite
  wraps: LanguageModel
  on each response:
    1. extract thinking block length
    2. count tool calls, classify bail-outs / contradictions
    3. track reads-since-last-write counter
    4. write ThinkingTelemetry event to Capsule
    5. pass response through unchanged (transparent)
```

The satellite is a LanguageModel decorator — same interface in, same
interface out, telemetry as a side effect to capsule.

## Priority

First satellite we build. The data compounds — every mission adds signal.
Starting late means missing the baseline window (you need "normal" data
to detect "degraded" data).

For now: MD doc / design note. Next: implement as a Satellite that writes
capsule events. Then: aggregation queries over capsule data.

## References

- AMD telemetry: 7k sessions, Jan–Mar 2026
- Anthropic silently changed default effort "high" → "medium"
- Workaround `/effort max` is provider-specific and fragile
- Theseus approach: observe, measure, switch — don't try to control
  what you can't control
