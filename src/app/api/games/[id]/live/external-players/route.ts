import { NextResponse } from "next/server";

// DEPRECADO 2026-05-12 (PR 2 do refactor game_squads).
//
// Modelo unificado: o lineup live de qualquer jogador (interno ou externo)
// é actualizado via /api/games/[id]/convocation/lineup usando squadId.
// Substituições live usam directamente a RPC `rpc_register_substitution`
// que dispara INSERT atómico de substitution_in + substitution_out events.
//
// Este endpoint devolve 410 Gone. Será apagado em sprint posterior.
export async function POST() {
  return NextResponse.json(
    {
      error: "deprecated",
      message:
        "Endpoint deprecated. Usar /api/games/[id]/convocation/lineup com squadId, ou rpc_register_substitution para subs live.",
      replacement: "/api/games/[id]/convocation/lineup",
    },
    { status: 410 },
  );
}
