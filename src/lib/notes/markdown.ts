const BLANK_LINE_REGEX = /^\s*$/;
const UNORDERED_LIST_REGEX = /^\s*[-*]\s+(.+)$/;
const DECIMAL_LIST_REGEX = /^\s*(\d+)[.)]\s+(.+)$/;
const ALPHA_LOWER_LIST_REGEX = /^\s*([a-z])[.)]\s+(.+)$/;
const ALPHA_UPPER_LIST_REGEX = /^\s*([A-Z])[.)]\s+(.+)$/;

type ParagraphBlock = {
  type: "paragraph";
  lines: string[];
};

type ListBlock = {
  type: "list";
  ordered: boolean;
  marker: "1" | "a" | "A";
  items: string[];
};

type NotesBlock = ParagraphBlock | ListBlock;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(value: string) {
  const escaped = escapeHtml(value);

  return escaped
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

function getListMatch(line: string) {
  const unorderedMatch = line.match(UNORDERED_LIST_REGEX);
  if (unorderedMatch) {
    return {
      ordered: false,
      marker: "1" as const,
      content: unorderedMatch[1],
    };
  }

  const decimalMatch = line.match(DECIMAL_LIST_REGEX);
  if (decimalMatch) {
    return {
      ordered: true,
      marker: "1" as const,
      content: decimalMatch[2],
    };
  }

  const alphaLowerMatch = line.match(ALPHA_LOWER_LIST_REGEX);
  if (alphaLowerMatch) {
    return {
      ordered: true,
      marker: "a" as const,
      content: alphaLowerMatch[2],
    };
  }

  const alphaUpperMatch = line.match(ALPHA_UPPER_LIST_REGEX);
  if (alphaUpperMatch) {
    return {
      ordered: true,
      marker: "A" as const,
      content: alphaUpperMatch[2],
    };
  }

  return null;
}

function flushParagraph(blocks: NotesBlock[], lines: string[]) {
  if (lines.length === 0) return;
  blocks.push({
    type: "paragraph",
    lines: [...lines],
  });
  lines.length = 0;
}

function flushList(
  blocks: NotesBlock[],
  items: string[],
  ordered: boolean,
  marker: "1" | "a" | "A",
) {
  if (items.length === 0) return;
  blocks.push({
    type: "list",
    ordered,
    marker,
    items: [...items],
  });
  items.length = 0;
}

function buildBlocks(source: string) {
  const normalizedSource = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalizedSource.split("\n");
  const blocks: NotesBlock[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];

  let currentListOrdered = false;
  let currentListMarker: "1" | "a" | "A" = "1";

  for (const rawLine of lines) {
    if (BLANK_LINE_REGEX.test(rawLine)) {
      flushParagraph(blocks, paragraphLines);
      flushList(blocks, listItems, currentListOrdered, currentListMarker);
      currentListOrdered = false;
      currentListMarker = "1";
      continue;
    }

    const listMatch = getListMatch(rawLine);
    if (listMatch) {
      flushParagraph(blocks, paragraphLines);
      const sameListType =
        listItems.length > 0 &&
        currentListOrdered === listMatch.ordered &&
        currentListMarker === listMatch.marker;
      if (!sameListType) {
        flushList(blocks, listItems, currentListOrdered, currentListMarker);
        currentListOrdered = listMatch.ordered;
        currentListMarker = listMatch.marker;
      }
      listItems.push(listMatch.content);
      continue;
    }

    flushList(blocks, listItems, currentListOrdered, currentListMarker);
    currentListOrdered = false;
    currentListMarker = "1";
    paragraphLines.push(rawLine.trimEnd());
  }

  flushParagraph(blocks, paragraphLines);
  flushList(blocks, listItems, currentListOrdered, currentListMarker);

  return blocks;
}

export function renderNotesToHtml(value: string | null | undefined) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  if (!normalizedValue) return "";

  const blocks = buildBlocks(normalizedValue);

  return blocks
    .map((block) => {
      if (block.type === "paragraph") {
        return `<p>${block.lines.map(renderInlineMarkdown).join("<br />")}</p>`;
      }

      const tag = block.ordered ? "ol" : "ul";
      const typeAttr =
        block.ordered && block.marker !== "1" ? ` type="${block.marker}"` : "";
      const items = block.items
        .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
        .join("");

      return `<${tag}${typeAttr}>${items}</${tag}>`;
    })
    .join("");
}
