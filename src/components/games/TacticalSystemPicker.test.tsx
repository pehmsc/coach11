import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TacticalSystemPicker } from "./TacticalSystemPicker";

function StatefulWrapper({
  initialValue,
  footballFormat,
  onChange,
}: {
  initialValue: string;
  footballFormat: string | null;
  onChange?: (next: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <TacticalSystemPicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      footballFormat={footballFormat}
    />
  );
}

describe("TacticalSystemPicker", () => {
  it("mostra dropdown com sugestoes F9 + Outro quando footballFormat='9'", () => {
    render(
      <TacticalSystemPicker
        value=""
        onChange={() => {}}
        footballFormat="9"
      />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((opt) => opt.label);
    expect(optionLabels).toContain("1-3-3-2");
    expect(optionLabels).toContain("1-4-3-1");
    expect(optionLabels).toContain("Outro");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("mostra input livre quando footballFormat e null", () => {
    render(
      <TacticalSystemPicker
        value=""
        onChange={() => {}}
        footballFormat={null}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("alterna para modo Outro ao seleccionar 'Outro' e mostra input livre", () => {
    const onChange = vi.fn();
    render(
      <TacticalSystemPicker
        value=""
        onChange={onChange}
        footballFormat="9"
      />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "__other__" } });

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserva valor anterior ao alternar para modo Outro", () => {
    const onChange = vi.fn();
    render(
      <TacticalSystemPicker
        value="1-3-3-2"
        onChange={onChange}
        footballFormat="9"
      />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "__other__" } });

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("1-3-3-2");
  });

  it("escolher sistema sugerido sai de modo Outro", () => {
    const onChange = vi.fn();
    render(
      <StatefulWrapper
        initialValue="1-4-3-3"
        footballFormat="9"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1-3-3-2" } });

    expect(onChange).toHaveBeenLastCalledWith("1-3-3-2");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("activa automaticamente modo Outro quando value nao esta nas sugestoes", () => {
    render(
      <TacticalSystemPicker
        value="1-4-3-3"
        onChange={() => {}}
        footballFormat="9"
      />,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("1-4-3-3");
  });

  it("chama onChange com texto livre ao escrever no input", () => {
    const onChange = vi.fn();
    render(
      <TacticalSystemPicker
        value="1-4-3-3"
        onChange={onChange}
        footballFormat="9"
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1-4-2-3-1" } });
    expect(onChange).toHaveBeenLastCalledWith("1-4-2-3-1");
  });

  it("chama onChange com sistema F9 ao seleccionar do dropdown", () => {
    const onChange = vi.fn();
    render(
      <TacticalSystemPicker
        value=""
        onChange={onChange}
        footballFormat="9"
      />,
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "1-3-3-2" } });
    expect(onChange).toHaveBeenLastCalledWith("1-3-3-2");
  });
});
