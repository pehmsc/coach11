"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getProfileInitials } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

/**
 * Avatar de atleta com regra RGPD para uso de imagem:
 *   - mostra `avatarUrl` apenas se houver URL E `photoConsentGiven === true`.
 *   - caso contrario, mostra as iniciais derivadas de `fullName`.
 *
 * A regra existe mesmo que hoje todos os atletas tenham `photo_consent_given=false`
 * (logo, sempre iniciais); fotos futuras so aparecem com consentimento explicito.
 */
export function PlayerAvatar({
  avatarUrl,
  photoConsentGiven,
  fullName,
  size = "default",
  className,
}: {
  avatarUrl?: string | null;
  photoConsentGiven: boolean;
  fullName?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const showPhoto = !!avatarUrl && photoConsentGiven === true;

  return (
    <Avatar size={size} className={className}>
      {showPhoto ? <AvatarImage src={avatarUrl} alt={fullName || "Atleta"} /> : null}
      <AvatarFallback
        className={cn("bg-slate-200 text-slate-700 font-semibold")}
      >
        {getProfileInitials(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}
