"use client";

import { Button } from "@/components/ui/button";
import { InstallPromptIcon, usePWA } from "@/components/pwa/PWAProvider";
import { cn } from "@/lib/utils";

export function InstallPWAButton({
  className,
  variant = "outline",
  size = "sm",
  label = "Instalar app",
  fullWidth = false,
}: {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "xs";
  label?: string;
  fullWidth?: boolean;
}) {
  const { canInstall, isInstalled, promptInstall } = usePWA();

  if (!canInstall || isInstalled) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => void promptInstall()}
      className={cn(fullWidth ? "w-full justify-start" : "", className)}
    >
      <InstallPromptIcon />
      {label}
    </Button>
  );
}
