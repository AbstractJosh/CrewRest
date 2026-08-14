"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("That isn't a PDF. Choose your roster PDF.");
      return;
    }
    setError(null);
    setFile(candidate);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a schedule PDF first.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      router.push(`/pilot/${data.crewId}`);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          accept(event.dataTransfer.files[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            fileInputRef.current?.click();
          } else if (event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Choose a roster PDF to upload"
        className={`cursor-pointer rounded-xl border border-dashed px-5 py-10 text-center transition-colors outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action ${
          isDragging ? "border-ink-faint bg-sunken" : "border-perf bg-card"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => accept(event.target.files?.[0])}
        />
        {file ? (
          <>
            <p className="font-mono text-sm text-ink">{file.name}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {formatSize(file.size)} · click to choose a different file
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink">Drop your roster PDF here</p>
            <p className="mt-1 text-xs text-ink-faint">or click to browse</p>
          </>
        )}
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <Button type="submit" disabled={isUploading || !file} className="self-start">
        {isUploading ? "Reading schedule…" : "Upload schedule"}
      </Button>
    </form>
  );
}
