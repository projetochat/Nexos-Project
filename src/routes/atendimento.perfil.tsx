import { createFileRoute } from "@tanstack/react-router";
import { OperatorShell, OperatorContainer } from "@/components/operator-shell";
import { Card, SectionHeader, Field, Input, Button, Avatar, Badge } from "@/components/ui-kit";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/atendimento/perfil")({
  head: () => ({ meta: [{ title: "Perfil · Central de Atendimento" }] }),
  component: () => {
    const user = useSession((s) => s.user);
    return (
      <OperatorShell>
        <OperatorContainer>
          <SectionHeader title="Meu perfil" subtitle="Ajustes pessoais e disponibilidade." />
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card>
              <div className="flex flex-col items-center text-center">
                <Avatar name={user?.nome ?? "?"} size={72} />
                <h3 className="mt-3 font-semibold">{user?.nome}</h3>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <Badge tone="success" dot>Online</Badge>
                <div className="mt-4 w-full space-y-2 text-sm">
                  <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Em atendimento</span><span className="font-medium">4</span></div>
                  <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Resolvidas hoje</span><span className="font-medium">12</span></div>
                  <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">CSAT</span><span className="font-medium">4.8</span></div>
                </div>
              </div>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold">Dados pessoais</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Nome completo"><Input defaultValue={user?.nome ?? ""} /></Field>
                <Field label="E-mail"><Input defaultValue={user?.email ?? ""} type="email" /></Field>
                <Field label="Telefone"><Input placeholder="(11) 99999-0000" /></Field>
                <Field label="Cargo"><Input placeholder="Atendente" /></Field>
              </div>
              <h3 className="mt-6 text-sm font-semibold">Preferências</h3>
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Receber notificações sonoras</label>
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Notificar novas conversas na fila</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Modo foco (ocultar contadores)</label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline">Cancelar</Button>
                <Button variant="primary" onClick={() => toast.success("Perfil atualizado")}>Salvar alterações</Button>
              </div>
            </Card>
          </div>
        </OperatorContainer>
      </OperatorShell>
    );
  },
});
