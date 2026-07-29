import { createFileRoute } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  SectionHeader,
  Card,
  Button,
  Field,
  Input,
  Textarea,
  Avatar,
  Badge,
} from "@/components/ui-kit";

export const Route = createFileRoute("/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Seu perfil"
          subtitle="Informações que aparecem para clientes e colegas."
        />

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar name="Ana Ribeiro" size={96} />
              <button className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground transition hover:text-foreground">
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-base font-semibold">Ana Ribeiro</p>
            <p className="text-xs text-muted-foreground">Supervisora · Suporte</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <Badge tone="success">Online</Badge>
              <Badge tone="brand" dot={false}>Admin</Badge>
            </div>
            <div className="mt-6 w-full border-t border-border pt-4 text-left">
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Conversas hoje</dt>
                  <dd className="font-mono font-semibold">42</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">CSAT médio</dt>
                  <dd className="font-mono font-semibold">4.9</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Desde</dt>
                  <dd>jan/2024</dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold">Dados pessoais</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Nome completo"><Input defaultValue="Ana Ribeiro" /></Field>
              <Field label="Cargo"><Input defaultValue="Supervisora" /></Field>
              <Field label="E-mail"><Input defaultValue="ana@nexo.com" /></Field>
              <Field label="Telefone"><Input defaultValue="+55 11 98765-4321" /></Field>
              <div className="md:col-span-2">
                <Field label="Assinatura de mensagem" hint="Aparece ao final de respostas manuais.">
                  <Textarea rows={2} defaultValue="Att., Ana · Nexo" />
                </Field>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost">Cancelar</Button>
              <Button variant="primary">Salvar</Button>
            </div>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}
