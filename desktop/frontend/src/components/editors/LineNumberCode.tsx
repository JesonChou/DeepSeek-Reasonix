import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { EditorProps } from "../CodeViewer";
import { highlightToHtml } from "../../lib/highlight";

// ── Line-numbered code viewer with virtual scroll and search ──────────────
// Renders large files smoothly by virtualising rows (>100 lines), adding a
// line-number gutter and a Ctrl+F search bar with match navigation,
// case-sensitivity, and whole-word toggles (Codex-style).

const VIRTUAL_THRESHOLD = 100;
const ROW_HEIGHT_ESTIMATE = 22;
const OVERSCAN = 15;

export default function LineNumberCode({
  value,
  language,
  showLineNumbers,
  maxHeight,
}: EditorProps) {
  const lines = useMemo(() => value.split("\n"), [value]);
  const baseHtmls = useMemo(
    () => lines.map((line) => highlightToHtml(line, language)),
    [lines, language],
  );

  // ── search state ────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedMatches = useMemo(() => {
    if (!query) return [] as number[];
    const wordRe = wholeWord
      ? new RegExp(`\\b${escapeRegex(query)}\\b`, caseSensitive ? "g" : "gi")
      : new RegExp(escapeRegex(query), caseSensitive ? "g" : "gi");
    const matches: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (wordRe.test(lines[i])) matches.push(i);
    }
    return matches;
  }, [lines, query, caseSensitive, wholeWord]);

  // Inline highlight: wrap matched text in <mark> tags inside the already-
  // syntax-highlighted HTML, splitting on tags so we never corrupt them.
  const lineHtmls = useMemo(() => {
    if (!query) return baseHtmls;
    const re = new RegExp(
      wholeWord ? `\\b${escapeRegex(query)}\\b` : escapeRegex(query),
      caseSensitive ? "g" : "gi",
    );
    return baseHtmls.map((html, i) => {
      if (!sortedMatches.includes(i)) return html;
      // Split on HTML tags: text segments (even indices) get <mark> treatment.
      const parts = html.split(/(<[^>]*>)/g);
      return parts
        .map((seg, j) => {
          if (j % 2 === 1) return seg; // HTML tag — leave untouched
          return seg.replace(
            re,
            '<mark class="code-search-hl">$&</mark>',
          );
        })
        .join("");
    });
  }, [baseHtmls, query, caseSensitive, wholeWord, sortedMatches]);

  const totalMatches = sortedMatches.length;

  // Reset current match when query or toggles change.
  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [query, caseSensitive, wholeWord]);

  // Ctrl+F / Cmd+F → open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  // ── virtual scroll ──────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const isVirtual = showLineNumbers !== false && lines.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: isVirtual ? lines.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: OVERSCAN,
  });

  // Scroll so the line at `index` is centred in the viewport.
  const scrollToLine = useCallback(
    (index: number) => {
      if (!scrollRef.current) return;
      if (isVirtual) {
        virtualizer.scrollToIndex(index, { align: "center" });
      } else {
        scrollRef.current.scrollTo({
          top: index * ROW_HEIGHT_ESTIMATE - (scrollRef.current.clientHeight ?? 300) / 2,
          behavior: "smooth",
        });
      }
    },
    [isVirtual, virtualizer],
  );

  // Jump to next / previous match
  const jumpToMatch = useCallback(
    (dir: 1 | -1) => {
      if (totalMatches === 0) return;
      const nextIdx =
        dir === 1
          ? (currentMatchIdx + 1) % totalMatches
          : (currentMatchIdx - 1 + totalMatches) % totalMatches;
      setCurrentMatchIdx(nextIdx);
      const lineIdx = sortedMatches[nextIdx];
      if (lineIdx !== undefined) scrollToLine(lineIdx);
    },
    [currentMatchIdx, totalMatches, sortedMatches, scrollToLine],
  );

  const lineNoWidth = String(lines.length).length;

  const renderRow = (i: number) => {
    const lineNo = i + 1;
    const isCurrent = query && sortedMatches[currentMatchIdx] === i;
    const isDimmed = query && !sortedMatches.includes(i);
    return (
      <div
        key={i}
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
          dangerouslySetInnerHTML={{ __html: lineHtmls[i] || " " }}
        />
      </div>
    );
  };

  return (
    <div className="code-block__wrap">
      {/* search bar — Codex-style: input + "N of M" + nav arrows + toggles + close */}
      {searchOpen && (
        <div className="code-search">
          <input
            ref={inputRef}
            type="text"
            className="code-search__input"
            placeholder="Find"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                jumpToMatch(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") {
                setSearchOpen(false);
                setQuery("");
              }
            }}
          />

          {query && (
            <span className="code-search__count">
              {totalMatches > 0 ? currentMatchIdx + 1 : 0} of {totalMatches}
            </span>
          )}

          {query && totalMatches > 0 && (
            <>
              <button
                className="code-search__nav"
                onClick={() => jumpToMatch(-1)}
                aria-label="Previous match"
                title="Previous match"
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2L2 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button
                className="code-search__nav"
                onClick={() => jumpToMatch(1)}
                aria-label="Next match"
                title="Next match"
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </>
          )}

          <button
            className={`code-search__toggle${caseSensitive ? " code-search__toggle--on" : ""}`}
            onClick={() => setCaseSensitive((v) => !v)}
            aria-label="Match case"
            title="Match case"
          >
            Aa
          </button>
          <button
            className={`code-search__toggle${wholeWord ? " code-search__toggle--on" : ""}`}
            onClick={() => setWholeWord((v) => !v)}
            aria-label="Match whole word"
            title="Match whole word"
          >
            ab
          </button>

          <button
            className="code-search__close"
            onClick={() => { setSearchOpen(false); setQuery(""); }}
            aria-label="Close search"
          >
            ✕
          </button>
        </div>
      )}

      {/* code area */}
      <div
        ref={scrollRef}
        className="code hljs code--lines"
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
            {lines.map((_, i) => renderRow(i))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Escape special regex characters in user input. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
