import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { YellowCardWarningBadge } from "./YellowCardWarningBadge";

describe("YellowCardWarningBadge", () => {
  it("renderiza badge quando count = 1", () => {
    render(<YellowCardWarningBadge count={1} />);
    expect(screen.getByLabelText("1 cartão amarelo")).toBeInTheDocument();
  });

  it("não renderiza nada quando count = 0", () => {
    const { container } = render(<YellowCardWarningBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza nada quando count = 2 (já expulso)", () => {
    const { container } = render(<YellowCardWarningBadge count={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não renderiza nada quando count = undefined", () => {
    const { container } = render(<YellowCardWarningBadge count={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
