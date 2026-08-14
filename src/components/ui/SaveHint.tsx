export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Could not save";
  return (
    <span className={`text-xs ${state === "error" ? "text-danger" : "text-ink-faint"}`}>
      {text}
    </span>
  );
}
