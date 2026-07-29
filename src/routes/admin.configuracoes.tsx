import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Field, Input, Button } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · Nexo Admin" }] }),
  component: () => (
    <AdminContainer>
      <SectionHeader title="Configurações da plataforma" subtitle="Parâmetros globais do SaaS." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold">Marca</h3>
          <p className="mt-1 text-xs text-muted-foreground">Identidade exibida para todas as empresas.</p>
          <div className="mt-4 space-y-3">
            <Field label="Nome da plataforma"><Input defaultValue="Nexo" /></Field>
            <Field label="URL principal"><Input defaultValue="https://nexo.app" /></Field>
            <Field label="E-mail de suporte"><Input defaultValue="suporte@nexo.app" /></Field>
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold">Cobrança</h3>
          <p className="mt-1 text-xs text-muted-foreground">Parâmetros financeiros globais.</p>
          <div className="mt-4 space-y-3">
            <Field label="Moeda"><Input defaultValue="BRL" /></Field>
            <Field label="Dias de trial padrão"><Input defaultValue="14" type="number" /></Field>
            <Field label="Tolerância inadimplência (dias)"><Input defaultValue="7" type="number" /></Field>
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold">Integrações padrão</h3>
          <p className="mt-1 text-xs text-muted-foreground">Provedores usados por padrão em novas empresas.</p>
          <div className="mt-4 space-y-3">
            <Field label="Provedor WhatsApp"><Input defaultValue="Meta Cloud API" /></Field>
            <Field label="Storage"><Input defaultValue="Cloudflare R2" /></Field>
            <Field label="Fila de jobs"><Input defaultValue="BullMQ + Redis" /></Field>
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold">Segurança</h3>
          <p className="mt-1 text-xs text-muted-foreground">Regras globais aplicadas a todos os tenants.</p>
          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Forçar 2FA para administradores</label>
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Auditar todas as impersonações</label>
            <label className="flex items-center gap-2"><input type="checkbox" /> Bloquear IPs suspeitos automaticamente</label>
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Rate limit por API key</label>
          </div>
        </Card>
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={() => toast.success("Configurações salvas")}>Salvar alterações</Button>
      </div>
    </AdminContainer>
  ),
});
