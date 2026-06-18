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
  Magnet,
  Maximize,
  Minimize,
  MousePointer2,
  MoveUpRight,
  Palette,
  RotateCw,
  Shirt,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
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
  type Point,
  type ViewBox,
} from "@/lib/editor/geometry";
import { ARROW_STROKE, ElementShape, PLAYER_R, ZONE_DEFAULT } from "./elements";
import { FIELD_PRESET_OPTIONS, FieldPresetLayer } from "./field-presets";

const BASE_W = FIELD_VIEWBOX.width;
const BASE_H = FIELD_VIEWBOX.height;
const DRAG_THRESHOLD_PX = 5;
const SNAP_DIST = 1.5; // unidades de viewBox
const POPOVER_W = 224;
const HINTS_KEY = "coach11_editor_hints_seen";
const COLOR_SWATCHES = ["#4E7BFF", "#16A34A", "#DC2626", "#F59E0B", "#7C3AED", "#0F172A", "#FFFFFF"];
const ARROW_OPTIONS: { value: ArrowVariant; label: string }[] = [
  { value: "move", label: "Movimento" },
  { value: "pass", label: "Passe" },
  { value: "dribble", label: "Condução" },
];

// Vendor-prefixos de Fullscreen (Safari) — tipados, sem `any`.
type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };

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
  | { kind: "player" }
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
      fit: ViewBox;
    };

type SnapResult = { snapX: number | null; snapY: number | null };

// Zoom (pinch) relativo ao viewBox base da orientação, preservando o aspect e
// limitado a esse frame. Inline aqui — não toca em geometry.ts.
function zoomWithinFit(
  startVB: ViewBox,
  fit: ViewBox,
  focusX: number,
  focusY: number,
  factor: number,
  maxScale = 4,
): ViewBox {
  const minW = fit.w / maxScale;
  const newW = clamp(startVB.w / factor, minW, fit.w);
  const scale = startVB.w === 0 ? 1 : newW / startVB.w;
  const newH = startVB.h * scale;
  const fx = startVB.w === 0 ? 0.5 : (focusX - startVB.x) / startVB.w;
  const fy = startVB.h === 0 ? 0.5 : (focusY - startVB.y) / startVB.h;
  const x = clamp(focusX - fx * newW, fit.x, fit.x + fit.w - newW);
  const y = clamp(focusY - fy * newH, fit.y, fit.y + fit.h - newH);
  return { x, y, w: newW, h: newH };
}

function elementCenter(el: DiagramElement): Point {
  if (el.kind === "zone") return { x: el.x + el.w / 2, y: el.y + el.h / 2 };
  if (el.kind === "arrow") return { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 };
  return { x: el.x, y: el.y };
}

// Snap do centro às linhas médias do campo (x=60, y=40) e aos centros dos outros
// elementos, dentro de SNAP_DIST.
function computeSnap(
  elements: DiagramElement[],
  cx: number,
  cy: number,
  excludeId: string,
): SnapResult {
  const xs = [BASE_W / 2];
  const ys = [BASE_H / 2];
  for (const e of elements) {
    if (e.id === excludeId) continue;
    const c = elementCenter(e);
    xs.push(c.x);
    ys.push(c.y);
  }
  let snapX: number | null = null;
  let snapY: number | null = null;
  for (const tx of xs) if (Math.abs(cx - tx) <= SNAP_DIST) { snapX = tx; break; }
  for (const ty of ys) if (Math.abs(cy - ty) <= SNAP_DIST) { snapY = ty; break; }
  return { snapX, snapY };
}

export function ExerciseEditor(props: ExerciseEditorProps) {
  if (!props.open) return null;
  return <EditorOverlay {...props} />;
}

