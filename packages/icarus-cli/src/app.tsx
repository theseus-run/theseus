/**
 * App — STUB.
 *
 * The old Ink UI (scrollback + agent diagram + input line) was wired to
 * RuntimeBus UIEvent types that no longer exist. Needs full rewrite against
 * DispatchEvent from @theseus.run/core/Dispatch.
 *
 * Components to rebuild:
 *   - Event log (DispatchEvent stream → rendered rows)
 *   - Input line (user commands → Dispatch.Handle.inject)
 *   - Agent status (derived from DispatchEvent._tag === "Calling" / "Done")
 */
