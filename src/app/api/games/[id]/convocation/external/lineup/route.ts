import { NextResponse } from "next/server";

// DEPRECADO 2026-05-12 (PR 2 do refactor game_squads).
//
// Modelo unificado: o lineup de jogadores externos é actualizado via o mesmo
// endpoint /api/games/[id]/convocation/lineup que jogadores internos, usando
// o `squadId` (game_squads.id) em vez de `playerId`.
//
// Cliente: chamar POST /api/games/[id]/convocation/lineup com
// { squadId: '<game_squads.id>', lineupStatus: 'on_field' | 'substitute' }.
//
// Este endpoint devolve 410 Gone. Será apagado em sprint posterior.
export async function POST() {
  return NextResponse.json(
    {
      error: "deprecated",
      message:
        "Endpoint deprecated. Usar POST /api/games/[id]/convocation/lineup com squadId.",
      replacement: "/api/games/[id]/convocation/lineup",
    },
    { status: 410 },
  );
}
