"use client";

import { Share2, PlusSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWA } from "@/components/pwa/PWAProvider";
import { cn } from "@/lib/utils";

export function IOSInstallModal() {
  const {
    iosModalOpen,
    isIOSInstallFlow,
    closeIOSInstallModal,
    dismissIOSInstallPermanently,
  } = usePWA();

  const open = iosModalOpen && isIOSInstallFlow;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 px-4 pb-4 pt-10 transition-opacity duration-200 md:items-center",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Fechar modal de instalação iOS"
        onClick={closeIOSInstallModal}
        className="absolute inset-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        className={cn(
          "relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl transition-transform duration-200",
          open ? "translate-y-0 md:scale-100" : "translate-y-4 md:scale-95",
        )}
      >
        <button
          type="button"
          aria-label="Fechar"
          className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-slate-700"
          onClick={closeIOSInstallModal}
        >
          <X size={18} />
        </button>

        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Share2 size={20} />
        </div>

        <h2 id="ios-install-title" className="text-lg font-semibold text-slate-900">
          Instalar no iPhone
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          No Safari, adiciona a Coach11 ao ecrã principal para abrir em modo app.
        </p>

        <ol className="mt-5 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              1
            </span>
            <div className="min-w-0">
              <p className="font-medium text-slate-900">Toca em Partilhar</p>
              <p className="text-slate-600">
                Usa o botão <Share2 className="mx-1 inline size-4" /> na barra do Safari.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              2
            </span>
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                Escolhe “Adicionar ao Ecrã principal”
              </p>
              <p className="text-slate-600">
                Procura a opção com o ícone <PlusSquare className="mx-1 inline size-4" />.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              3
            </span>
            <div className="min-w-0">
              <p className="font-medium text-slate-900">Confirma em “Adicionar”</p>
              <p className="text-slate-600">
                A app passa a abrir em modo standalone, sem a barra do browser.
              </p>
            </div>
          </li>
        </ol>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={dismissIOSInstallPermanently}
          >
            Não mostrar novamente
          </Button>
          <Button type="button" onClick={closeIOSInstallModal}>
            Percebi
          </Button>
        </div>
      </div>
    </div>
  );
}