function EditorOverlay({ initialDiagram, onClose, exitActions, busy }: ExerciseEditorProps) {
  const [history, setHistory] = useState<DiagramHistory>(() =>
    initHistory(parseDiagram(initialDiagram) ?? emptyDiagram()),
  );
  const diagram = history.present;

  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userViewBox, setUserViewBox] = useState<ViewBox | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [showMarkings, setShowMarkings] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [running, setRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hideRotateHint, setHideRotateHint] = useState(false);
  const [openPopover, setOpenPopover] = useState<{ kind: "arrow" | "color"; left: number; top: number } | null>(null);
  const [showHints, setShowHints] = useState(() => {
    try {
      return localStorage.getItem(HINTS_KEY) !== "1";
    } catch {
      return false;
    }
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const elementRefs = useRef(new Map<string, SVGGElement | null>());
  const previewLineRef = useRef<SVGPathElement | null>(null);
  const previewRectRef = useRef<SVGRectElement | null>(null);
  const guideVRef = useRef<SVGLineElement | null>(null);
  const guideHRef = useRef<SVGLineElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ type: "none" });
  const contentRef = useRef<SVGGElement | null>(null);
  const rafId = useRef<number | null>(null);
  const pendingFn = useRef<(() => void) | null>(null);
  const lastPinchVB = useRef<ViewBox | null>(null);

  // Fullscreen de elemento é suportado em PC/Android, não no iOS Safari.
  const nativeFullscreenSupported = useMemo(() => {
    if (typeof document === "undefined") return false;
    const d = document as FullscreenDocument;
    return Boolean(document.fullscreenEnabled || d.webkitFullscreenEnabled);
  }, []);

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
      const cr = entries[0]?.contentRect;
      if (cr && cr.width && cr.height) {
        setCanvasSize({ w: cr.width, h: cr.height });
        setUserViewBox(null); // rotação/resize → repõe o enquadramento (fit)
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const d = document as FullscreenDocument;
    const onChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement || d.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  // ── Geometria ─────────────────────────────────────────────────────────────
  // Campo num espaço de autoria FIXO 120×80. O SVG usa cover (slice): o campo
  // enche o ecrã e o excesso é recortado (escala uniforme → tokens redondos). Em
  // portrait roda-se o CONTEÚDO em espaço SVG (viewBox 80×120 + transform no grupo),
  // mantendo getScreenCTM() válido para o mapeamento do ponteiro.
  const portrait = canvasSize.h > canvasSize.w;
  const baseViewBox = useMemo<ViewBox>(
    () => (portrait ? { x: 0, y: 0, w: BASE_H, h: BASE_W } : { x: 0, y: 0, w: BASE_W, h: BASE_H }),
    [portrait],
  );
  const renderViewBox = userViewBox ?? baseViewBox;
  const contentTransform = portrait ? `translate(${BASE_H} 0) rotate(90)` : undefined;

  // Escala real no ecrã (cover = max): px por unidade de campo. Igual à escala do
  // CTM do grupo; calculada analiticamente para evitar setState em efeito.
  const pxPerUnit = canvasSize.w
    ? Math.max(canvasSize.w / renderViewBox.w, canvasSize.h / renderViewBox.h)
    : 0;
  const hitRadius = pxPerUnit ? clamp(44 / pxPerUnit, PLAYER_R + 1, 9) : PLAYER_R + 2;

  // Ponto em coords de CAMPO (0–120/0–80) via CTM do grupo de conteúdo — respeita
  // viewBox + cover + rotação. Usado para colocar/arrastar/snap.
  const fieldPoint = useCallback((clientX: number, clientY: number): Point => {
    const node = contentRef.current ?? svgRef.current;
    const m = node?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return screenToSvgPoint(m, clientX, clientY);
  }, []);

  // Ponto em coords do viewBox RAIZ via CTM do SVG — só para o foco do pinch.
  const rootPoint = useCallback((clientX: number, clientY: number): Point => {
    const m = svgRef.current?.getScreenCTM();
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

  const applyGuide = useCallback(
    (ref: React.RefObject<SVGLineElement | null>, axis: "v" | "h", value: number | null) => {
      const node = ref.current;
      if (!node) return;
      if (value == null) {
        node.style.display = "none";
        return;
      }
      if (axis === "v") {
        node.setAttribute("x1", String(value));
        node.setAttribute("x2", String(value));
        node.setAttribute("y1", "0");
        node.setAttribute("y2", String(BASE_H));
      } else {
        node.setAttribute("y1", String(value));
        node.setAttribute("y2", String(value));
        node.setAttribute("x1", "0");
        node.setAttribute("x2", String(BASE_W));
      }
      node.style.display = "";
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
      let x = clamp(p.x, 0, BASE_W);
      let y = clamp(p.y, 0, BASE_H);
      if (showGuides) {
        const s = computeSnap(diagram.elements, x, y, "");
        if (s.snapX != null) x = s.snapX;
        if (s.snapY != null) y = s.snapY;
      }
      const id = newElementId();
      const color = diagram.color;
      switch (t.kind) {
        case "player":
          addElement({ id, kind: "player", team: "home", x, y, color });
          break;
        case "ball":
          addElement({ id, kind: "ball", x, y });
          break;
        case "cone":
          addElement({ id, kind: "cone", x, y });
          break;
        case "text":
          addElement({ id, kind: "text", x, y, text: "Texto", color });
          break;
        case "zone":
          addElement({
            id,
            kind: "zone",
            x: clamp(x - ZONE_DEFAULT.w / 2, 0, BASE_W - ZONE_DEFAULT.w),
            y: clamp(y - ZONE_DEFAULT.h / 2, 0, BASE_H - ZONE_DEFAULT.h),
            w: ZONE_DEFAULT.w,
            h: ZONE_DEFAULT.h,
            color,
          });
          break;
        default:
          break;
      }
    },
    [addElement, diagram.color, diagram.elements, showGuides],
  );

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const cancelTransientDom = useCallback(() => {
    elementRefs.current.forEach((node) => node?.removeAttribute("transform"));
    if (previewLineRef.current) previewLineRef.current.style.display = "none";
    if (previewRectRef.current) previewRectRef.current.style.display = "none";
    if (guideVRef.current) guideVRef.current.style.display = "none";
    if (guideHRef.current) guideHRef.current.style.display = "none";
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
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
        const mid = rootPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        gesture.current = {
          type: "pinch",
          idA: ids[0],
          idB: ids[1],
          startDist: distance(a.x, a.y, b.x, b.y),
          focus: mid,
          startViewBox: renderViewBox,
          fit: baseViewBox,
        };
        return;
      }

      const target = e.target as Element;
      const handleNode = target.closest("[data-handle]");
      const elNode = target.closest("[data-el-id]") as SVGGElement | null;
      const p = fieldPoint(e.clientX, e.clientY);

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
    [baseViewBox, cancelTransientDom, diagram.elements, dismissHints, fieldPoint, renderViewBox, rootPoint, selectedId, showHints, tool],
  );

  const applyDrag = useCallback((id: string, dx: number, dy: number) => {
    const node = elementRefs.current.get(id);
    if (node) node.setAttribute("transform", `translate(${dx} ${dy})`);
  }, []);

  const applyResize = useCallback(
    (g: Extract<Gesture, { type: "element-resize" }>, w: number, h: number) => {
      const node = elementRefs.current.get(g.id);
      if (!node) return;
      const rect = node.querySelector<SVGRectElement>("rect:not([data-handle])");
      if (rect) {
        rect.setAttribute("width", String(w));
        rect.setAttribute("height", String(h));
      }
      const handle = node.querySelector<SVGRectElement>("[data-handle]");
      if (handle) {
        handle.setAttribute("x", String(g.orig.x + w - hitRadius / 2));
        handle.setAttribute("y", String(g.orig.y + h - hitRadius / 2));
      }
    },
    [hitRadius],
  );

  const updatePreview = useCallback((g: Extract<Gesture, { type: "bg-draw" }>) => {
    const { tool: t, startSvg, curSvg } = g;
    if (t.kind === "arrow" && previewLineRef.current) {
      previewLineRef.current.setAttribute("d", `M ${startSvg.x} ${startSvg.y} L ${curSvg.x} ${curSvg.y}`);
      previewLineRef.current.setAttribute("stroke-dasharray", t.variant === "move" ? "2.4 1.6" : "");
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
  }, []);

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
        const next = zoomWithinFit(g.startViewBox, g.fit, g.focus.x, g.focus.y, factor);
        lastPinchVB.current = next;
        scheduleApply(() => {
          svgRef.current?.setAttribute("viewBox", `${next.x} ${next.y} ${next.w} ${next.h}`);
        });
        return;
      }

      const p = fieldPoint(e.clientX, e.clientY);

      if (g.type === "element-drag") {
        if (!g.moved && distance(e.clientX, e.clientY, g.startClient.x, g.startClient.y) > DRAG_THRESHOLD_PX) {
          g.moved = true;
        }
        let dx = p.x - g.startSvg.x;
        let dy = p.y - g.startSvg.y;
        let snapX: number | null = null;
        let snapY: number | null = null;
        if (showGuides && g.orig.kind !== "arrow") {
          const oc = elementCenter(g.orig);
          const cx = oc.x + dx;
          const cy = oc.y + dy;
          const s = computeSnap(diagram.elements, cx, cy, g.id);
          snapX = s.snapX;
          snapY = s.snapY;
          if (snapX != null) dx += snapX - cx;
          if (snapY != null) dy += snapY - cy;
        }
        scheduleApply(() => {
          applyDrag(g.id, dx, dy);
          applyGuide(guideVRef, "v", snapX);
          applyGuide(guideHRef, "h", snapY);
        });
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
        if (!g.moved && distance(e.clientX, e.clientY, g.startClient.x, g.startClient.y) > DRAG_THRESHOLD_PX) {
          g.moved = true;
        }
        if (g.moved) scheduleApply(() => updatePreview(g));
      }
    },
    [applyDrag, applyGuide, applyResize, diagram.elements, scheduleApply, showGuides, fieldPoint, updatePreview],
  );

  const endPinch = useCallback(() => {
    if (lastPinchVB.current) {
      setUserViewBox(lastPinchVB.current);
      lastPinchVB.current = null;
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      svg?.releasePointerCapture?.(e.pointerId);
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      gesture.current = { type: "none" }; // reset imediato — 1 elemento por toque

      if (g.type === "pinch") {
        endPinch();
        return;
      }

      if (g.type === "element-drag") {
        elementRefs.current.get(g.id)?.removeAttribute("transform");
        applyGuide(guideVRef, "v", null);
        applyGuide(guideHRef, "h", null);
        if (g.moved) {
          const p = fieldPoint(e.clientX, e.clientY);
          let dx = p.x - g.startSvg.x;
          let dy = p.y - g.startSvg.y;
          if (showGuides && g.orig.kind !== "arrow") {
            const oc = elementCenter(g.orig);
            const cx = oc.x + dx;
            const cy = oc.y + dy;
            const s = computeSnap(diagram.elements, cx, cy, g.id);
            if (s.snapX != null) dx += s.snapX - cx;
            if (s.snapY != null) dy += s.snapY - cy;
          }
          const elements = diagram.elements.map((el) => (el.id === g.id ? shiftElement(el, dx, dy) : el));
          commit({ ...diagram, elements });
        } else {
          setSelectedId(g.id);
        }
        return;
      }

      if (g.type === "element-resize") {
        const p = fieldPoint(e.clientX, e.clientY);
        const w = clamp(g.orig.w + (p.x - g.startSvg.x), 4, BASE_W - g.orig.x);
        const h = clamp(g.orig.h + (p.y - g.startSvg.y), 4, BASE_H - g.orig.y);
        const elements = diagram.elements.map((el) =>
          el.id === g.id && el.kind === "zone" ? { ...el, w, h } : el,
        );
        commit({ ...diagram, elements });
        return;
      }

      if (g.type === "bg-draw") {
        cancelTransientDom();
        const p = fieldPoint(e.clientX, e.clientY);
        if (!g.moved) {
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
              color: diagram.color,
            });
          }
        } else if (g.tool.kind === "zone") {
          const x = Math.min(g.startSvg.x, p.x);
          const y = Math.min(g.startSvg.y, p.y);
          const w = Math.abs(p.x - g.startSvg.x);
          const h = Math.abs(p.y - g.startSvg.y);
          if (w > 3 && h > 3) {
            addElement({ id: newElementId(), kind: "zone", x, y, w, h, color: diagram.color });
          }
        }
      }
    },
    [addElement, applyGuide, cancelTransientDom, commit, diagram, endPinch, placeAt, showGuides, fieldPoint],
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

  // Define a cor ativa e, se houver seleção, recolore esse elemento (1 commit).
  const setColor = useCallback(
    (color: string) => {
      const elements: DiagramElement[] = selectedId
        ? diagram.elements.map((el): DiagramElement => (el.id === selectedId ? { ...el, color } : el))
        : diagram.elements;
      commit({ ...diagram, color, elements });
      setOpenPopover(null);
    },
    [commit, diagram, selectedId],
  );

  const setPreset = useCallback(
    (preset: FieldPreset) => {
      commit({ ...diagram, preset });
    },
    [commit, diagram],
  );

  const togglePopover = useCallback((kind: "arrow" | "color", btn: HTMLElement) => {
    setOpenPopover((cur) => {
      if (cur?.kind === kind) return null;
      const rect = btn.getBoundingClientRect();
      const left = clamp(rect.left, 8, window.innerWidth - POPOVER_W - 8);
      return { kind, left, top: rect.bottom + 4 };
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    const d = document as FullscreenDocument;
    const active = Boolean(document.fullscreenElement || d.webkitFullscreenElement);
    if (active) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
    } else {
      const el = rootRef.current as FullscreenElement | null;
      if (!el) return;
      if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
      else el.webkitRequestFullscreen?.();
    }
  }, []);

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
      ref={rootRef}
      className="fixed inset-x-0 top-0 z-[100] flex flex-col bg-slate-900"
      style={{ height: "100dvh", overscrollBehavior: "contain" }}
    >
      {/* Toolbar única: desenho/opções/undo-limpar (wrap) + ações (fixo).
          flex-wrap em vez de scroll horizontal → nada fica escondido em portrait. */}
      <div className="flex items-start gap-1 border-b border-slate-700 bg-slate-800 px-2 py-2">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          <ToolButton active={tool.kind === "select"} onClick={() => setTool({ kind: "select" })} icon={MousePointer2} label="Selecionar" />
          <ToolButton active={tool.kind === "player"} onClick={() => setTool({ kind: "player" })} icon={Shirt} label="Jogador" />
          <ToolButton active={tool.kind === "ball"} onClick={() => setTool({ kind: "ball" })} icon={CircleDot} label="Bola" />
          <ToolButton active={tool.kind === "cone"} onClick={() => setTool({ kind: "cone" })} icon={Cone} label="Cone" />
          <ToolButton active={tool.kind === "zone"} onClick={() => setTool({ kind: "zone" })} icon={Square} label="Zona" />
          <ToolButton
            active={tool.kind === "arrow"}
            onClick={(e) => {
              const variant = tool.kind === "arrow" ? tool.variant : "move";
              setTool({ kind: "arrow", variant });
              togglePopover("arrow", e.currentTarget);
            }}
            icon={MoveUpRight}
            label="Setas"
          />
          <ToolButton active={tool.kind === "text"} onClick={() => setTool({ kind: "text" })} icon={Type} label="Texto" />

          <Divider />

          <label className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-slate-200">
            <LandPlot size={16} />
            <select
              value={diagram.preset}
              onChange={(e) => setPreset(e.target.value as FieldPreset)}
              className="rounded bg-slate-700 px-1 py-0.5 text-xs text-white focus:outline-none"
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
            onClick={(e) => togglePopover("color", e.currentTarget)}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-slate-200 hover:bg-slate-700"
            aria-label="Cor"
            title="Cor"
          >
            <Palette size={18} />
            <span className="h-3.5 w-3.5 rounded-full border border-white/40" style={{ background: diagram.color }} />
          </button>

          <ToolButton active={showGuides} onClick={() => setShowGuides((s) => !s)} icon={Magnet} label="Guias" />
          <ToolButton active={!showMarkings} onClick={() => setShowMarkings((s) => !s)} icon={showMarkings ? Eye : EyeOff} label="Marcações" />
          {nativeFullscreenSupported && (
            <ToolButton
              active={isFullscreen}
              onClick={toggleFullscreen}
              icon={isFullscreen ? Minimize : Maximize}
              label="Ecrã inteiro"
            />
          )}

          <Divider />

          <ToolButton active={false} disabled={!canUndo(history)} onClick={handleUndo} icon={Undo2} label="Desfazer" />
          <ToolButton
            active={false}
            disabled={diagram.elements.length === 0}
            onClick={() => diagram.elements.length > 0 && setConfirmClear(true)}
            icon={Trash2}
            label="Limpar"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1 border-l border-slate-700 pl-1">
          {exitActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => handleExitAction(action)}
                disabled={busyState}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium disabled:opacity-50 ${
                  action.primary
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                }`}
              >
                {busyState ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : Icon ? (
                  <Icon size={14} />
                ) : null}
                <span className="hidden min-[400px]:inline">{action.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-300 hover:bg-slate-700"
            aria-label="Fechar editor"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Canvas full-bleed */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">
        <svg
          ref={svgRef}
          viewBox={`${renderViewBox.x} ${renderViewBox.y} ${renderViewBox.w} ${renderViewBox.h}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full touch-none select-none"
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {/* Grupo de conteúdo (campo + tokens + guias + previews) em coords de
              campo 0–120/0–80. Em portrait roda 90° em espaço SVG. O export remove
              este transform (data-editor-content) para sair sempre landscape. */}
          <g ref={contentRef} data-editor-content transform={contentTransform}>
          <FieldPresetLayer preset={diagram.preset} showMarkings={showMarkings} />

          {diagram.elements.map((el) => (
            <g key={el.id} data-el-id={el.id} ref={setElementRef(el.id)}>
              <ElementShape el={el} color={diagram.color} />
              {selectedId === el.id && <SelectionOutline el={el} />}
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

          {/* Guias de alinhamento (só visíveis durante o arrasto) */}
          <line ref={guideVRef} data-export-ignore stroke="#10b981" strokeWidth={0.3} strokeDasharray="1 1" opacity={0.85} style={{ display: "none" }} />
          <line ref={guideHRef} data-export-ignore stroke="#10b981" strokeWidth={0.3} strokeDasharray="1 1" opacity={0.85} style={{ display: "none" }} />

          {/* Previews de desenho */}
          <path ref={previewLineRef} data-export-ignore fill="none" stroke={diagram.color} strokeWidth={ARROW_STROKE} strokeLinecap="round" style={{ display: "none" }} />
          <rect ref={previewRectRef} data-export-ignore fill={diagram.color} fillOpacity={0.18} stroke={diagram.color} strokeWidth={0.5} strokeDasharray="2 1.4" style={{ display: "none" }} />
          </g>
        </svg>

        {showHints && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center gap-2 text-[11px] text-white">
            <span className="rounded-full bg-black/60 px-2.5 py-1">1 dedo · mover</span>
            <span className="rounded-full bg-black/60 px-2.5 py-1">2 dedos · zoom</span>
          </div>
        )}

        {/* iPhone (sem Fullscreen API) em portrait: dica subtil e dispensável. */}
        {!nativeFullscreenSupported && portrait && !hideRotateHint && (
          <button
            type="button"
            onClick={() => setHideRotateHint(true)}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-[11px] text-white shadow-lg"
          >
            <RotateCw size={13} /> Roda para vista maior
          </button>
        )}

        {confirmClear && (
          <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 shadow-xl">
            <span className="text-xs text-white">Limpar tudo?</span>
            <button type="button" onClick={handleClear} className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">
              Limpar
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">
              Não
            </button>
          </div>
        )}

        {selectedElement && (
          <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/95 px-2 py-1.5 shadow-xl">
            {selectedElement.kind === "text" ? (
              <input
                value={selectedElement.text}
                onChange={(e) => updateTextValue(e.target.value)}
                placeholder="Texto da etiqueta"
                className="w-40 rounded-md bg-slate-700 px-2 py-1 text-sm text-white placeholder:text-slate-400 focus:outline-none"
              />
            ) : (
              <span className="px-1 text-xs text-slate-300">Selecionado</span>
            )}
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-xs text-red-400 hover:bg-slate-600"
            >
              <Trash2 size={14} /> Remover
            </button>
          </div>
        )}
      </div>

      {/* Popovers ancorados (fixed) + backdrop */}
      {openPopover && (
        <>
          <div className="fixed inset-0 z-[105]" onPointerDown={() => setOpenPopover(null)} />
          <div
            className="fixed z-[106] rounded-lg border border-slate-700 bg-slate-800 p-2 shadow-xl"
            style={{ left: openPopover.left, top: openPopover.top, width: POPOVER_W }}
          >
            {openPopover.kind === "arrow" ? (
              <div className="flex flex-col gap-1">
                {ARROW_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setTool({ kind: "arrow", variant: o.value });
                      setOpenPopover(null);
                    }}
                    className={`rounded-md px-3 py-2 text-left text-sm ${
                      tool.kind === "arrow" && tool.variant === o.value
                        ? "bg-emerald-600 text-white"
                        : "text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="h-8 w-8 rounded-full border-2"
                    style={{ background: c, borderColor: diagram.color === c ? "#fff" : "transparent" }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Divider() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-slate-600" />;
}

function ToolButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon: typeof Check;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-md p-2 disabled:opacity-30 ${
        active ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-700"
      }`}
    >
      <Icon size={18} />
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
