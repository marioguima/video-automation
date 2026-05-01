import { chromium, type Browser } from "playwright";

import { renderTextSlideHtml } from "./templates/slide-text-v0/template.js";
import { renderImageSlideHtml } from "./templates/slide-image-v1/template.js";

type SlideTextPayload = {
  title: string;
  bullets: string[];
  imageUrl?: string | null;
};

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

export async function renderTextSlidePng(
  payload: SlideTextPayload,
  outputPath: string
): Promise<boolean> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  await page.setContent(renderTextSlideHtml(payload), { waitUntil: "load" });
  const imageLoaded = await page.evaluate(async (url) => {
    if (!url) return false;
    const imageCtor = (globalThis as any)["Image"] as (new () => any) | undefined;
    if (!imageCtor) return false;
    return await new Promise<boolean>((resolve) => {
      const img = new imageCtor();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }, payload.imageUrl ?? null);
  await page.evaluate(() => {
    const doc = (globalThis as any)["document"] as { fonts?: { ready?: Promise<unknown> } } | undefined;
    return doc?.fonts?.ready;
  });
  await page.waitForTimeout(40);
  await page.screenshot({ path: outputPath, type: "png" });
  await page.close();
  return imageLoaded;
}

type SlideImagePayload = SlideTextPayload & { imageUrl?: string | null };

export async function renderImageSlidePng(
  payload: SlideImagePayload,
  outputPath: string
): Promise<boolean> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  await page.setContent(renderImageSlideHtml(payload), { waitUntil: "load" });
  const imageLoaded = await page.evaluate(async (url) => {
    if (!url) return false;
    const imageCtor = (globalThis as any)["Image"] as (new () => any) | undefined;
    if (!imageCtor) return false;
    return await new Promise<boolean>((resolve) => {
      const img = new imageCtor();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }, payload.imageUrl ?? null);
  await page.evaluate(() => {
    const doc = (globalThis as any)["document"] as { fonts?: { ready?: Promise<unknown> } } | undefined;
    return doc?.fonts?.ready;
  });
  await page.waitForTimeout(40);
  await page.screenshot({ path: outputPath, type: "png" });
  await page.close();
  return imageLoaded;
}
