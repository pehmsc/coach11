"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CircleDot,
  Cone,
  Eye,
  EyeOff,
  LandPlot,
  Loader2,
  MousePointer2,
  MoveUpRight,
  Palette,
  RotateCcw,
  Shirt,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FIELD_VIEWBOX,
  type ArrowVariant,
  type DiagramElement,
  type ExerciseDiagram,
  type FieldPreset,
} from "@/types/editor";
import {
  canUndo,
  commitHistory,
  emptyDiagram,
  initHistory,
  newElementId,
  parseDiagram,
  undoHistory,
  type DiagramHistory,
} from "@/lib/editor/diagram";
import { exportDiagramPng } from "@/lib/editor/export";
import {
  clamp,
  distance,
  screenToSvgPoint,
  zoomViewBoxAround,
  type Point,
  type ViewBox,
} from "@/lib/editor/geometry";
import {
  ARROW_STROKE,
  ElementShape,
  PLAYER_R,
  ZONE_DEFAULT,
} from "./elements";
import { FIELD_PRESET_OPTIONS, FieldPresetLayer } from "./field-presets";

const BASE_W = FIELD_VIEWBOX.width;
const BASE_H = FIELD_VIEWBOX.height;
const FULL_VIEWBOX: ViewBox = { x: 0, y: 0, w: BASE_W, h: BASE_H };
const DRAG_THRESHOLD_PX = 5;
const HINTS_KEY = "coach11_editor_hints_seen";
const COLOR_SWATCHES = ["#4E7BFF", "#16A34A", "#DC2626", "#F59E0B", "#7C3AED", "#0F172A", "#FFFFFF"];

export type EditorExitAction = {
  key: string;
  label: string;
  icon?: typeof Check;
  primary?: boolean;
  run: (payload: { diagram: ExerciseDiagram; renderPng: () => Promise<Blob> }) => void | Promise<void>;
};

type ExerciseEditorProps = {
  open: boolean;
  initialDiagram?: ExerciseDiagram | null;
  title?: string;
  onClose: () => void;
  exitActions: EditorExitAction[];
  busy?: boolean;
};

type Tool =
  | { kind: "select" }
  | { kind: "player"; team: "home" | "away" }
  | { kind: "ball" }
  | { kind: "cone" }
  | { kind: "zone" }
  | { kind: "arrow"; variant: ArrowVariant }
  | { kind: "text" };

type Gesture =
  | { type: "none" }
  | {
      type: "element-drag";
      id: string;
      pointerId: number;
      startClient: Point;
      startSvg: Point;
      orig: DiagramElement;
      moved: boolean;
    }
  | {
      type: "element-resize";
      id: string;
      pointerId: number;
      startSvg: Point;
      orig: Extract<DiagramElement, { kind: "zone" }>;
    }
  | {
      type: "bg-draw";
      pointerId: number;
      tool: Tool;
      startClient: Point;
      startSvg: Point;
      curSvg: Point;
      moved: boolean;
    }
  | {
      type: "pinch";
      idA: number;
      idB: number;
      startDist: number;
      focus: Point;
      startViewBox: ViewBox;
    };

export function ExerciseEditor(props: ExerciseEditorProps) {
  if (!props.open) return null;
  return <EditorOverlay {...props} />;
}

