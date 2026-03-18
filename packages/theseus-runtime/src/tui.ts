/**
 * TuiLogger — minimal log-only terminal output.
 *
 * Prints timestamped, ANSI-coloured lines directly to stdout.
 * No re-render, no panes, no keyboard — just a clean running log
 * so you can watch agents talk to each other.
 *
 * Colour scheme:
 *   dim grey  — timestamp
 *   cyan      — agent name (from/to)
 *   yellow    — arrow →
 *   white     — message content
 *   green     — runtime info lines
 */
import { Effect, Layer, ServiceMap } from "effect"

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const R = "\x1b[0m"
const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const GREY = "\x1b[90m"

const ts = () => {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  const ms = String(d.getMilliseconds()).padStart(3, "0")
  return `${GREY}${hh}:${mm}:${ss}.${ms}${R}`
}

const agent = (name: string) => `${CYAN}${BOLD}[${name}]${R}`
const arrow = () => `${YELLOW}→${R}`

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export class TuiLogger extends ServiceMap.Service<
  TuiLogger,
  {
    /** A sends to B: [HH:MM:SS.mmm] [from] → [to]  content */
    message: (
      from: string,
      to: string,
      content: string,
    ) => Effect.Effect<void>

    /** Runtime info: [HH:MM:SS.mmm] [theseus]  content */
    info: (content: string) => Effect.Effect<void>

    /** Runtime warning */
    warn: (content: string) => Effect.Effect<void>

    /** Runtime error */
    error: (content: string) => Effect.Effect<void>
  }
>()("TuiLogger") {}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const TuiLoggerLive = Layer.succeed(TuiLogger)({
  message: (from, to, content) =>
    Effect.sync(() => {
      process.stdout.write(
        `${ts()} ${agent(from)} ${arrow()} ${agent(to)}  ${content}\n`,
      )
    }),

  info: (content) =>
    Effect.sync(() => {
      process.stdout.write(`${ts()} ${GREEN}${BOLD}[theseus]${R}  ${content}\n`)
    }),

  warn: (content) =>
    Effect.sync(() => {
      process.stdout.write(
        `${ts()} ${YELLOW}${BOLD}[theseus]${R}  ${content}\n`,
      )
    }),

  error: (content) =>
    Effect.sync(() => {
      process.stdout.write(`${ts()} ${RED}${BOLD}[theseus]${R}  ${content}\n`)
    }),
})
