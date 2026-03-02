import { describe, expect, it } from "vitest";
import { renderNotesToHtml } from "./markdown";

describe("renderNotesToHtml", () => {
  it("preserves line breaks inside paragraphs", () => {
    expect(renderNotesToHtml("Linha 1\nLinha 2")).toBe(
      "<p>Linha 1<br />Linha 2</p>",
    );
  });

  it("renders unordered and ordered lists", () => {
    expect(
      renderNotesToHtml("- Camisola branca\n- Chuteiras\n\n1. Aquecimento\n2. Jogo"),
    ).toBe(
      "<ul><li>Camisola branca</li><li>Chuteiras</li></ul><ol><li>Aquecimento</li><li>Jogo</li></ol>",
    );
  });

  it("renders alpha lists and inline emphasis safely", () => {
    expect(
      renderNotesToHtml("a. **Negrito**\nb. *Itálico*\n\n<script>alert(1)</script>"),
    ).toBe(
      '<ol type="a"><li><strong>Negrito</strong></li><li><em>Itálico</em></li></ol><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });
});
