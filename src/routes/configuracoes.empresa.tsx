import { createFileRoute } from "@tanstack/react-router";
import { Card, Field, Input, Textarea, Button, Select } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/empresa")({
  component: EmpresaSettings,
});

function EmpresaSettings() {
  return (
    <Card>
      <p className="text-sm font-semibold">Perfil da empresa</p>
      <p className="text-xs text-muted-foreground">
        Estas informações aparecem para sua equipe e em documentos.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Razão social">
          <Input defaultValue="Acme Atendimento LTDA" />
        </Field>
        <Field label="CNPJ">
          <Input defaultValue="12.345.678/0001-90" />
        </Field>
        <Field label="Fuso horário">
          <Select defaultValue="br">
            <option value="br">America/Sao_Paulo (GMT-3)</option>
            <option>America/Manaus</option>
          </Select>
        </Field>
        <Field label="Idioma padrão">
          <Select defaultValue="pt">
            <option value="pt">Português (BR)</option>
            <option>Inglês</option>
            <option>Espanhol</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Descrição pública" hint="Aparece em respostas automáticas.">
            <Textarea rows={3} defaultValue="Somos a Acme, especialistas em atendimento premium." />
          </Field>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost">Cancelar</Button>
        <Button variant="primary">Salvar alterações</Button>
      </div>
    </Card>
  );
}
