"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getProfileInitials } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

export function UserAvatar({
  fullName,
  avatarUrl,
  size = "default",
  className,
  fallbackClassName,
}: {
  fullName?: string | null;
  avatarUrl?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName || "Utilizador"} /> : null}
      <AvatarFallback
        className={cn(
          "bg-slate-700 text-slate-100 font-semibold",
          fallbackClassName,
        )}
      >
        {getProfileInitials(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}
