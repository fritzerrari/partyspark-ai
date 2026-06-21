export async function sha256(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function probeAudio(file: File): Promise<{ duration: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio(url);
    a.addEventListener("loadedmetadata", () => {
      const duration = a.duration && isFinite(a.duration) ? a.duration : 0;
      URL.revokeObjectURL(url);
      resolve({ duration });
    });
    a.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      resolve({ duration: 0 });
    });
  });
}

export function bytesToHuman(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export const FX_MAX_DURATION_SEC = 30;
export const FX_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export const FX_CATEGORIES = [
  { value: "drop", label: "Drop" },
  { value: "riser", label: "Riser" },
  { value: "airhorn", label: "Airhorn" },
  { value: "sweep", label: "Sweep" },
  { value: "voice", label: "Voice Tag" },
  { value: "impact", label: "Impact" },
  { value: "transition", label: "Transition" },
  { value: "loop", label: "Loop" },
  { value: "other", label: "Other" },
] as const;