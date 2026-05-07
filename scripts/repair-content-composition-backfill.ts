import { randomUUID } from "node:crypto";
import { createPrismaClient } from "../packages/db/src/index.ts";

type ProjectRecord = {
  id: string;
  workspaceId: string;
  language: string | null;
  metadataJson: string | null;
};

type OutputDefinitionDraft = {
  key: string;
  channel: string;
  label: string;
  mediaType: string;
  destination: string;
  aspectRatio: string;
  presetId: string;
  language: string | null;
  metadataJson: string | null;
};

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function slugifyOutputPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "output";
}

function normalizeAspectRatio(value: unknown): string {
  return normalizeOptionalText(value) ?? "16:9";
}

function normalizePresetId(value: string | null): string {
  return value ?? "clean-authority";
}

function readProjectOutputDefinitions(project: ProjectRecord): OutputDefinitionDraft[] {
  const metadata = parseJsonRecord(project.metadataJson);
  const rawOutputs = Array.isArray(metadata?.defaultOutputs) ? metadata.defaultOutputs : [];
  const definitions: OutputDefinitionDraft[] = [];
  for (const raw of rawOutputs) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const channel = normalizeOptionalText(entry.channel) ?? "output";
    const label = normalizeOptionalText(entry.label) ?? channel;
    const mediaType = normalizeOptionalText(entry.mediaType) ?? "video";
    const destination = normalizeOptionalText(entry.destination) ?? channel;
    const aspectRatio = normalizeAspectRatio(entry.aspectRatio);
    const presetId = normalizePresetId(normalizeOptionalText(entry.presetId));
    const key = `${slugifyOutputPart(channel)}-${slugifyOutputPart(mediaType)}-${slugifyOutputPart(aspectRatio)}`;
    definitions.push({
      key,
      channel,
      label,
      mediaType,
      destination,
      aspectRatio,
      presetId,
      language: project.language,
      metadataJson: JSON.stringify(entry)
    });
  }
  return definitions;
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const projects = await prisma.contentProject.findMany({
      select: { id: true, workspaceId: true, language: true, metadataJson: true }
    });

    let definitionCount = 0;
    let outputCount = 0;

    for (const project of projects) {
      const definitions = readProjectOutputDefinitions(project);
      if (definitions.length === 0) continue;

      const definitionByKey = new Map<string, { id: string; channel: string; aspectRatio: string; mediaType: string; destination: string; presetId: string }>();

      for (const definition of definitions) {
        const saved = await prisma.projectOutputDefinition.upsert({
          where: {
            projectId_key: {
              projectId: project.id,
              key: definition.key
            }
          },
          update: {
            channel: definition.channel,
            label: definition.label,
            mediaType: definition.mediaType,
            destination: definition.destination,
            aspectRatio: definition.aspectRatio,
            presetId: definition.presetId,
            language: definition.language,
            isActive: true,
            metadataJson: definition.metadataJson
          },
          create: {
            workspaceId: project.workspaceId,
            projectId: project.id,
            key: definition.key,
            channel: definition.channel,
            label: definition.label,
            mediaType: definition.mediaType,
            destination: definition.destination,
            aspectRatio: definition.aspectRatio,
            presetId: definition.presetId,
            language: definition.language,
            isActive: true,
            metadataJson: definition.metadataJson
          },
          select: {
            id: true,
            channel: true,
            aspectRatio: true,
            mediaType: true,
            destination: true,
            presetId: true
          }
        });
        definitionByKey.set(definition.key, saved);
        definitionCount += 1;
      }

      const links = await prisma.contentProjectItem.findMany({
        where: {
          workspaceId: project.workspaceId,
          projectId: project.id
        },
        include: {
          item: true
        }
      });

      for (const link of links) {
        for (const definition of definitions) {
          const savedDefinition = definitionByKey.get(definition.key);
          if (!savedDefinition) continue;
          const nextTitle = `${link.item.title} - ${savedDefinition.channel} ${savedDefinition.aspectRatio}`;
          await prisma.projectContentOutput.upsert({
            where: {
              projectId_itemId_outputDefinitionId: {
                projectId: project.id,
                itemId: link.itemId,
                outputDefinitionId: savedDefinition.id
              }
            },
            update: {
              projectItemId: link.id,
              title: nextTitle,
              mediaType: savedDefinition.mediaType,
              channel: savedDefinition.channel,
              destination: savedDefinition.destination,
              aspectRatio: savedDefinition.aspectRatio,
              presetId: savedDefinition.presetId
            },
            create: {
              id: randomUUID(),
              workspaceId: project.workspaceId,
              projectId: project.id,
              projectItemId: link.id,
              itemId: link.itemId,
              outputDefinitionId: savedDefinition.id,
              title: nextTitle,
              mediaType: savedDefinition.mediaType,
              channel: savedDefinition.channel,
              destination: savedDefinition.destination,
              aspectRatio: savedDefinition.aspectRatio,
              presetId: savedDefinition.presetId,
              status: "not_started",
              currentStage: "queued",
              metadataJson: JSON.stringify({ derivedFromProjectOutput: true })
            }
          });
          outputCount += 1;
        }
      }
    }

    console.log(JSON.stringify({ ok: true, definitionsTouched: definitionCount, outputsTouched: outputCount }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
