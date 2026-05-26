"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

export interface FaqSection {
  title: string;
  items: FaqItem[];
}

interface Props {
  sections: FaqSection[];
}

export function FaqAccordion({ sections }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="space-y-12">
      {sections.map((section, sIdx) => (
        <section key={section.title}>
          <h2 className="mb-4 text-xl font-bold text-white">{section.title}</h2>
          <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
            {section.items.map((item, iIdx) => {
              const key = `${sIdx}-${iIdx}`;
              const isOpen = openKey === key;
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => setOpenKey(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]"
                  >
                    <span className="text-sm font-semibold text-emerald-400 sm:text-base">
                      {item.question}
                    </span>
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={`shrink-0 text-emerald-400/70 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isOpen ? (
                    <div className="px-5 pb-5 pt-1 text-sm leading-relaxed text-white/70 [&_a]:text-emerald-400 [&_a]:underline [&_a:hover]:text-emerald-300 [&_strong]:text-white [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p+p]:mt-2">
                      {item.answer}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
