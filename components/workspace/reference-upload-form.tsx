"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReferenceUploadFormProps = {
  projectId: string;
};

export function ReferenceUploadForm({ projectId }: ReferenceUploadFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/references`, {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | { count?: number; filenames?: string[] }
          | { filename?: string }
          | null;

        if (!response.ok) {
          const errorMessage =
            payload && "error" in payload ? payload.error?.message : undefined;
          throw new Error(errorMessage ?? "Reference upload failed.");
        }

        formRef.current?.reset();
        const selectedCount = fileInputRef.current?.files?.length ?? 0;
        if (payload && "count" in payload && typeof payload.count === "number") {
          const previewNames = Array.isArray(payload.filenames) ? payload.filenames.slice(0, 3).join("、") : "";
          setMessage(
            payload.count === 1
              ? `已导入 ${previewNames || "1 份资料"}`
              : `已导入 ${payload.count} 份资料${previewNames ? `：${previewNames}` : ""}`,
          );
        } else if (payload && "filename" in payload) {
          setMessage(`已导入 ${payload.filename}`);
        } else if (selectedCount > 1) {
          setMessage(`已导入 ${selectedCount} 份资料。`);
        } else {
          setMessage("资料已导入。");
        }
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Reference upload failed.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3 rounded-[20px] border border-[var(--line)] bg-[var(--paper)] p-4">
      <div>
        <label className="mb-2 block text-xs tracking-[0.16em] text-[var(--muted-ink)] uppercase">上传文件</label>
        <Input
          ref={fileInputRef}
          name="files"
          type="file"
          required
          multiple
          accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html"
          className="file:mr-3 file:rounded-full file:border-0 file:bg-[var(--panel)] file:px-3 file:py-2 file:text-xs file:text-[var(--ink)]"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs tracking-[0.16em] text-[var(--muted-ink)] uppercase">标签</label>
        <Input name="tags" placeholder="例如：世界观, 角色卡, 平台规则" />
      </div>

      <div>
        <label className="mb-2 block text-xs tracking-[0.16em] text-[var(--muted-ink)] uppercase">来源 URL</label>
        <Input name="sourceUrl" type="url" placeholder="可选，用于记录资料原始来源" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted-ink)]">
          支持一次选择多份 `.txt` / `.md` / `.html`，标签和来源 URL 会应用到本次所有文件。
        </p>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "导入中" : "导入资料"}
        </Button>
      </div>

      {error ? <p className="text-sm text-[#9f3a2f]">{error}</p> : null}
      {message ? <p className="text-sm text-[#556d59]">{message}</p> : null}
    </form>
  );
}
