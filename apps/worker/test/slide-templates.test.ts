import test from "node:test";
import assert from "node:assert/strict";

import { renderImageCleanSlideHtml } from "../src/templates/slide-image-clean-v1/template.js";
import { renderImageFocusSlideHtml } from "../src/templates/slide-image-focus-v1/template.js";

test("slide-image-clean-v1 renders without on-screen title or bullets", () => {
  const html = renderImageCleanSlideHtml({ imageUrl: "https://example.com/image.png" });
  assert.ok(html.includes("https://example.com/image.png"));
  assert.ok(!html.includes("<h1"));
  assert.ok(!html.includes("<ul"));
});

test("slide-image-focus-v1 renders without on-screen title or bullets", () => {
  const html = renderImageFocusSlideHtml({ imageUrl: "https://example.com/image.png" });
  assert.ok(html.includes("https://example.com/image.png"));
  assert.ok(!html.includes("<h1"));
  assert.ok(!html.includes("<ul"));
});
