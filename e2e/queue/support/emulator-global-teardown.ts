// @ts-nocheck
/**
 * emulator-global-teardown.ts — stops the emulator that emulator-global-setup spawned (if any).
 * No-op when attached to an externally-running emulator (EMU_REUSE=1 / pre-existing ports).
 */
export default async function emulatorGlobalTeardown() {
  const handle = (globalThis as any).__QUEUE_EMU_HANDLE__;
  if (handle && typeof handle.stop === 'function') {
    await handle.stop();
  }
}
