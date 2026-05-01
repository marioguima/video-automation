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

export function courseDir(courseId: string): string {
  return path.join(dataRootDir(), "courses", courseId);
}

export function moduleDir(courseId: string, moduleId: string): string {
  return path.join(courseDir(courseId), "modules", moduleId);
}

export function lessonDir(courseId: string, moduleId: string, lessonId: string): string {
  return path.join(moduleDir(courseId, moduleId), "lessons", lessonId);
}

export function lessonVersionDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): string {
  return path.join(lessonDir(courseId, moduleId, lessonId), "versions", versionId);
}

export function blockDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(lessonVersionDir(courseId, moduleId, lessonId, versionId), "blocks", String(blockIndex));
}

export function blockAudioDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(blockDir(courseId, moduleId, lessonId, versionId, blockIndex), "audio");
}

export function blockImageRawDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(blockDir(courseId, moduleId, lessonId, versionId, blockIndex), "image_raw");
}

export function blockSlideDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(blockDir(courseId, moduleId, lessonId, versionId, blockIndex), "slide");
}

export function blockClipDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string,
  blockIndex: number
): string {
  return path.join(blockDir(courseId, moduleId, lessonId, versionId, blockIndex), "clip");
}

export function lessonFinalDir(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): string {
  return path.join(lessonVersionDir(courseId, moduleId, lessonId, versionId), "final");
}

export function lessonManifestPath(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): string {
  return path.join(lessonVersionDir(courseId, moduleId, lessonId, versionId), "manifest.json");
}

export function ensureLessonVersionDirs(
  courseId: string,
  moduleId: string,
  lessonId: string,
  versionId: string
): void {
  ensureDir(lessonVersionDir(courseId, moduleId, lessonId, versionId));
  ensureDir(path.join(lessonVersionDir(courseId, moduleId, lessonId, versionId), "blocks"));
  ensureDir(lessonFinalDir(courseId, moduleId, lessonId, versionId));
}
