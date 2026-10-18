/**
 * URL base da API do BullTracer.
 *
 * Resolução:
 * 1. VITE_API_URL (variável de ambiente do Vite) — para deploy em outra origem.
 * 2. Em dev, o proxy do Vite encaminha /api e /ws para o backend (ver vite.config.ts),
 *    então a mesma origem do dashboard funciona.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
