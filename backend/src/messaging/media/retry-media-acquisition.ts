// Only acquisition is repeated. Callers must keep validation and storage outside this helper.
export async function retryTransientMediaAcquisition<T>(acquire: () => Promise<T>): Promise<T> {
  try {
    return await acquire();
  } catch (error) {
    if (!isTransientAcquisitionError(error)) throw error;
    return acquire();
  }
}

function isTransientAcquisitionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (/^MEDIA_REMOTE_(TIMEOUT|HTTP_(502|503|504))$/.test(error.message)) return true;
  const code = (error as NodeJS.ErrnoException).code;
  return ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "EPIPE"].includes(code ?? "");
}
