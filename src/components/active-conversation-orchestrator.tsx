import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { DepartmentIcon } from "@/components/department-icon";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui-kit";
import { connectionInstanceValue } from "@/lib/connection-options";
import { canStartActiveConversation } from "@/lib/active-conversation-permissions";
import {
  departmentsForConnection,
  favoriteDepartmentForConnection,
} from "@/lib/favorite-department";
import { setInboxTab } from "@/lib/inbox-tab-state";
import { useSession } from "@/lib/session";
import {
  conversationApi,
  organizationApi,
  type ApiContact,
  type ApiContactInstanceOption,
} from "@/lib/trixus-api";
import { useConnectedMessagingConnections } from "@/lib/use-connected-messaging-connections";
import { resolveConnectedContactInstances } from "@/lib/contact-instance-selection";

export type ActiveConversationRequest = {
  key: number;
  contact: ApiContact;
  firstMessagePreview?: string | null;
};

type Props = {
  request: ActiveConversationRequest | null;
  onCancel: () => void;
  onOpened?: () => void;
};

export function ActiveConversationOrchestrator({ request, onCancel, onOpened }: Props) {
  const user = useSession((state) => state.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isTenantAdmin = user?.role === "admin";
  const canStart = canStartActiveConversation(user?.permissions);
  const {
    allConnections,
    isLoading: connectionsLoading,
    error: connectionsError,
  } = useConnectedMessagingConnections({ enabled: !!request && canStart });
  const departmentsQuery = useQuery({
    queryKey: ["trixus", "chat-departments"],
    queryFn: organizationApi.listChatDepartments,
    enabled: !!request && canStart,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const instances = React.useMemo<ApiContactInstanceOption[]>(
    () =>
      allConnections.map((connection) => ({
        id: connection.id,
        value: connectionInstanceValue(connection),
        name: connection.name,
        color: connection.color ?? null,
        externalReference: connection.externalReference,
        ownerPhone: connection.ownerPhone ?? null,
        instanceName: connection.name,
        status: connection.status.toUpperCase(),
      })),
    [allConnections],
  );
  const [candidates, setCandidates] = React.useState<ApiContactInstanceOption[]>([]);
  const [connectionId, setConnectionId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [step, setStep] = React.useState<"instance" | "department" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const handledRequest = React.useRef<number | null>(null);
  const submitting = React.useRef(false);

  const close = React.useCallback(() => {
    setStep(null);
    setCandidates([]);
    setConnectionId("");
    setDepartmentId("");
    onCancel();
  }, [onCancel]);

  const createConversation = React.useCallback(
    async (selectedConnectionId: string, selectedDepartmentId: string) => {
      if (!request || submitting.current) return;
      if (!canStart) {
        toast.error("Você não possui permissão para iniciar conversas.");
        close();
        return;
      }
      submitting.current = true;
      setBusy(true);
      try {
        const conversation = await conversationApi.create({
          contactId: request.contact.id,
          connectionId: selectedConnectionId,
          departmentId: selectedDepartmentId,
          assignToSelf: true,
          ...(request.firstMessagePreview
            ? { firstMessagePreview: request.firstMessagePreview }
            : {}),
        });
        setInboxTab("ativas");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["trixus", "conversations"] }),
          queryClient.invalidateQueries({ queryKey: ["operations", "history"] }),
        ]);
        setStep(null);
        onOpened?.();
        onCancel();
        toast.success("Conversa iniciada");
        await navigate({
          to: "/inbox/$conversationId",
          params: { conversationId: conversation.id },
        });
      } catch (error) {
        toast.error("Falha ao abrir conversa", { description: (error as Error).message });
      } finally {
        submitting.current = false;
        setBusy(false);
      }
    },
    [canStart, close, navigate, onCancel, onOpened, queryClient, request],
  );

  const continueWithConnection = React.useCallback(
    (selectedConnectionId: string) => {
      if (!request) return;
      const departments = departmentsForConnection(
        departmentsQuery.data ?? [],
        selectedConnectionId,
      );
      if (departments.length === 0) {
        toast.error("Nenhum departamento permitido para esta instância.");
        close();
        return;
      }
      const favorite = isTenantAdmin
        ? undefined
        : favoriteDepartmentForConnection(departmentsQuery.data ?? [], selectedConnectionId);
      if (favorite) {
        void createConversation(selectedConnectionId, favorite.id);
        return;
      }
      setConnectionId(selectedConnectionId);
      setDepartmentId("");
      setStep("department");
    },
    [close, createConversation, departmentsQuery.data, isTenantAdmin, request],
  );

  React.useEffect(() => {
    if (!request || connectionsLoading || departmentsQuery.isLoading) return;
    if (handledRequest.current === request.key) return;
    handledRequest.current = request.key;
    if (!canStart) {
      toast.error("Você não possui permissão para iniciar conversas.");
      close();
      return;
    }
    if (connectionsError || departmentsQuery.error) {
      toast.error("Não foi possível carregar as opções para iniciar a conversa.");
      close();
      return;
    }
    const resolved = resolveConnectedContactInstances(request.contact, instances);
    setCandidates(resolved);
    setConnectionId("");
    setDepartmentId("");
    if (resolved.length === 0) {
      toast.error("Nenhuma instância conectada e permitida para este contato.");
      close();
      return;
    }
    if (resolved.length === 1) {
      continueWithConnection(resolved[0].id);
      return;
    }
    setStep("instance");
  }, [
    canStart,
    close,
    connectionsError,
    connectionsLoading,
    continueWithConnection,
    departmentsQuery.error,
    departmentsQuery.isLoading,
    instances,
    request,
  ]);

  const departments = departmentsForConnection(departmentsQuery.data ?? [], connectionId);

  return (
    <>
      <Modal
        open={step === "instance"}
        onClose={() => !busy && close()}
        title="Escolher Instância"
        description="Selecione a instância para iniciar a conversa."
        size="sm"
      >
        <div className="space-y-2">
          {candidates.map((instance) => (
            <button
              key={instance.id}
              type="button"
              disabled={busy}
              onClick={() => continueWithConnection(instance.id)}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border px-4 text-left hover:bg-surface-1"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: instance.color ?? "#22c55e" }}
              />
              <span className="flex-1 font-medium">{instance.name}</span>
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={step === "department"}
        onClose={() => !busy && close()}
        title="Escolher Departamento"
        description="Selecione o departamento para iniciar a conversa nesta instância."
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !departmentId}
              onClick={() => void createConversation(connectionId, departmentId)}
            >
              {busy ? "Iniciando…" : "Iniciar conversa"}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {departments.map((department) => (
            <button
              key={department.id}
              type="button"
              disabled={busy}
              onClick={() => setDepartmentId(department.id)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 text-left ${departmentId === department.id ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: department.color }}
              >
                <DepartmentIcon icon={department.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{department.name}</span>
                {department.description && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {department.description}
                  </span>
                )}
              </span>
              <span
                className={`h-4 w-4 rounded-full border-4 ${departmentId === department.id ? "border-primary" : "border-muted-foreground/40"}`}
              />
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
