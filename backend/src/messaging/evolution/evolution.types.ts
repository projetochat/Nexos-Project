export type EvolutionCreateInstanceResponse = {
  instance?: {
    instanceName?: string;
    status?: string;
    connectionStatus?: string;
  };
  hash?: string;
  pairingCode?: string;
  code?: string;
  base64?: string;
  count?: number;
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

export type EvolutionInstance = {
  id?: string;
  name?: string;
  instanceName?: string;
  connectionStatus?: string;
  status?: string;
  ownerJid?: string | null;
  integration?: string | null;
  Webhook?: {
    enabled?: boolean;
    url?: string;
    events?: string[];
    headers?: Record<string, string | undefined> | null;
  } | null;
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

export type EvolutionProfilePictureResponse = {
  wuid?: string;
  profilePictureUrl?: string | null;
  picture?: string | null;
  url?: string | null;
  response?: {
    wuid?: string;
    profilePictureUrl?: string | null;
    picture?: string | null;
    url?: string | null;
  };
};

export type EvolutionWebhookPayload = {
  event?: string;
  instance?: string;
  data?: Record<string, unknown>;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
};
