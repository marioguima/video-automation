import fs from "node:fs";
import path from "node:path";

import { resolveDataDir } from "./config.js";

export function ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function dataRootDir(): string {
  return resolveDataDir();
}

function domainRootFolderName(): string {
  const value = process.env.VIZLEC_STORAGE_DOMAIN_ROOT?.trim().toLowerCase();
  if (!value) return "channels";
  // Keep this constrained to simple folder names to avoid path traversal/config mistakes.
  return /^[a-z0-9_-]+$/.test(value) ? value : "channels";
}

function legacyDomainRootFolderName(): string {
  return "courses";
}

function resolveDomainRootPath(): string {
  const canonical = path.join(dataRootDir(), domainRootFolderName());
  const legacy = path.join(dataRootDir(), legacyDomainRootFolderName());
  // Read/write existing legacy trees during migration; new installs use canonical folder.
  if (!fs.existsSync(canonical) && fs.existsSync(legacy)) {
    return legacy;
  }
  return canonical;
}

export function courseDir(courseId: string): string {
  return channelDir(courseId);
}

export function moduleDir(courseId: string, moduleId: string): string {
  return sectionDir(courseId, moduleId);
}

export function lessonDir(courseId: string, moduleId: string, lessonId: string): string {
  return videoDir(courseId, moduleId, lessonId);
}

export function lessonVersionDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): string {
  return videoVersionDir(courseId, moduleId, lessonId, versionId);
}

export function blockDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return videoBlockDir(courseId, moduleId, lessonId, versionId, blockIndex);
}

export function blockAudioDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return videoBlockAudioDir(courseId, moduleId, lessonId, versionId, blockIndex);
}

export function blockImageRawDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return videoBlockImageRawDir(courseId, moduleId, lessonId, versionId, blockIndex);
}

export function blockSlideDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return videoBlockSlideDir(courseId, moduleId, lessonId, versionId, blockIndex);
}

export function blockClipDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return videoBlockClipDir(courseId, moduleId, lessonId, versionId, blockIndex);
}

export function lessonFinalDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): string {
  return videoFinalDir(courseId, moduleId, lessonId, versionId);
}

export function lessonManifestPath(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): string {
  return videoManifestPath(courseId, moduleId, lessonId, versionId);
}

export function ensureLessonVersionDirs(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): void {
  ensureVideoVersionDirs(courseId, moduleId, lessonId, versionId);
}

// Canonical domain helpers (channel -> section -> video)
export function channelDir(channelId: string): string {
  return path.join(resolveDomainRootPath(), channelId);
}

export function sectionDir(channelId: string, sectionId: string): string {
  return path.join(channelDir(channelId), "modules", sectionId);
}

export function videoDir(channelId: string, sectionId: string, videoId: string): string {
  return path.join(sectionDir(channelId, sectionId), "lessons", videoId);
}

export function videoVersionDir(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string
): string {
  return path.join(videoDir(channelId, sectionId, videoId), "versions", versionId);
}

export function videoBlockDir(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(videoVersionDir(channelId, sectionId, videoId, versionId), "blocks", String(blockIndex));
}

export function videoBlockAudioDir(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(videoBlockDir(channelId, sectionId, videoId, versionId, blockIndex), "audio");
}

export function videoBlockImageRawDir(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(videoBlockDir(channelId, sectionId, videoId, versionId, blockIndex), "image_raw");
}

export function videoBlockSlideDir(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(videoBlockDir(channelId, sectionId, videoId, versionId, blockIndex), "slide");
}

export function videoBlockClipDir(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(videoBlockDir(channelId, sectionId, videoId, versionId, blockIndex), "clip");
}

export function videoFinalDir(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string
): string {
  return path.join(videoVersionDir(channelId, sectionId, videoId, versionId), "final");
}

export function videoManifestPath(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string
): string {
  return path.join(videoVersionDir(channelId, sectionId, videoId, versionId), "manifest.json");
}

export function ensureVideoVersionDirs(
  channelId: string,
  sectionId: string,
  videoId: string,
  versionId: string
): void {
  ensureDir(videoVersionDir(channelId, sectionId, videoId, versionId));
  ensureDir(path.join(videoVersionDir(channelId, sectionId, videoId, versionId), "blocks"));
  ensureDir(videoFinalDir(channelId, sectionId, videoId, versionId));
}
