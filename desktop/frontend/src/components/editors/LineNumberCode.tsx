import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { EditorProps } from "../CodeViewer";
import { highlightToHtml } from "../../lib/highlight";
import { CopyButton } from "../CopyButton";

// Line-numbered code viewer with virtual scroll and viewer-scoped search.
const VIRTUAL_THRESHOLD = 100;
const ROW_HEIGHT_ESTIMATE = 22;
const OVERSCAN = 15;
const WORD_CHARACTER_RE = /[\p{L}\p{N}_]/u;

export interface CodeSearchMatch {
  lineIndex: number;
  start: number;
  end: number;
  absoluteStart: number;
  absoluteEnd: number;
}

export function findCodeMatches(
  value: string,
  query: string,
  caseSensitive = false,
  wholeWord = false,
): CodeSearchMatch[] {
  if (!query) return [];

  const matches: CodeSearchMatch[] = [];
  const lines = value.split("\n");
  const pattern = new RegExp(escapeRegex(query), caseSensitive ? "gu" : "giu");
  let absoluteOffset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const startsInsideWord = start > 0 && isWordCharacter(codePointBefore(line, start));
      const endsInsideWord = end < line.length && isWordCharacter(codePointAt(line, end));
      if (!wholeWord || (!startsInsideWord && !endsInsideWord)) {
        matches.push({
          lineIndex,
          start,
          end,
          absoluteStart: absoluteOffset + start,
          absoluteEnd: absoluteOffset + end,
        });
      }
      // The query is non-empty, but keep the loop safe if regex behavior ever
      // changes around an unusual Unicode sequence.
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
    absoluteOffset += line.length + 1;
  }

  return matches;
}

// Insert mark elements by source offset rather than replacing serialized HTML
// text. highlight.js escapes &, <, >, and quotes, so direct replacement can
// either miss the source character or split an entity such as &amp;.
export function highlightCodeMatches(
  highlightedHtml: string,
  matches: CodeSearchMatch[],
  currentMatchIndex: number,
): string {
  if (matches.length === 0) return highlightedHtml;

  let htmlOffset = 0;
  let sourceOffset = 0;
  let matchIndex = 0;
  let markOpen = false;
  let result = "";

  const openMark = () => (
    matchIndex === currentMatchIndex
      ? '<mark class="code-search-hl code-search-hl--current">'
      : '<mark class="code-search-hl">'
  );

  while (htmlOffset < highlightedHtml.length) {
    const char = highlightedHtml[htmlOffset];
    if (char === "<") {
      const tagEnd = highlightedHtml.indexOf(">", htmlOffset);
      if (tagEnd === -1) {
        result += highlightedHtml.slice(htmlOffset);
        break;
      }
      const tag = highlightedHtml.slice(htmlOffset, tagEnd + 1);
      if (markOpen) result += "</mark>";
      result += tag;
      if (markOpen) result += openMark();
      htmlOffset = tagEnd + 1;
      continue;
    }

    if (!markOpen && matches[matchIndex]?.absoluteStart === sourceOffset) {
      markOpen = true;
      result += openMark();
    }

    let token: string;
    let sourceLength: number;
    if (char === "&") {
      const entityEnd = highlightedHtml.indexOf(";", htmlOffset);
      if (entityEnd !== -1) {
        token = highlightedHtml.slice(htmlOffset, entityEnd + 1);
        sourceLength = decodedEntityLength(token);
      } else {
        token = char;
        sourceLength = 1;
      }
    } else {
      const codePoint = highlightedHtml.codePointAt(htmlOffset) ?? 0;
      sourceLength = codePoint > 0xffff ? 2 : 1;
      token = highlightedHtml.slice(htmlOffset, htmlOffset + sourceLength);
    }

    result += token;
    htmlOffset += token.length;
    sourceOffset += sourceLength;

    if (markOpen && matches[matchIndex]?.absoluteEnd === sourceOffset) {
      result += "</mark>";
      markOpen = false;
      matchIndex += 1;
    }
  }

  if (markOpen) result += "</mark>";
  return result;
}

