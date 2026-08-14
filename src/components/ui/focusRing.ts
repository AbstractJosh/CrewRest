/**
 * The keyboard-focus ring shared by every interactive element that isn't a `Button`/`ButtonLink`
 * or the `<details>` summary (those keep the browser default). Pair it with a base `outline-none`
 * on the element so the ring only appears via `:focus-visible`, not on every mouse click.
 *
 * Hoisted so the chrome (`AppHeader`'s wordmark and nav links, `ThemeToggle`), the upload drop
 * zone (`UploadForm`) and the shared form `CONTROL` (`Field.tsx`) can't drift from each other.
 * No hooks, so this is importable from server and client components alike.
 */
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";
