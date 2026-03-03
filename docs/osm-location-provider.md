# OSM Location Provider

## Objetivo

Substituir qualquer preview Google Maps por uma stack baseada em:

- OpenStreetMap tiles
- Leaflet no frontend
- proxy server-side para provider OSM
- persistência de coordenadas e metadados mínimos no evento

## Limites da beta

À data de 3 de março de 2026, a política pública da OSMF para `nominatim.openstreetmap.org` continua a impor:

- máximo de 1 request/segundo por aplicação
- cache obrigatório
- proibição explícita de autocomplete no serviço público

Por isso, esta implementação foi desenhada para:

- usar cache local por query/place id
- serializar chamadas ao provider
- aplicar rate limit interno por IP
- permitir troca futura do endpoint via `OSM_NOMINATIM_BASE_URL`

## Estratégia futura

Se o uso crescer, os próximos passos corretos são:

1. apontar `OSM_NOMINATIM_BASE_URL` para uma instância própria ou um provider compatível
2. mover cache/rate limit para storage distribuído
3. aplicar geocoding offline ou background refresh para páginas públicas com muito tráfego
