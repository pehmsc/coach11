import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StickyBackLinkBaseProps = {
  href: string;
  label: string;
  children?: ReactNode;
  wrapperClassName?: string;
  contentClassName?: string;
};

type StickyBackLinkHrefProps = StickyBackLinkBaseProps & {
  href: string;
  onClick?: never;
};

type StickyBackLinkButtonProps = Omit<StickyBackLinkBaseProps, "href"> & {
  href?: never;
  onClick: () => void;
};

type StickyBackLinkProps = StickyBackLinkHrefProps | StickyBackLinkButtonProps;

const DEFAULT_WRAPPER_CLASS_NAME =
  "-mx-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8";

export function StickyBackLink({
  label,
  children,
  wrapperClassName,
  contentClassName,
  ...navigationProps
}: StickyBackLinkProps) {
  const interactiveClassName =
    "relative z-10 inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900";

  return (
    <div
      className={cn(
        "sticky top-0 z-[80] isolate backdrop-blur supports-[backdrop-filter]:bg-slate-50/90",
        wrapperClassName || DEFAULT_WRAPPER_CLASS_NAME,
      )}
      style={{ ["WebkitAppRegion" as string]: "no-drag" }}
    >
      <div
        className={cn(
          children ? "space-y-3" : "flex flex-wrap items-center gap-3",
          "pointer-events-auto",
          contentClassName,
        )}
      >
        {"href" in navigationProps && typeof navigationProps.href === "string" ? (
          <Link
            href={navigationProps.href}
            className={interactiveClassName}
            style={{ ["WebkitAppRegion" as string]: "no-drag" }}
          >
            <ArrowLeft size={16} />
            {label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={navigationProps.onClick}
            className={interactiveClassName}
            style={{ ["WebkitAppRegion" as string]: "no-drag" }}
          >
            <ArrowLeft size={16} />
            {label}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
