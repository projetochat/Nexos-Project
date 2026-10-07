import { ONBOARDING_INSTANCE_IDEMPOTENCY_KEY } from "@/lib/onboarding";
import { connectionsApi } from "@/lib/trixus-api";

type OnboardingConnectionApi = Pick<typeof connectionsApi, "createEvolution" | "qr">;

export async function createOnboardingConnectionWithQr(
  name: string,
  api: OnboardingConnectionApi = connectionsApi,
) {
  const connection = await api.createEvolution({
    name,
    serviceEnabled: true,
    idempotencyKey: ONBOARDING_INSTANCE_IDEMPOTENCY_KEY,
  });
  if (connection.status === "connected" || connection.qrCodeBase64) return connection;
  const generated = await api.qr(connection.id);
  return { ...connection, qrCodeBase64: generated.qrCodeBase64 };
}
