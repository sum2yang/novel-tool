import { SectionPanel } from "@/components/section-panel";
import { Badge } from "@/components/ui/badge";
import { getArtifactDisplayLabel } from "@/lib/projects/artifact-display";
import { getRevisionSummaryLabel } from "@/lib/projects/revision-display";
import { getWorkbenchSnapshot } from "@/lib/scaffold-data";

import { ExportCenterPanel } from "./export-center-panel";
import { PromptStudioPanel } from "./prompt-studio-panel";
import { ReferenceUploadForm } from "./reference-upload-form";
import { TaskCenterPanel } from "./task-center-panel";
import { WorkbenchModeNav } from "./workbench-mode-nav";
import { type WorkbenchMode } from "./workbench-modes";
import { WorkbenchRunConsole } from "./workbench-run-console";

type WorkbenchProject = Awaited<ReturnType<typeof getWorkbenchSnapshot>>;
type ResolvedWorkbenchProject = NonNullable<WorkbenchProject>;

function formatTime(value: Date | string | undefined | null) {
  if (!value) {
    return "未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function previewText(value: string | null | undefined, limit = 140) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "暂无内容。";
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function shortenId(value: string | null | undefined) {
  if (!value) {
    return "未记录";
  }

  return value.slice(0, 8);
}

export function WorkbenchShell({
  project,
  mode,
}: {
  project: ResolvedWorkbenchProject;
  mode: WorkbenchMode;
}) {
  return (
    <div className="space-y-5">
      <WorkbenchModeNav projectId={project.id} projectName={project.name} activeMode={mode} />

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <div className="space-y-5">
          <SectionPanel
            title="资料区"
            description="支持批量上传 `.txt` / `.md` / `.html`，并在这里查看抽取结果和标签。"
            action={<Badge>{project.references.length} 份资料</Badge>}
          >
            <div className="space-y-3">
              <ReferenceUploadForm projectId={project.id} />

              {project.references.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[var(--line)] bg-[var(--paper)] p-4 text-sm text-[var(--muted-ink)]">
                  还没有导入资料。上传后会自动提取正文、记录标签，并保存原始文件。
                </div>
              ) : null}

              {project.references.map((reference) => (
                <div key={reference.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--paper)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--ink)]">{reference.filename}</p>
                      <p className="mt-1 text-xs tracking-[0.14em] text-[var(--muted-ink)] uppercase">
                        {reference.sourceType}
                      </p>
                    </div>
                    <Badge className="bg-[rgba(85,109,89,0.12)] text-[#556d59]">
                      {reference.storageKey ? "已归档" : "未存储"}
                    </Badge>
                  </div>

                  <p className="mt-3 text-xs leading-6 text-[var(--muted-ink)]">
                    {reference.extractionMethod ?? "未记录抽取方式"}
                  </p>

                  <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">
                    {(reference.normalizedText || reference.extractedText || "暂无抽取正文。").slice(0, 180)}
                  </p>

                  {Array.isArray(reference.tags) && reference.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {reference.tags.map((tag) => (
                        <Badge key={`${reference.id}-${String(tag)}`} className="bg-[rgba(64,83,102,0.08)] text-[#405366]">
                          {String(tag)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel
            title="知识资产区"
            description="运行时默认从 `knowledge/` 读取提示模板、写作规则和基础流程。"
          >
            <div className="space-y-3 text-sm leading-7 text-[var(--ink-soft)]">
              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--paper)] p-4">
                <code>canonical_workflow.md</code> / <code>review_policy.md</code>
              </div>
              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--paper)] p-4">
                <code>prompt-routing.json</code> / <code>skill-composition.json</code>
              </div>
              <div className="rounded-[20px] border border-[var(--line)] bg-[var(--paper)] p-4">
                <code>task-types.json</code> / <code>context-priority.json</code>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel
            title="项目文件区"
            description="设定、状态、正文和历史版本都从这里进入。"
            action={
              <Badge>
                {project.artifacts.filter((artifact) => artifact.currentRevision).length}/{project.artifacts.length} 已形成正式版本
              </Badge>
            }
          >
            <div className="space-y-3">
              {project.artifacts.map((artifact) => (
                <details key={artifact.id} className="rounded-[20px] border border-[var(--line)] bg-[var(--paper)] p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[var(--ink)]">
                          {getArtifactDisplayLabel(artifact.artifactKey, artifact.filename)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-ink)]">{artifact.filename}</p>
                      </div>
                      <Badge className="bg-[rgba(64,83,102,0.08)] text-[#405366]">
                        {artifact.revisions.length} 个版本
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-[var(--muted-ink)]">
                      当前版本：
                      {" "}
                      {artifact.currentRevision
                        ? `${getRevisionSummaryLabel(artifact.currentRevision.summary)} · ${formatTime(artifact.currentRevision.createdAt)}`
                        : "尚未形成正式版本"}
                    </p>
                  </summary>

                  <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
                    <div className="rounded-[18px] border border-[var(--line)] p-3">
                      <p className="text-xs tracking-[0.14em] text-[var(--muted-ink)] uppercase">当前正式内容</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                        {previewText(artifact.currentRevision?.content, 220)}
                      </p>
                    </div>

                    {artifact.revisions.length === 0 ? (
                      <div className="rounded-[18px] border border-dashed border-[var(--line)] p-3 text-sm text-[var(--muted-ink)]">
                        还没有历史版本。先从结果面板接受一次草稿，或在提示词工坊里保存项目专属规则。
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {artifact.revisions.map((revision, index) => (
                          <div key={revision.id} className="rounded-[18px] border border-[var(--line)] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm text-[var(--ink)]">
                                  {getRevisionSummaryLabel(revision.summary)}
                                  {artifact.currentRevision?.id === revision.id ? " · 当前版本" : ""}
                                </p>
                                <p className="mt-1 text-xs text-[var(--muted-ink)]">
                                  版本 {index + 1} · {formatTime(revision.createdAt)}
                                </p>
                              </div>
                              <Badge className="bg-[rgba(85,109,89,0.12)] text-[#556d59]">
                                {artifact.currentRevision?.id === revision.id ? "当前版本" : "历史版本"}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-6 text-[var(--muted-ink)]">
                              来源草稿 / 运行记录：{shortenId(revision.sourceDraftId)} / {shortenId(revision.sourceRunId)}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{previewText(revision.content, 180)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </SectionPanel>
        </div>

        {mode === "task-center" ? (
          <div className="xl:col-span-2">
            <TaskCenterPanel project={project} />
          </div>
        ) : mode === "prompt-studio" ? (
          <div className="xl:col-span-2">
            <PromptStudioPanel project={project} />
          </div>
        ) : mode === "export" ? (
          <div className="xl:col-span-2">
            <ExportCenterPanel project={project} />
          </div>
        ) : (
          <WorkbenchRunConsole project={project} mode={mode} />
        )}
      </div>
    </div>
  );
}
