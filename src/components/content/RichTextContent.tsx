import { renderNotesToHtml } from "@/lib/notes/markdown";
import { cn } from "@/lib/utils";

type Props = {
  content: string | null | undefined;
  className?: string;
};

export function RichTextContent({ content, className }: Props) {
  const html = renderNotesToHtml(content);
  if (!html) return null;

  return (
    <div
      className={cn(
        "text-sm leading-6 text-slate-700 [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:pl-5 [&_li+li]:mt-1 [&_strong]:font-semibold [&_em]:italic",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
