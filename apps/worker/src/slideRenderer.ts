import { chromium, type Browser } from "playwright";

import { renderTextSlideHtml } from "./templates/slide-text-v0/template.js";
import { renderImageSlideHtml } from "./templates/slide-image-v1/template.js";
import { renderImageCleanSlideHtml } from "./templates/slide-image-clean-v1/template.js";
import { renderImageFocusSlideHtml } from "./templates/slide-image-focus-v1/template.js";

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
  return renderSlideHtmlToPng(renderTextSlideHtml(payload), payload.imageUrl, outputPath);
}

type SlideImagePayload = SlideTextPayload & { imageUrl?: string | null };

export async function renderImageSlidePng(
  payload: SlideImagePayload,
  outputPath: string
): Promise<boolean> {
  return renderSlideHtmlToPng(renderImageSlideHtml(payload), payload.imageUrl, outputPath);
}

type SlideVisualPayload = { imageUrl?: string | null };

export async function renderImageCleanSlidePng(
  payload: SlideVisualPayload,
  outputPath: string
): Promise<boolean> {
  return renderSlideHtmlToPng(renderImageCleanSlideHtml(payload), payload.imageUrl, outputPath);
}

export async function renderImageFocusSlidePng(
  payload: SlideVisualPayload,
  outputPath: string
): Promise<boolean> {
  return renderSlideHtmlToPng(renderImageFocusSlideHtml(payload), payload.imageUrl, outputPath);
}

async function renderSlideHtmlToPng(
  html: string,
  imageUrl: string | null | undefined,
  outputPath: string
): Promise<boolean> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  await page.setContent(html, { waitUntil: "load" });
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
  }, imageUrl ?? null);
  await page.evaluate(() => {
    const doc = (globalThis as any)["document"] as { fonts?: { ready?: Promise<unknown> } } | undefined;
    return doc?.fonts?.ready;
  });
  await page.waitForTimeout(40);
  await page.screenshot({ path: outputPath, type: "png" });
  await page.close();
  return imageLoaded;
}
