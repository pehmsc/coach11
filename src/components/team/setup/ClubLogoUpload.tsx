"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2, ImageIcon } from "lucide-react";

interface ClubLogoUploadProps {
  logoUrl: string;
  uploadingLogo: boolean;
  logoRef: React.RefObject<HTMLInputElement | null>;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ClubLogoUpload({
  logoUrl,
  uploadingLogo,
  logoRef,
  handleLogoUpload,
}: ClubLogoUploadProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon size={16} /> Logotipo do Clube
        </CardTitle>
        <CardDescription>
          Imagem em PNG ou SVG, fundo transparente recomendado
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo do clube"
              className="w-20 h-20 object-contain rounded-xl border border-slate-200 bg-white p-1"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
              <ImageIcon size={24} className="text-slate-300" />
            </div>
          )}
          <div className="flex-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoRef.current?.click()}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  A carregar...
                </>
              ) : (
                <>
                  <ImageIcon size={14} className="mr-2" />
                  {logoUrl ? "Substituir logotipo" : "Carregar logotipo"}
                </>
              )}
            </Button>
            <p className="text-xs text-slate-400 mt-1.5">
              PNG, JPG, WEBP ou SVG · Máx. 5MB
            </p>
          </div>
        </div>
        <input
          ref={logoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogoUpload}
        />
      </CardContent>
    </Card>
  );
}
