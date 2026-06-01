import type { WriteStream } from "node:fs";
import { type MutableRefObject, useCallback, useEffect } from "react";
import { type ResolvedHook, runHooks } from "../../../hooks.js";
import { stopAndSaveCpuProfile } from "../../cpu-prof.js";

export interface QuitOptions {
  /** Optional hooks to fire SessionEnd before exit. */
  hooks?: ResolvedHook[];
  /** cwd for the SessionEnd payload. */
  cwd?: string;
  /** Current turn count for the SessionEnd payload. */
  turn?: number;
}

/** Ctrl+C / SIGINT → flush transcript + fire SessionEnd hooks + (if profiling) save .cpuprofile, then `process.exit(0)`. We call `process.exit` directly rather than Ink's `exit()` because the singleton stdin reader keeps a `data` listener attached — `exit()` would unmount the React tree but leave the event loop alive and the terminal would hang. */
export function useQuit(
  transcriptRef: MutableRefObject<WriteStream | null>,
  quitOpts?: QuitOptions | (() => QuitOptions),
): () => void {
  const quitProcess = useCallback(() => {
    transcriptRef.current?.end();
    void (async () => {
      const opts = typeof quitOpts === "function" ? quitOpts() : quitOpts;
      if (opts?.hooks?.some((h) => h.event === "SessionEnd")) {
        await runHooks({
          hooks: opts.hooks,
          payload: {
            event: "SessionEnd",
            cwd: opts.cwd ?? process.cwd(),
            turn: opts.turn ?? 0,
          },
        }).catch(() => undefined);
      }
      await stopAndSaveCpuProfile();
      process.exit(0);
    })();
  }, [transcriptRef, quitOpts]);

  useEffect(() => {
    process.on("SIGINT", quitProcess);
    return () => {
      process.off("SIGINT", quitProcess);
    };
  }, [quitProcess]);

  return quitProcess;
}
