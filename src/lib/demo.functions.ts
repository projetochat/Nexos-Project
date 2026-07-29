import { createServerFn } from "@tanstack/react-start";

/* Server fn idempotente: cria as duas contas demo se ainda não existirem. */
export const ensureDemoUsers = createServerFn({ method: "POST" }).handler(async () => {
  if (process.env.ALLOW_DEMO_USER_PROVISIONING !== "true") {
    throw new Error("Provisionamento demo desabilitado.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const demos = [
    { email: "admin@nexo.app", password: "demo1234", nome: "Ana Ribeiro", role: "admin" },
    { email: "atendente@nexo.app", password: "demo1234", nome: "Camila Duarte", role: "agent" },
  ];
  for (const d of demos) {
    // Tenta criar; se já existir, ignora
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: d.email,
      password: d.password,
      email_confirm: true,
      user_metadata: { nome: d.nome, role: d.role },
    });
    if (error && !/already/i.test(error.message)) {
      throw new Error(`Falha ao criar ${d.email}: ${error.message}`);
    }
  }
  return { ok: true };
});
