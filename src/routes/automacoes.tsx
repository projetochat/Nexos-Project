import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Trash2, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionHeader,
  Select,
  Textarea,
} from "@/components/ui-kit";
import {
  automationApi,
  organizationApi,
  type ApiAutomationRule,
  type ApiDepartment,
} from "@/lib/nexos-api";
import { num } from "@/lib/format";

export const Route = createFileRoute("/automacoes")({
  head: () => ({ meta: [{ title: "Automacoes - Nexo" }] }),
  component: Page,
});

const automationQueryKey = ["nexos", "automations"] as const;
const departmentsQueryKey = ["nexos", "departments"] as const;

type AutomationActionInput = "BOT_REPLY" | "ASSIGN_DEPARTMENT" | "NOTIFY_TEAM";

const ACTION_LABEL: Record<ApiAutomationRule["actionType"], string> = {
  bot_reply: "Resposta do bot",
  assign_department: "Atribuir departamento",
  notify_team: "Notificar equipe",
};

function Page() {
  const qc = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const { data, isLoading } = useQuery({
    queryKey: automationQueryKey,
    queryFn: () => automationApi.list({ pageSize: 100 }),
  });
  const { data: departments = [] } = useQuery({
    queryKey: departmentsQueryKey,
    queryFn: organizationApi.listDepartments,
  });
  const rules = data?.items ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: automationQueryKey });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Automacoes"
          subtitle={`${num(rules.length)} regras configuradas no tenant.`}
          actions={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Nova automacao
            </Button>
          }
        />

        {creating && (
          <AutomationForm
            departments={departments.filter((department) => department.active)}
            onCancel={() => setCreating(false)}
            onSubmit={async (payload) => {
              await automationApi.create(payload);
              toast.success("Automacao criada");
              setCreating(false);
              refresh();
            }}
          />
        )}

        <Card padding={false}>
          <div className="divide-y divide-border">
            {rules.map((rule) => (
              <AutomationRow
                key={rule.id}
                rule={rule}
                onToggle={async () => {
                  await automationApi.update(rule.id, {
                    status: rule.status === "active" ? "DISABLED" : "ACTIVE",
                  });
                  toast.success("Automacao atualizada");
                  refresh();
                }}
                onArchive={async () => {
                  await automationApi.archive(rule.id);
                  toast.success("Automacao arquivada");
                  refresh();
                }}
              />
            ))}
            {isLoading && (
              <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
            )}
            {!isLoading && rules.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma automacao cadastrada.
              </div>
            )}
          </div>
        </Card>
      </PageContainer>
    </AppShell>
  );
}

function AutomationRow({
  rule,
  onToggle,
  onArchive,
}: {
  rule: ApiAutomationRule;
  onToggle: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Workflow className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium">{rule.name}</h3>
          <Badge tone={rule.status === "active" ? "success" : "default"}>{rule.status}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5">
            <Zap className="h-3 w-3" /> {rule.matchText}
          </span>
          <ArrowRight className="h-3 w-3" />
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5">
            {ACTION_LABEL[rule.actionType]}
          </span>
          {rule.department && <span>{rule.department.nome}</span>}
          {rule.responseText && <span className="truncate">{rule.responseText}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToggle}>
          {rule.status === "active" ? "Pausar" : "Ativar"}
        </Button>
        <Button variant="ghost" size="icon" onClick={onArchive} aria-label="Arquivar automacao">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AutomationForm({
  departments,
  onCancel,
  onSubmit,
}: {
  departments: ApiDepartment[];
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    matchText: string;
    responseText?: string;
    actionType: AutomationActionInput;
    departmentId?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [matchText, setMatchText] = React.useState("");
  const [responseText, setResponseText] = React.useState("");
  const [actionType, setActionType] = React.useState<AutomationActionInput>("BOT_REPLY");
  const [departmentId, setDepartmentId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const requiresResponse = actionType === "BOT_REPLY";
  const requiresDepartment = actionType === "ASSIGN_DEPARTMENT";

  return (
    <Card className="mb-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Texto de disparo">
          <Input value={matchText} onChange={(event) => setMatchText(event.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Acao">
          <Select
            value={actionType}
            onChange={(event) => setActionType(event.target.value as AutomationActionInput)}
          >
            <option value="BOT_REPLY">Resposta do bot</option>
            <option value="ASSIGN_DEPARTMENT">Atribuir departamento</option>
            <option value="NOTIFY_TEAM">Notificar equipe</option>
          </Select>
        </Field>
        {requiresDepartment && (
          <Field label="Departamento">
            <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">Selecione</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label={requiresResponse ? "Resposta" : "Mensagem interna opcional"}>
        <Textarea value={responseText} onChange={(event) => setResponseText(event.target.value)} />
      </Field>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={async () => {
            if (!name.trim() || !matchText.trim()) {
              toast.error("Preencha nome e texto de disparo.");
              return;
            }
            if (requiresResponse && !responseText.trim()) {
              toast.error("Preencha a resposta do bot.");
              return;
            }
            if (requiresDepartment && !departmentId) {
              toast.error("Selecione o departamento.");
              return;
            }
            setBusy(true);
            try {
              await onSubmit({
                name: name.trim(),
                matchText: matchText.trim(),
                responseText: responseText.trim() || undefined,
                actionType,
                departmentId: requiresDepartment ? departmentId : undefined,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Salvar
        </Button>
      </div>
    </Card>
  );
}
