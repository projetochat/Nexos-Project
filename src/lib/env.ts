/* ============================================================
   Nexo · Environment & Integration Flags
   Ponto único para futuras integrações. Hoje tudo está desligado
   (o app opera 100% em dados mockados), mas cada consumidor já
   consulta estas flags — basta ativar quando o backend chegar.
   ============================================================ */

export const env = {
  /** Latência simulada dos serviços mockados (ms). */
  MOCK_LATENCY_MS: 220,
  /** Probabilidade de falha simulada (0..1) para exercitar UI de erro. */
  MOCK_FAILURE_RATE: 0,

  integrations: {
    supabase: { enabled: false, url: "", anonKey: "" },
    postgres: { enabled: false },
    redis: { enabled: false },
    bullmq: { enabled: false },
    socketio: { enabled: false, url: "" },
    r2: { enabled: false, bucket: "" },
    evolutionApi: { enabled: false, baseUrl: "", token: "" },
    metaCloudApi: { enabled: false, phoneNumberId: "", token: "" },
    n8n: { enabled: false, baseUrl: "" },
    ai: { enabled: false, provider: "lovable-gateway" as const, model: "google/gemini-2.5-flash" },
    webhooks: { enabled: false, ingestPath: "/api/public/webhook" },
  },
} as const;

export type NexoEnv = typeof env;
