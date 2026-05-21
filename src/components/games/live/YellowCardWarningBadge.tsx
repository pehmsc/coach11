"use client";

interface YellowCardWarningBadgeProps {
  count: number | undefined;
}

/**
 * Badge visual que sinaliza nos modais de evento que o jogador tem
 * exactamente 1 cartão amarelo. Não renderiza nada se count !== 1
 * (0 é o estado normal; 2+ já causa expulsão via cascade).
 */
export function YellowCardWarningBadge({ count }: YellowCardWarningBadgeProps) {
  if (count !== 1) return null;

  return (
    <span
      className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-sm flex-shrink-0 shadow-sm"
      role="img"
      aria-label="1 cartão amarelo"
      title="1 cartão amarelo"
    />
  );
}
