/**
 * icarus — Icarus CLI entry point.
 *
 * TODO: Rewrite against DispatchEvent streams from @theseus.run/core/Dispatch.
 * The old RuntimeBus + AppLayer + main architecture has been removed.
 *
 * The new architecture:
 *   - Dispatch.Handle.events (Stream<DispatchEvent>) is the observable surface
 *   - Dispatch.Handle.inject pushes Injections (steer, interrupt, redirect)
 *   - No global bus — each dispatch has its own event stream
 *   - icarus-cli will subscribe to dispatch streams and render them via Ink
 */

// biome-ignore lint/suspicious/noConsole: stub entry point
console.log("icarus-cli is not yet wired to the new dispatch architecture. See bin/icarus.tsx for plan.");
