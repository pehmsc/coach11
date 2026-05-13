import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  /** Label visível. Pode ser truncado em mobile. */
  label: string;
  /** Se omitido, item é o "actual" (último, não clicável). */
  href?: string;
  /** Label curto opcional usado quando colapsado no mobile. */
  shortLabel?: string;
};

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Em mobile, mostrar só os últimos N itens. Default: 2. */
  mobileMaxItems?: number;
  className?: string;
}

/**
 * Breadcrumb visual de navegação hierárquica.
 *
 * Desktop (≥ sm): mostra todos os items.
 * Mobile (< sm): mostra apenas os últimos `mobileMaxItems` (default 2);
 * se houver mais, prefixa "…" para indicar níveis escondidos.
 * Último item nunca é Link — representa a página actual.
 */
export function Breadcrumb({
  items,
  mobileMaxItems = 2,
  className,
}: BreadcrumbProps) {
  if (items.length === 0) return null;

  const shouldCollapseMobile = items.length > mobileMaxItems;
  const mobileItems = shouldCollapseMobile
    ? items.slice(-mobileMaxItems)
    : items;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center text-sm text-slate-500 min-w-0",
        className,
      )}
    >
      {/* Desktop: todos os items */}
      <ol className="hidden sm:flex items-center gap-1.5 min-w-0">
        {items.map((item, idx) => (
          <BreadcrumbItemEl
            key={`d-${idx}`}
            item={item}
            isLast={idx === items.length - 1}
            showSeparator={idx > 0}
          />
        ))}
      </ol>

      {/* Mobile: items colapsados */}
      <ol className="flex sm:hidden items-center gap-1.5 min-w-0">
        {shouldCollapseMobile && (
          <li
            className="flex items-center gap-1.5 text-slate-400"
            aria-hidden
          >
            <span aria-label="Níveis anteriores escondidos">…</span>
            <ChevronRight size={12} className="text-slate-300" aria-hidden />
          </li>
        )}
        {mobileItems.map((item, idx) => (
          <BreadcrumbItemEl
            key={`m-${idx}`}
            item={item}
            isLast={idx === mobileItems.length - 1}
            showSeparator={idx > 0}
            useShortLabel
          />
        ))}
      </ol>
    </nav>
  );
}

function BreadcrumbItemEl({
  item,
  isLast,
  showSeparator,
  useShortLabel = false,
}: {
  item: BreadcrumbItem;
  isLast: boolean;
  showSeparator: boolean;
  useShortLabel?: boolean;
}) {
  const label =
    useShortLabel && item.shortLabel ? item.shortLabel : item.label;

  return (
    <li className="flex items-center gap-1.5 min-w-0">
      {showSeparator && (
        <ChevronRight
          size={12}
          className="text-slate-300 flex-shrink-0"
          aria-hidden
        />
      )}
      {isLast || !item.href ? (
        <span
          className="text-slate-900 font-medium truncate"
          aria-current={isLast ? "page" : undefined}
        >
          {label}
        </span>
      ) : (
        <Link
          href={item.href}
          className="text-slate-500 hover:text-slate-900 truncate rounded-sm px-1 -mx-1 hover:bg-slate-100 transition-colors"
        >
          {label}
        </Link>
      )}
    </li>
  );
}
