export type EvolutionCreateInstanceResponse = {
  instance?: {
    instanceName?: string;
    status?: string;
    connectionStatus?: string;
  };
  hash?: string;
  qrcode?: {
    base64?: string;
    code?: string;
    count?: number;
  };
};

export type EvolutionConnectionStateResponse = {
  instance?: {
    instanceName?: string;
    state?: string;
    status?: string;
  };
};

export type EvolutionSendTextResponse = {
  key?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
  messageTimestamp?: string | number;
  status?: string;
};

export type EvolutionWebhookPayload = {
  event?: string;
  instance?: string;
  data?: Record<string, unknown>;
  date_time?: string;
  sender?: string;
};
