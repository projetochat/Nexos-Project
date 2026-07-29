import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, KeyRound, History } from "lucide-react";
import { Card, Button, Field, Input, Badge, Alert } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/seguranca")({
  component: SegurancaSettings,
});

function SegurancaSettings() {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Autenticação em dois fatores</p>
            <p className="text-xs text-muted-foreground">
              Adicione uma camada extra de proteção à sua conta.
            </p>
          </div>
          <Badge tone="warning">Desativado</Badge>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <Button variant="primary" size="sm">Ativar 2FA</Button>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold">Alterar senha</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Senha atual"><Input type="password" /></Field>
          <div />
          <Field label="Nova senha"><Input type="password" /></Field>
          <Field label="Confirmar nova senha"><Input type="password" /></Field>
        </div>
        <div className="mt-4 flex justify-end border-t border-border pt-4">
          <Button variant="primary" size="sm">Atualizar senha</Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Sessões ativas</p>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {[
            ["MacBook Pro · Chrome", "São Paulo, BR", "Agora"],
            ["iPhone 15 · App", "São Paulo, BR", "há 3h"],
            ["Windows · Firefox", "Rio de Janeiro, BR", "há 2 dias"],
          ].map(([dev, loc, t]) => (
            <li key={dev} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium">{dev}</p>
                <p className="text-xs text-muted-foreground">{loc} · {t}</p>
              </div>
              <Button variant="ghost" size="sm">Encerrar</Button>
            </li>
          ))}
        </ul>
      </Card>

      <Alert tone="info" title="Chaves de API">
        Gere chaves para integrar com sistemas externos.
      </Alert>
      <Card>
        <div className="flex items-center gap-3">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-semibold">API Keys</p>
            <p className="text-xs text-muted-foreground">Nenhuma chave criada ainda.</p>
          </div>
          <Button variant="secondary" size="sm">Gerar chave</Button>
        </div>
      </Card>
    </div>
  );
}