function EditorOverlay({ initialDiagram, title, onClose, exitActions, busy }: ExerciseEditorProps) {
  const [history, setHistory] = useState<DiagramHistory>(() =>
    initHistory(parseDiagram(initialDiagram) ?? emptyDiagram()),
  );
  const diagram = history.present;

  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [openGroup, setOpenGroup] = useState<"player" | "arrow" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState<ViewBox>(FULL_VIEWBOX);
  const [showMarkings, setShowMarkings] = useState(true);
  const [showColors, setShowColors] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [running, setRunning] = useState(false);
  const [svgWidthPx, setSvgWidthPx] = useState(0);
  const [portrait, setPortrait] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(orientation: portrait)").matches;
  });
  const [showHints, setShowHints] = useState(() => {
    try {
      return localStorage.getItem(HINTS_KEY) !== "1";
    } catch {
      return false;
    }
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const elementRefs = useRef(new Map<string, SVGGElement | null>());
  const previewLineRef = useRef<SVGPathElement | null>(null);
  const previewRectRef = useRef<SVGRectElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ type: "none" });
  const rafId = useRef<number | null>(null);
  const pendingFn = useRef<(() => void) | null>(null);

  // ── Histórico ───────────────────────────────────────────────────────────
  const commit = useCallback((next: ExerciseDiagram) => {
    setHistory((h) => commitHistory(h, next));
  }, []);
  const replacePresent = useCallback((next: ExerciseDiagram) => {
    setHistory((h) => ({ ...h, present: { ...next, elements: next.elements.map((e) => ({ ...e })) } }));
  }, []);

  const dismissHints = useCallback(() => {
    setShowHints(false);
    try {
      localStorage.setItem(HINTS_KEY, "1");
    } catch {
      /* sem persistência — não crítico */
    }
  }, []);

  // ── Efeitos (sem setState no corpo: tudo via callbacks de eventos) ────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSvgWidthPx(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  // ── Geometria ─────────────────────────────────────────────────────────────
  const hitRadius = useMemo(() => {
    if (!svgWidthPx) return PLAYER_R + 2;
    return clamp((44 * viewBox.w) / svgWidthPx, PLAYER_R + 1, 9);
  }, [svgWidthPx, viewBox.w]);

  const svgPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return screenToSvgPoint(m, clientX, clientY);
  }, []);

  const scheduleApply = useCallback((fn: () => void) => {
    pendingFn.current = fn;
    if (rafId.current == null) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const f = pendingFn.current;
        pendingFn.current = null;
        f?.();
      });
    }
  }, []);

  const setElementRef = useCallback(
    (id: string) => (node: SVGGElement | null) => {
      if (node) elementRefs.current.set(id, node);
      else elementRefs.current.delete(id);
    },
    [],
  );

  // ── Criação de elementos ──────────────────────────────────────────────────
  const addElement = useCallback(
    (el: DiagramElement, select = true) => {
      commit({ ...diagram, elements: [...diagram.elements, el] });
      if (select) setSelectedId(el.id);
    },
    [commit, diagram],
  );

  const placeAt = useCallback(
    (t: Tool, p: Point) => {
      const x = clamp(p.x, 0, BASE_W);
      const y = clamp(p.y, 0, BASE_H);
      const id = newElementId();
      switch (t.kind) {
        case "player": {
          const count = diagram.elements.filter(
            (e) => e.kind === "player" && e.team === t.team,
          ).length;
          addElement({ id, kind: "player", team: t.team, x, y, label: String(count + 1) });
          break;
        }
        case "ball":
          addElement({ id, kind: "ball", x, y });
          break;
        case "cone":
          addElement({ id, kind: "cone", x, y });
          break;
        case "text":
          addElement({ id, kind: "text", x, y, text: "Texto" });
          break;
        case "zone":
          addElement({
            id,
            kind: "zone",
            x: clamp(x - ZONE_DEFAULT.w / 2, 0, BASE_W - ZONE_DEFAULT.w),
            y: clamp(y - ZONE_DEFAULT.h / 2, 0, BASE_H - ZONE_DEFAULT.h),
            w: ZONE_DEFAULT.w,
            h: ZONE_DEFAULT.h,
          });
          break;
        default:
          break;
      }
    },
    [addElement, diagram.elements],
  );

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const cancelTransientDom = useCallback(() => {
    // Reverte qualquer transform/preview aplicado por gestos em curso.
    elementRefs.current.forEach((node) => node?.removeAttribute("transform"));
    if (previewLineRef.current) previewLineRef.current.style.display = "none";
    if (previewRectRef.current) previewRectRef.current.style.display = "none";
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (showHints) dismissHints();
      const svg = svgRef.current;
      if (!svg) return;
      svg.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Dois pointers → pinch (cancela qualquer gesto de 1 dedo em curso).
      if (pointers.current.size >= 2) {
        const ids = Array.from(pointers.current.keys());
        const a = pointers.current.get(ids[0])!;
        const b = pointers.current.get(ids[1])!;
        cancelTransientDom();
        const mid = svgPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        gesture.current = {
          type: "pinch",
          idA: ids[0],
          idB: ids[1],
          startDist: distance(a.x, a.y, b.x, b.y),
          focus: mid,
          startViewBox: viewBox,
        };
        return;
      }

      const target = e.target as Element;
      const handleNode = target.closest("[data-handle]");
      const elNode = target.closest("[data-el-id]") as SVGGElement | null;
      const p = svgPoint(e.clientX, e.clientY);

      if (handleNode && selectedId) {
        const orig = diagram.elements.find((el) => el.id === selectedId);
        if (orig && orig.kind === "zone") {
          gesture.current = {
            type: "element-resize",
            id: selectedId,
            pointerId: e.pointerId,
            startSvg: p,
            orig,
          };
          return;
        }
      }

      if (elNode) {
        const id = elNode.getAttribute("data-el-id")!;
        const orig = diagram.elements.find((el) => el.id === id);
        if (orig) {
          gesture.current = {
            type: "element-drag",
            id,
            pointerId: e.pointerId,
            startClient: { x: e.clientX, y: e.clientY },
            startSvg: p,
            orig,
            moved: false,
          };
          return;
        }
      }

      // Fundo do campo.
      gesture.current = {
        type: "bg-draw",
        pointerId: e.pointerId,
        tool,
        startClient: { x: e.clientX, y: e.clientY },
        startSvg: p,
        curSvg: p,
        moved: false,
      };
    },
    [cancelTransientDom, diagram.elements, dismissHints, selectedId, showHints, svgPoint, tool, viewBox],
  );

  const applyDrag = useCallback(
    (g: Extract<Gesture, { type: "element-drag" }>, dx: number, dy: number) => {
      const node = elementRefs.current.get(g.id);
      if (node) node.setAttribute("transform", `translate(${dx} ${dy})`);
    },
    [],
  );

  const applyResize = useCallback(
    (g: Extract<Gesture, { type: "element-resize" }>, w: number, h: number) => {
      const node = elementRefs.current.get(g.id);
      if (!node) return;
      const rect = node.querySelector<SVGRectElement>('rect:not([data-handle])');
      if (rect) {
        rect.setAttribute("width", String(w));
        rect.setAttribute("height", String(h));
      }
      const handle = node.querySelector<SVGRectElement>('[data-handle]');
      if (handle) {
        handle.setAttribute("x", String(g.orig.x + w - hitRadius / 2));
        handle.setAttribute("y", String(g.orig.y + h - hitRadius / 2));
      }
    },
    [hitRadius],
  );

  const updatePreview = useCallback(
    (g: Extract<Gesture, { type: "bg-draw" }>) => {
      const { tool: t, startSvg, curSvg } = g;
      if (t.kind === "arrow" && previewLineRef.current) {
        previewLineRef.current.setAttribute(
          "d",
          `M ${startSvg.x} ${startSvg.y} L ${curSvg.x} ${curSvg.y}`,
        );
        previewLineRef.current.setAttribute(
          "stroke-dasharray",
          t.variant === "move" ? "2.4 1.6" : "",
        );
        previewLineRef.current.style.display = "";
      } else if (t.kind === "zone" && previewRectRef.current) {
        const x = Math.min(startSvg.x, curSvg.x);
        const y = Math.min(startSvg.y, curSvg.y);
        previewRectRef.current.setAttribute("x", String(x));
        previewRectRef.current.setAttribute("y", String(y));
        previewRectRef.current.setAttribute("width", String(Math.abs(curSvg.x - startSvg.x)));
        previewRectRef.current.setAttribute("height", String(Math.abs(curSvg.y - startSvg.y)));
        previewRectRef.current.style.display = "";
      }
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const g = gesture.current;
      if (g.type === "none") return;
      if (pointers.current.has(e.pointerId)) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (g.type === "pinch") {
        const a = pointers.current.get(g.idA);
        const b = pointers.current.get(g.idB);
        if (!a || !b) return;
        const dist = distance(a.x, a.y, b.x, b.y);
        const factor = g.startDist === 0 ? 1 : dist / g.startDist;
        const next = zoomViewBoxAround(g.startViewBox, g.focus.x, g.focus.y, factor, {
          baseW: BASE_W,
          baseH: BASE_H,
        });
        scheduleApply(() => {
          svgRef.current?.setAttribute("viewBox", `${next.x} ${next.y} ${next.w} ${next.h}`);
        });
        return;
      }

      const p = svgPoint(e.clientX, e.clientY);

      if (g.type === "element-drag") {
        const moved =
          g.moved ||
          distance(e.clientX, e.clientY, g.startClient.x, g.startClient.y) > DRAG_THRESHOLD_PX;
        if (moved) g.moved = true;
        const dx = p.x - g.startSvg.x;
        const dy = p.y - g.startSvg.y;
        scheduleApply(() => applyDrag(g, dx, dy));
        return;
      }

      if (g.type === "element-resize") {
        const w = clamp(g.orig.w + (p.x - g.startSvg.x), 4, BASE_W - g.orig.x);
        const h = clamp(g.orig.h + (p.y - g.startSvg.y), 4, BASE_H - g.orig.y);
        scheduleApply(() => applyResize(g, w, h));
        return;
      }

      if (g.type === "bg-draw") {
        g.curSvg = p;
        if (
          !g.moved &&
          distance(e.clientX, e.clientY, g.startClient.x, g.startClient.y) > DRAG_THRESHOLD_PX
        ) {
          g.moved = true;
        }
        if (g.moved) scheduleApply(() => updatePreview(g));
      }
    },
    [applyDrag, applyResize, scheduleApply, svgPoint, updatePreview],
  );

  const endPinch = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const vb = svg.getAttribute("viewBox");
    if (vb) {
      const [x, y, w, h] = vb.split(/\s+/).map(Number);
      setViewBox({ x, y, w, h });
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      svg?.releasePointerCapture?.(e.pointerId);
      pointers.current.delete(e.pointerId);
      const g = gesture.current;

      if (g.type === "pinch") {
        endPinch();
        gesture.current = { type: "none" };
        return;
      }

      if (g.type === "element-drag") {
        const node = elementRefs.current.get(g.id);
        node?.removeAttribute("transform");
        if (g.moved) {
          const p = svgPoint(e.clientX, e.clientY);
          const dx = p.x - g.startSvg.x;
          const dy = p.y - g.startSvg.y;
          const elements = diagram.elements.map((el) =>
            el.id === g.id ? shiftElement(el, dx, dy) : el,
          );
          commit({ ...diagram, elements });
        } else {
          setSelectedId(g.id);
        }
        gesture.current = { type: "none" };
        return;
      }

      if (g.type === "element-resize") {
        const p = svgPoint(e.clientX, e.clientY);
        const w = clamp(g.orig.w + (p.x - g.startSvg.x), 4, BASE_W - g.orig.x);
        const h = clamp(g.orig.h + (p.y - g.startSvg.y), 4, BASE_H - g.orig.y);
        const elements = diagram.elements.map((el) =>
          el.id === g.id && el.kind === "zone" ? { ...el, w, h } : el,
        );
        commit({ ...diagram, elements });
        gesture.current = { type: "none" };
        return;
      }

      if (g.type === "bg-draw") {
        cancelTransientDom();
        const p = svgPoint(e.clientX, e.clientY);
        if (!g.moved) {
          // Tap: colocar elemento (ferramentas de ponto/zona) ou deselecionar.
          if (g.tool.kind === "select") setSelectedId(null);
          else if (g.tool.kind !== "arrow") placeAt(g.tool, g.startSvg);
        } else if (g.tool.kind === "arrow") {
          if (distance(g.startSvg.x, g.startSvg.y, p.x, p.y) > 2) {
            addElement({
              id: newElementId(),
              kind: "arrow",
              variant: g.tool.variant,
              x1: g.startSvg.x,
              y1: g.startSvg.y,
              x2: p.x,
              y2: p.y,
            });
          }
        } else if (g.tool.kind === "zone") {
          const x = Math.min(g.startSvg.x, p.x);
          const y = Math.min(g.startSvg.y, p.y);
          const w = Math.abs(p.x - g.startSvg.x);
          const h = Math.abs(p.y - g.startSvg.y);
          if (w > 3 && h > 3) {
            addElement({ id: newElementId(), kind: "zone", x, y, w, h });
          }
        }
        gesture.current = { type: "none" };
      }
    },
    [addElement, cancelTransientDom, commit, diagram, endPinch, placeAt, svgPoint],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      svgRef.current?.releasePointerCapture?.(e.pointerId);
      pointers.current.delete(e.pointerId);
      cancelTransientDom();
      gesture.current = { type: "none" };
    },
    [cancelTransientDom],
  );

  // ── Ações da toolbar ───────────────────────────────────────────────────────
  const selectTool = useCallback((t: Tool, group: "player" | "arrow" | null = null) => {
    setTool(t);
    setOpenGroup((cur) => (group && cur !== group ? group : null));
    setShowColors(false);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((h) => undoHistory(h));
    setSelectedId(null);
  }, []);

  const handleClear = useCallback(() => {
    commit({ ...diagram, elements: [] });
    setSelectedId(null);
    setConfirmClear(false);
  }, [commit, diagram]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit({ ...diagram, elements: diagram.elements.filter((el) => el.id !== selectedId) });
    setSelectedId(null);
  }, [commit, diagram, selectedId]);

  const setColor = useCallback(
    (color: string) => {
      commit({ ...diagram, color });
      setShowColors(false);
    },
    [commit, diagram],
  );

  const setPreset = useCallback(
    (preset: FieldPreset) => {
      commit({ ...diagram, preset });
    },
    [commit, diagram],
  );

  const selectedElement = useMemo(
    () => diagram.elements.find((el) => el.id === selectedId) ?? null,
    [diagram.elements, selectedId],
  );

  const updateTextValue = useCallback(
    (text: string) => {
      if (!selectedElement || selectedElement.kind !== "text") return;
      replacePresent({
        ...diagram,
        elements: diagram.elements.map((el) =>
          el.id === selectedElement.id && el.kind === "text" ? { ...el, text } : el,
        ),
      });
    },
    [diagram, replacePresent, selectedElement],
  );

  const renderPng = useCallback(async (): Promise<Blob> => {
    const svg = svgRef.current;
    if (!svg) throw new Error("Editor sem SVG.");
    return exportDiagramPng(svg);
  }, []);

  const handleExitAction = useCallback(
    async (action: EditorExitAction) => {
      if (running || busy) return;
      setRunning(true);
      try {
        await action.run({ diagram, renderPng });
      } finally {
        setRunning(false);
      }
    },
    [busy, diagram, renderPng, running],
  );

  const busyState = running || Boolean(busy);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-900"
      style={{ overscrollBehavior: "contain" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2 text-white">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800"
          aria-label="Fechar editor"
        >
          <X size={20} />
        </button>
        <span className="flex-1 truncate text-sm font-medium">{title ?? "Editor de diagrama"}</span>
        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo(history)}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
          aria-label="Desfazer"
        >
          <Undo2 size={18} />
        </button>
        {confirmClear ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium"
            >
              Limpar tudo
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Não
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={diagram.elements.length === 0}
            className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
            aria-label="Limpar campo"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-slate-800">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">
          <ToolButton active={tool.kind === "select"} onClick={() => selectTool({ kind: "select" })} icon={MousePointer2} label="Selecionar" />
          <ToolButton
            active={tool.kind === "player"}
            onClick={() => selectTool({ kind: "player", team: "home" }, "player")}
            icon={Shirt}
            label="Jogador"
          />
          <ToolButton
            active={tool.kind === "arrow"}
            onClick={() => selectTool({ kind: "arrow", variant: "move" }, "arrow")}
            icon={MoveUpRight}
            label="Setas"
          />
          <ToolButton active={tool.kind === "ball"} onClick={() => selectTool({ kind: "ball" })} icon={CircleDot} label="Bola" />
          <ToolButton active={tool.kind === "cone"} onClick={() => selectTool({ kind: "cone" })} icon={Cone} label="Cone" />
          <ToolButton active={tool.kind === "zone"} onClick={() => selectTool({ kind: "zone" })} icon={Square} label="Zona" />
          <ToolButton active={tool.kind === "text"} onClick={() => selectTool({ kind: "text" })} icon={Type} label="Texto" />

          <div className="mx-1 h-6 w-px shrink-0 bg-slate-600" />

          <label className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-slate-200">
            <LandPlot size={16} />
            <select
              value={diagram.preset}
              onChange={(e) => setPreset(e.target.value as FieldPreset)}
              className="bg-slate-700 text-xs text-white rounded px-1 py-0.5 focus:outline-none"
            >
              {FIELD_PRESET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => { setShowColors((s) => !s); setOpenGroup(null); }}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-slate-200 hover:bg-slate-700"
            aria-label="Cor"
          >
            <Palette size={16} />
            <span className="h-3.5 w-3.5 rounded-full border border-white/40" style={{ background: diagram.color }} />
          </button>

          <ToolButton
            active={!showMarkings}
            onClick={() => setShowMarkings((s) => !s)}
            icon={showMarkings ? Eye : EyeOff}
            label="Marcações"
          />
        </div>

        {/* Popovers — fila compacta por baixo da toolbar */}
        {openGroup === "player" && (
          <PopoverRow>
            <ChipButton active={tool.kind === "player" && tool.team === "home"} onClick={() => selectTool({ kind: "player", team: "home" })}>
              <span className="h-3 w-3 rounded-full" style={{ background: "#2563EB" }} /> Casa
            </ChipButton>
            <ChipButton active={tool.kind === "player" && tool.team === "away"} onClick={() => selectTool({ kind: "player", team: "away" })}>
              <span className="h-3 w-3 rounded-full" style={{ background: "#DC2626" }} /> Fora
            </ChipButton>
          </PopoverRow>
        )}
        {openGroup === "arrow" && (
          <PopoverRow>
            <ChipButton active={tool.kind === "arrow" && tool.variant === "move"} onClick={() => selectTool({ kind: "arrow", variant: "move" })}>Movimento</ChipButton>
            <ChipButton active={tool.kind === "arrow" && tool.variant === "pass"} onClick={() => selectTool({ kind: "arrow", variant: "pass" })}>Passe</ChipButton>
            <ChipButton active={tool.kind === "arrow" && tool.variant === "dribble"} onClick={() => selectTool({ kind: "arrow", variant: "dribble" })}>Condução</ChipButton>
          </PopoverRow>
        )}
        {showColors && (
          <PopoverRow>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full border-2"
                style={{ background: c, borderColor: diagram.color === c ? "#fff" : "transparent" }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </PopoverRow>
        )}
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden bg-slate-950 p-2">
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full touch-none select-none"
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <FieldPresetLayer preset={diagram.preset} showMarkings={showMarkings} />

          {diagram.elements.map((el) => (
            <g key={el.id} data-el-id={el.id} ref={setElementRef(el.id)}>
              <ElementShape el={el} color={diagram.color} />
              {selectedId === el.id && <SelectionOutline el={el} />}
              {/* Alvo de hit ≥44px (transparente, ignorado no export) */}
              <HitTarget el={el} radius={hitRadius} />
              {selectedId === el.id && el.kind === "zone" && (
                <rect
                  data-handle="resize"
                  data-export-ignore
                  x={el.x + el.w - hitRadius / 2}
                  y={el.y + el.h - hitRadius / 2}
                  width={hitRadius}
                  height={hitRadius}
                  fill="#10b981"
                  fillOpacity={0.9}
                  rx={0.6}
                />
              )}
            </g>
          ))}

          {/* Previews de desenho */}
          <path
            ref={previewLineRef}
            data-export-ignore
            fill="none"
            stroke={diagram.color}
            strokeWidth={ARROW_STROKE}
            strokeLinecap="round"
            style={{ display: "none" }}
          />
          <rect
            ref={previewRectRef}
            data-export-ignore
            fill={diagram.color}
            fillOpacity={0.18}
            stroke={diagram.color}
            strokeWidth={0.5}
            strokeDasharray="2 1.4"
            style={{ display: "none" }}
          />
        </svg>

        {/* Chips pedagógicos (1ª utilização) */}
        {showHints && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center gap-2 text-[11px] text-white">
            <span className="rounded-full bg-black/60 px-2.5 py-1">1 dedo · mover</span>
            <span className="rounded-full bg-black/60 px-2.5 py-1">2 dedos · zoom</span>
          </div>
        )}

        {/* Sugestão de landscape */}
        {portrait && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/85 text-center text-white">
            <RotateCcw size={40} className="animate-pulse text-emerald-400" />
            <p className="px-8 text-sm">Roda o telemóvel para teres mais espaço para desenhar.</p>
            <button
              type="button"
              onClick={() => setPortrait(false)}
              className="rounded-md border border-slate-500 px-3 py-1.5 text-xs"
            >
              Continuar assim
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 bg-slate-900 px-3 py-2">
        {selectedElement && (
          <div className="mb-2 flex items-center gap-2">
            {selectedElement.kind === "text" ? (
              <input
                value={selectedElement.text}
                onChange={(e) => updateTextValue(e.target.value)}
                placeholder="Texto da etiqueta"
                className="flex-1 rounded-md bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
            ) : (
              <span className="flex-1 text-xs text-slate-400">Elemento selecionado</span>
            )}
            <button
              type="button"
              onClick={deleteSelected}
              className="rounded-md bg-slate-800 px-2 py-1.5 text-xs text-red-400 hover:bg-slate-700"
            >
              <Trash2 size={14} className="mr-1 inline" /> Remover
            </button>
          </div>
        )}
        <div className="flex gap-2">
          {exitActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.key}
                type="button"
                onClick={() => handleExitAction(action)}
                disabled={busyState}
                variant={action.primary ? "default" : "outline"}
                className={`flex-1 ${action.primary ? "bg-emerald-600 hover:bg-emerald-700" : "border-slate-600 bg-slate-800 text-white hover:bg-slate-700"}`}
              >
                {busyState ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : Icon ? (
                  <Icon size={16} className="mr-2" />
                ) : null}
                {action.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function ToolButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Check;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex shrink-0 flex-col items-center justify-center rounded-md px-2 py-1 text-[10px] ${
        active ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-700"
      }`}
    >
      <Icon size={18} />
    </button>
  );
}

function PopoverRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-700 px-3 py-2">{children}</div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
        active ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function HitTarget({ el, radius }: { el: DiagramElement; radius: number }) {
  const common = { "data-export-ignore": true, fill: "transparent" } as const;
  if (el.kind === "zone") {
    return <rect {...common} x={el.x} y={el.y} width={el.w} height={el.h} />;
  }
  if (el.kind === "arrow") {
    return (
      <path
        {...common}
        d={`M ${el.x1} ${el.y1} L ${el.x2} ${el.y2}`}
        stroke="transparent"
        strokeWidth={Math.max(radius, 4)}
        strokeLinecap="round"
      />
    );
  }
  return <circle {...common} cx={el.x} cy={el.y} r={radius} />;
}

function SelectionOutline({ el }: { el: DiagramElement }) {
  const stroke = "#10b981";
  if (el.kind === "zone") {
    return (
      <rect
        x={el.x}
        y={el.y}
        width={el.w}
        height={el.h}
        fill="none"
        stroke={stroke}
        strokeWidth={0.6}
        strokeDasharray="1.6 1.2"
        data-export-ignore
      />
    );
  }
  if (el.kind === "arrow") {
    return (
      <g data-export-ignore fill={stroke}>
        <circle cx={el.x1} cy={el.y1} r={1.1} />
        <circle cx={el.x2} cy={el.y2} r={1.1} />
      </g>
    );
  }
  return (
    <circle
      cx={el.x}
      cy={el.y}
      r={PLAYER_R + 1.4}
      fill="none"
      stroke={stroke}
      strokeWidth={0.5}
      strokeDasharray="1.4 1"
      data-export-ignore
    />
  );
}

function shiftElement(el: DiagramElement, dx: number, dy: number): DiagramElement {
  switch (el.kind) {
    case "arrow":
      return {
        ...el,
        x1: clamp(el.x1 + dx, 0, BASE_W),
        y1: clamp(el.y1 + dy, 0, BASE_H),
        x2: clamp(el.x2 + dx, 0, BASE_W),
        y2: clamp(el.y2 + dy, 0, BASE_H),
      };
    case "zone":
      return {
        ...el,
        x: clamp(el.x + dx, 0, BASE_W - el.w),
        y: clamp(el.y + dy, 0, BASE_H - el.h),
      };
    default:
      return { ...el, x: clamp(el.x + dx, 0, BASE_W), y: clamp(el.y + dy, 0, BASE_H) };
  }
}
