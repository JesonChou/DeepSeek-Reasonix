// Run: tsx src/__tests__/line-number-code.test.tsx

import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { CodeViewer } from "../components/CodeViewer";
import LineNumberCode, {
  findCodeMatches,
  highlightCodeMatches,
  splitHighlightedCodeLines,
} from "../components/editors/LineNumberCode";
import { highlightToHtml } from "../lib/highlight";
import { LocaleProvider } from "../lib/i18n";

let passed = 0;
let failed = 0;

function ok(value: unknown, label: string) {
  if (value) {
    process.stdout.write(`  PASS  ${label}\n`);
    passed += 1;
  } else {
    process.stdout.write(`  FAIL  ${label}\n`);
    failed += 1;
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

console.log("\nline-number code viewer");

const repeatedMatches = findCodeMatches("x\nx\nx", "x");
ok(repeatedMatches.length === 3, "finds matches on consecutive lines");
ok(
  repeatedMatches.map((match) => match.lineIndex).join(",") === "0,1,2",
  "does not carry regex state between lines",
);
ok(findCodeMatches("x x", "x").length === 2, "counts occurrences rather than matching lines");
ok(
  findCodeMatches("猫 猫咪 猫", "猫", false, true).length === 2,
  "whole-word matching respects Unicode word characters",
);

const entitySource = "const x = \"<&\";";
for (const query of ["<", "&"]) {
  const matches = findCodeMatches(entitySource, query);
  const markedHtml = highlightCodeMatches(
    highlightToHtml(entitySource, "typescript"),
    matches,
    0,
  );
  const entityDom = new JSDOM(`<code>${markedHtml}</code>`);
  const code = entityDom.window.document.querySelector("code");
  ok(code?.textContent === entitySource, `searching ${query} preserves rendered source text`);
  ok(code?.querySelectorAll("mark").length === 1, `searching ${query} highlights the exact entity`);
}

const multilineSource = "const value = `first\nsecond`;";
const multilineHtml = splitHighlightedCodeLines(highlightToHtml(multilineSource, "typescript"));
ok(multilineHtml.length === 2, "splits highlighted multiline source into rows");
ok(multilineHtml[1].includes("hljs-string"), "preserves lexer state on the second line");

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
(dom.window.HTMLElement.prototype as unknown as { attachEvent: () => void }).attachEvent = () => {};
(dom.window.HTMLElement.prototype as unknown as { detachEvent: () => void }).detachEvent = () => {};
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const container = document.getElementById("root")!;
const root = createRoot(container);
await act(async () => {
  root.render(
    <LocaleProvider>
      <LineNumberCode value="alpha" showLineNumbers />
      <LineNumberCode value="beta" showLineNumbers />
    </LocaleProvider>,
  );
});

ok(container.querySelectorAll(".code-block__copy").length === 2, "keeps copy controls on line-number viewers");
const viewers = container.querySelectorAll<HTMLElement>(".code--lines");
await act(async () => {
  viewers[0].focus();
  viewers[0].dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
  await flush();
});
ok(container.querySelectorAll(".code-search").length === 1, "opens search only for the focused viewer");
ok(
  container.querySelectorAll(".code-block__wrap")[0].querySelector(".code-search") != null,
  "keeps the search shortcut scoped to its owning viewer",
);
ok(
  container.querySelectorAll(".code-block__wrap")[1].querySelector(".code-search") == null,
  "does not fan the shortcut out to sibling viewers",
);

await act(async () => root.unmount());

const defaultContainer = document.createElement("div");
document.body.appendChild(defaultContainer);
const defaultRoot = createRoot(defaultContainer);
await act(async () => {
  defaultRoot.render(
    <LocaleProvider>
      <CodeViewer value="const unchanged = true;" language="typescript" />
    </LocaleProvider>,
  );
  await flush();
});
ok(defaultContainer.querySelector("pre.code.hljs") != null, "keeps the established viewer as the default seam");
ok(defaultContainer.querySelector(".code--lines") == null, "requires an explicit line-number opt-in");
ok(defaultContainer.querySelector(".code-block__copy") != null, "keeps copy available on default code blocks");
await act(async () => defaultRoot.unmount());

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