// A multiline highlight.js span may cross a newline. Each virtual row needs
// valid standalone HTML, so close active tags at the boundary and reopen the
// same stack on the next line.
export function splitHighlightedCodeLines(html: string): string[] {
  const lines: string[] = [];
  const openTags: string[] = [];
  let current = "";
  let offset = 0;

  while (offset < html.length) {
    if (html[offset] === "\n") {
      current += closeTags(openTags);
      lines.push(current);
      current = openTags.join("");
      offset += 1;
      continue;
    }
    if (html[offset] === "<") {
      const tagEnd = html.indexOf(">", offset);
      if (tagEnd !== -1) {
        const tag = html.slice(offset, tagEnd + 1);
        current += tag;
        if (/^<(span|mark)\b/.test(tag)) {
          openTags.push(tag);
        } else if (/^<\/(span|mark)>$/.test(tag)) {
          openTags.pop();
        }
        offset = tagEnd + 1;
        continue;
      }
    }
    const codePoint = html.codePointAt(offset) ?? 0;
    const length = codePoint > 0xffff ? 2 : 1;
    current += html.slice(offset, offset + length);
    offset += length;
  }

  current += closeTags(openTags);
  lines.push(current);
  return lines;
}

export default function LineNumberCode({
  value,
  language,
  showLineNumbers,
  maxHeight,
}: EditorProps) {
  const lines = useMemo(() => value.split("\n"), [value]);
  const highlightedHtml = useMemo(() => highlightToHtml(value, language), [value, language]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => findCodeMatches(value, query, caseSensitive, wholeWord),
    [value, query, caseSensitive, wholeWord],
  );
  const totalMatches = matches.length;
  const activeMatchIndex = totalMatches > 0 ? currentMatchIdx % totalMatches : 0;
  const matchingLines = useMemo(
    () => new Set(matches.map((match) => match.lineIndex)),
    [matches],
  );
  const lineHtmls = useMemo(
    () => splitHighlightedCodeLines(
      highlightCodeMatches(highlightedHtml, matches, activeMatchIndex),
    ),
    [highlightedHtml, matches, activeMatchIndex],
  );

  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [query, caseSensitive, wholeWord]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isVirtual = showLineNumbers !== false && lines.length > VIRTUAL_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: isVirtual ? lines.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: OVERSCAN,
  });

  const scrollToLine = useCallback(
    (index: number) => {
      if (!scrollRef.current) return;
      if (isVirtual) {
        virtualizer.scrollToIndex(index, { align: "center" });
      } else {
        scrollRef.current.scrollTo({
          top: index * ROW_HEIGHT_ESTIMATE - scrollRef.current.clientHeight / 2,
          behavior: "smooth",
        });
      }
    },
    [isVirtual, virtualizer],
  );

  const jumpToMatch = useCallback(
    (direction: 1 | -1) => {
      if (totalMatches === 0) return;
      const nextIndex = direction === 1
        ? (activeMatchIndex + 1) % totalMatches
        : (activeMatchIndex - 1 + totalMatches) % totalMatches;
      setCurrentMatchIdx(nextIndex);
      const lineIndex = matches[nextIndex]?.lineIndex;
      if (lineIndex != null) scrollToLine(lineIndex);
    },
    [activeMatchIndex, matches, scrollToLine, totalMatches],
  );

  const lineNoWidth = String(lines.length).length;
  const renderRow = (index: number) => {
    const lineNo = index + 1;
    const isCurrent = query && matches[activeMatchIndex]?.lineIndex === index;
    const isDimmed = query && !matchingLines.has(index);
    return (
      <div
        key={index}
        className={`code-line-row${isCurrent ? " code-line-row--current" : ""}${isDimmed ? " code-line-row--dim" : ""}`}
      >
        {showLineNumbers !== false && (
          <span
            className="code-line-ln"
            style={{ minWidth: `${lineNoWidth + 2}ch` }}
            aria-label={`line ${lineNo}`}
          >
            {lineNo}
          </span>
        )}
        <code
          className="code-line-text"
          dangerouslySetInnerHTML={{ __html: lineHtmls[index] || " " }}
        />
      </div>
    );
  };

  return (
    <div className="code-block__wrap">
      {searchOpen && (
        <div className="code-search">
          <input
            ref={inputRef}
            type="text"
            className="code-search__input"
            placeholder="Find"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                jumpToMatch(event.shiftKey ? -1 : 1);
              } else if (event.key === "Escape") {
                setSearchOpen(false);
                setQuery("");
              }
            }}
          />

          {query && (
            <span className="code-search__count">
              {totalMatches > 0 ? activeMatchIndex + 1 : 0} of {totalMatches}
            </span>
          )}

          {query && totalMatches > 0 && (
            <>
              <button
                className="code-search__nav"
                onClick={() => jumpToMatch(-1)}
                aria-label="Previous match"
                title="Previous match"
                type="button"
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2L2 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button
                className="code-search__nav"
                onClick={() => jumpToMatch(1)}
                aria-label="Next match"
                title="Next match"
                type="button"
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </>
          )}

          <button
            className={`code-search__toggle${caseSensitive ? " code-search__toggle--on" : ""}`}
            onClick={() => setCaseSensitive((enabled) => !enabled)}
            aria-label="Match case"
            title="Match case"
            type="button"
          >
            Aa
          </button>
          <button
            className={`code-search__toggle${wholeWord ? " code-search__toggle--on" : ""}`}
            onClick={() => setWholeWord((enabled) => !enabled)}
            aria-label="Match whole word"
            title="Match whole word"
            type="button"
          >
            ab
          </button>
          <button
            className="code-search__close"
            onClick={() => {
              setSearchOpen(false);
              setQuery("");
            }}
            aria-label="Close search"
            type="button"
          >
            ✕
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="code hljs code--lines"
        data-lang={language}
        tabIndex={0}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
            event.preventDefault();
            event.stopPropagation();
            setSearchOpen(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          } else if (event.key === "Escape" && searchOpen) {
            setSearchOpen(false);
            setQuery("");
          }
        }}
        style={{
          maxHeight: maxHeight ?? undefined,
          overflow: maxHeight != null || isVirtual ? "auto" : undefined,
        }}
      >
        {isVirtual ? (
          <div
            className="code-lines-wrap"
            style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((row) => (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                }}
              >
                {renderRow(row.index)}
              </div>
            ))}
          </div>
        ) : (
          <div className="code-lines-wrap">
            {lines.map((_, index) => renderRow(index))}
          </div>
        )}
      </div>
      <CopyButton text={value} className="code-block__copy" />
    </div>
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordCharacter(value: string): boolean {
  return value !== "" && WORD_CHARACTER_RE.test(value);
}

function codePointBefore(value: string, offset: number): string {
  const codePoints = Array.from(value.slice(0, offset));
  return codePoints[codePoints.length - 1] ?? "";
}

function codePointAt(value: string, offset: number): string {
  return Array.from(value.slice(offset))[0] ?? "";
}

function decodedEntityLength(entity: string): number {
  const body = entity.slice(1, -1).toLowerCase();
  if (["amp", "lt", "gt", "quot", "apos", "#39", "#x27"].includes(body)) return 1;
  const numeric = body.startsWith("#x")
    ? Number.parseInt(body.slice(2), 16)
    : body.startsWith("#")
      ? Number.parseInt(body.slice(1), 10)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff
    ? String.fromCodePoint(numeric).length
    : entity.length;
}

function closeTags(openTags: string[]): string {
  return [...openTags]
    .reverse()
    .map((tag) => tag.startsWith("<mark") ? "</mark>" : "</span>")
    .join("");
}
