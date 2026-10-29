import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Card, Field, Input, Select } from "@/components/ui-kit";
import {
  taskManagementApi,
  type TaskAudience,
  type TaskFilterField,
  type TaskFilterFields,
  type TaskOptions,
  type TaskCondition,
} from "@/lib/task-management";
import { TaskCheck, TaskError, TaskPager } from "./task-ui";

const operatorNames: Record<TaskCondition["operator"], string> = {
  contains: "Contém",
  eq: "Igual",
  neq: "Diferente",
  gt: "Maior / Depois",
  lt: "Menor / Antes",
  between: "Entre",
  in: "Contém uma das opções",
  checked: "Marcado",
  unchecked: "Desmarcado",
};
function operators(field?: TaskFilterField): TaskCondition["operator"][] {
  const type = field?.type.toLowerCase() ?? "text";
  return /check|bool/.test(type)
    ? ["checked", "unchecked"]
    : /number|numeric|integer|decimal|date/.test(type)
      ? ["eq", "gt", "lt", "between"]
      : /list|select|option/.test(type) || field?.options?.length
        ? ["eq", "neq", "in"]
        : ["contains", "eq", "neq"];
}
export function TaskAudienceEditor({
  value,
  onChange,
  options,
  fields,
  connectionId,
  disabled = false,
}: {
  value: TaskAudience;
  onChange: (value: TaskAudience) => void;
  options: TaskOptions;
  fields: TaskFilterFields;
  connectionId?: string;
  disabled?: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const preview = useMutation({
    mutationFn: async () => ({
      ...(await taskManagementApi.audiencePreview(value, connectionId)),
      snapshot: JSON.stringify({ value, connectionId }),
    }),
  });
  const allFields = [...fields.native, ...fields.custom].map((field) =>
    field.key === "customerId"
      ? {
          ...field,
          options: options.customers.map((item) => ({ value: item.id, label: item.name })),
        }
      : field.key === "tagIds"
        ? { ...field, options: options.tags.map((item) => ({ value: item.id, label: item.name })) }
        : field,
  );
  const previewFresh = preview.data?.snapshot === JSON.stringify({ value, connectionId });
  const update = (patch: Partial<TaskAudience>) => {
    preview.reset();
    onChange({ ...value, ...patch });
  };
  const updateCondition = (index: number, condition: TaskCondition) =>
    update({
      conditions: value.conditions.map((item, position) => (position === index ? condition : item)),
    });
  const choices = value.mode === "groups" ? options.groups : options.contacts;
  const selected = value.mode === "groups" ? value.groupIds : value.contactIds;
  const filteredChoices = choices.filter((item) =>
    item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredChoices.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleChoices = filteredChoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  React.useEffect(() => setPage(1), [search, value.mode]);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(17rem,1fr)]">
      <Card>
        <h3 className="mb-3 font-semibold">Como deseja selecionar os destinatários?</h3>
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {[
            ["contacts", "Contatos"],
            ["groups", "Grupos de WhatsApp"],
            ["filters", "Seleção por filtros"],
          ].map(([mode, label]) => (
            <Button
              key={mode}
              disabled={disabled}
              variant={value.mode === mode ? "primary" : "outline"}
              onClick={() => {
                setSearch("");
                update({ mode: mode as TaskAudience["mode"] });
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <Field label="Segmentação">
          <Select
            disabled={disabled}
            value={value.selection}
            onChange={(event) =>
              update({ selection: event.target.value as TaskAudience["selection"] })
            }
          >
            <option value="fixed">Seleção fixa</option>
            <option value="dynamic">Seleção dinâmica</option>
          </Select>
        </Field>
        <p className="my-2 text-xs text-muted-foreground">
          {value.selection === "fixed"
            ? "Mantém os destinatários identificados ao salvar."
            : "Recalcula a seleção em cada execução."}{" "}
          Vincular destinatários não ativa envios.
        </p>
        {value.mode !== "filters" ? (
          <>
            <Input
              aria-label="Buscar destinatário"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar destinatário..."
              disabled={disabled}
            />
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {visibleChoices.map((item) => (
                <TaskCheck
                  key={item.id}
                  label={item.name}
                  checked={selected.includes(item.id)}
                  disabled={disabled}
                  onChange={(checked) =>
                    update(
                      value.mode === "groups"
                        ? {
                            groupIds: checked
                              ? [...selected, item.id]
                              : selected.filter((id) => id !== item.id),
                          }
                        : {
                            contactIds: checked
                              ? [...selected, item.id]
                              : selected.filter((id) => id !== item.id),
                          },
                    )
                  }
                />
              ))}
              {!choices.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhum destinatário autorizado disponível.
                </p>
              )}
            </div>
            <TaskPager
              page={currentPage}
              totalPages={totalPages}
              total={filteredChoices.length}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Todas as condições devem ser atendidas (E).
            </p>
            {value.conditions.map((condition, index) => {
              const field = allFields.find((item) => item.key === condition.field);
              return (
                <div
                  key={index}
                  className="grid items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Field label="Campo">
                    <Select
                      aria-label={`Campo ${index + 1}`}
                      disabled={disabled}
                      value={condition.field}
                      onChange={(event) => {
                        const next = allFields.find((item) => item.key === event.target.value);
                        updateCondition(index, {
                          field: event.target.value,
                          operator: operators(next)[0],
                          value: "",
                        });
                      }}
                    >
                      <option value="">Selecione</option>
                      {allFields.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Operador">
                    <Select
                      aria-label={`Operador ${index + 1}`}
                      disabled={disabled}
                      value={condition.operator}
                      onChange={(event) =>
                        updateCondition(index, {
                          ...condition,
                          operator: event.target.value as TaskCondition["operator"],
                          value: "",
                        })
                      }
                    >
                      {operators(field).map((operator) => (
                        <option key={operator} value={operator}>
                          {operatorNames[operator]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ConditionValue
                    field={field}
                    condition={condition}
                    disabled={disabled}
                    onChange={(next) => updateCondition(index, next)}
                  />
                  <Button
                    aria-label={`Remover condição ${index + 1}`}
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      update({
                        conditions: value.conditions.filter((_, position) => position !== index),
                      })
                    }
                  >
                    Remover
                  </Button>
                </div>
              );
            })}
            <Button
              disabled={disabled || !allFields.length}
              onClick={() =>
                update({
                  conditions: [
                    ...value.conditions,
                    {
                      field: allFields[0]?.key ?? "",
                      operator: operators(allFields[0])[0],
                      value: "",
                    },
                  ],
                })
              }
            >
              Adicionar condição
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Prévia dos destinatários</h3>
        <Button disabled={disabled || preview.isPending} onClick={() => preview.mutate()}>
          Atualizar prévia
        </Button>
        <TaskError error={preview.error} />
        {previewFresh && preview.data && (
          <>
            <div className="my-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-primary/5 p-3">
                <strong>{preview.data.contactCount}</strong>
                <p className="text-xs">Contatos</p>
              </div>
              <div className="rounded-lg bg-info/5 p-3">
                <strong>{preview.data.groupCount}</strong>
                <p className="text-xs">Grupos</p>
              </div>
            </div>
            <p className="text-sm">{preview.data.total} destinatário(s), sem duplicações.</p>
            <ul className="mt-2 divide-y divide-border">
              {preview.data.sample.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="py-2 text-sm">
                  {item.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    {item.kind === "group" ? "Grupo" : "Contato"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
function ConditionValue({
  field,
  condition,
  onChange,
  disabled,
}: {
  field?: TaskFilterField;
  condition: TaskCondition;
  onChange: (value: TaskCondition) => void;
  disabled: boolean;
}) {
  if (condition.operator === "checked" || condition.operator === "unchecked")
    return <span className="py-2 text-xs text-muted-foreground">Sem valor adicional</span>;
  const type = field?.type.toLowerCase() ?? "text";
  const numeric = /number|numeric|integer|decimal/.test(type);
  const date = /date/.test(type);
  const choices = field?.options ?? [];
  if (condition.operator === "between") {
    const values = Array.isArray(condition.value) ? condition.value : [];
    return (
      <Field label="Valores">
        <div className="grid grid-cols-2 gap-1">
          {[0, 1].map((index) => (
            <Input
              key={index}
              aria-label={index === 0 ? "Valor inicial" : "Valor final"}
              type={numeric ? "number" : date ? "date" : "text"}
              disabled={disabled}
              value={String(values[index] ?? "")}
              onChange={(event) => {
                const next = [values[0] ?? "", values[1] ?? ""];
                next[index] =
                  numeric && event.target.value !== ""
                    ? Number(event.target.value)
                    : event.target.value;
                onChange({ ...condition, value: next as string[] | [number, number] });
              }}
            />
          ))}
        </div>
      </Field>
    );
  }
  if (choices.length)
    return (
      <Field label="Valor">
        <Select
          multiple={condition.operator === "in"}
          disabled={disabled}
          value={
            condition.operator === "in"
              ? Array.isArray(condition.value)
                ? condition.value.map(String)
                : []
              : String(condition.value ?? "")
          }
          onChange={(event) =>
            onChange({
              ...condition,
              value:
                condition.operator === "in"
                  ? [...event.target.selectedOptions].map((item) => item.value)
                  : event.target.value,
            })
          }
        >
          <option value="">Selecione</option>
          {choices.map((item) => {
            const option = typeof item === "string" ? { value: item, label: item } : item;
            return (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            );
          })}
        </Select>
      </Field>
    );
  return (
    <Field label="Valor">
      <Input
        disabled={disabled}
        type={numeric ? "number" : date ? "date" : "text"}
        value={
          typeof condition.value === "string" || typeof condition.value === "number"
            ? condition.value
            : ""
        }
        onChange={(event) =>
          onChange({
            ...condition,
            value:
              numeric && event.target.value !== ""
                ? Number(event.target.value)
                : event.target.value,
          })
        }
      />
    </Field>
  );
}
