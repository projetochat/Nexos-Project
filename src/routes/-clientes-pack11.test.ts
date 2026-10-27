import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./clientes.tsx", import.meta.url), "utf8");

describe("Clientes do módulo Chamados — PACK 11", () => {
  it("usa o catálogo CRM existente e não redireciona para Contatos", () => {
    expect(source).toContain("crmApi.listCustomers");
    expect(source).toContain("crmApi.createCustomer");
    expect(source).toContain("crmApi.updateCustomer");
    expect(source).toContain("crmApi.deleteCustomer");
    expect(source).not.toContain('redirect({ to: "/contatos" })');
  });

  it("entrega filtros, lista, cards, paginação e as quatro ações", () => {
    expect(source).toContain("Buscar por nome, CNPJ, CPF ou responsável...");
    expect(source).toContain('type ViewMode = "list" | "cards"');
    expect(source).toContain("Tipo de pessoa");
    expect(source).toContain("Situação");
    expect(source).toContain('label="Ver"');
    expect(source).toContain('label="Duplicar"');
    expect(source).toContain('label="Editar"');
    expect(source).toContain('label="Excluir"');
    expect(source).toContain('<div className="mx-4 border-t border-border py-2">');
    expect(source).toContain("data-customers-list-footer");
    expect(source).toContain("{visible} de {total}");
    expect(source).toContain('<thead className="bg-surface-2">');
    expect(source).toContain(
      'className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground sm:px-4"',
    );
    expect(source).toContain(
      'className="!h-6 !min-h-6 !w-16 !rounded-md !px-2 !py-0 !pr-6 text-xs"',
    );
    expect(source.match(/className="!h-7 !min-h-7 !w-7 !p-0"/g)).toHaveLength(2);
    expect(source).toContain('variant="ghost"');
    expect(source).toContain("formatPhoneForDisplay(customer.telefone)");
    expect(source).toContain("formatCustomerRegistrationDate(customer.createdAt)");
  });

  it("usa no novo cliente o mesmo botão compacto da Platform", () => {
    expect(source).toContain(
      '<Button variant="primary" size="sm" onClick={() => setCreating(true)}>',
    );
    expect(source).toContain('<Plus className="h-3.5 w-3.5" /> Novo cliente');
  });

  it("remove a ordenação e preserva a alternância de visualização", () => {
    expect(source).not.toContain("ArrowDownWideNarrow");
    expect(source).not.toContain('aria-label="Ordenar clientes"');
    expect(source).toContain('<LayoutGrid className="h-4 w-4" />');
    expect(source).toContain('<List className="h-4 w-4" />');
    expect(source).toContain('variant={viewMode === "cards" ? "primary" : "secondary"}');
    expect(source).toContain('variant={viewMode === "list" ? "primary" : "secondary"}');
    expect(source).toContain('aria-label="Visualizar clientes em cards"');
    expect(source).toContain('aria-label="Visualizar clientes em lista"');
    expect(source).toContain('title="Cards"');
    expect(source).toContain('title="Lista"');
    expect(source).not.toContain("Grid2X2");
    expect(source).not.toContain("⇅");
  });

  it("compacta e-mail e cidade na mesma linha dos cards", () => {
    expect(source).toContain(
      'className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"',
    );
    expect(source).toContain('className="flex min-w-0 items-center gap-2"');
    expect(source).toContain('className="flex shrink-0 items-center gap-1"');
  });

  it("usa toggle de situação no início do formulário de departamento", () => {
    const formStart = source.indexOf("function DepartmentFormModal(");
    const viewStart = source.indexOf("function RelationshipSection(", formStart);
    const departmentForm = source.slice(formStart, viewStart);

    expect(departmentForm).toContain('id="customer-department-active"');
    expect(departmentForm).toContain("checked={active}");
    expect(departmentForm).toContain("onCheckedChange={setActive}");
    expect(departmentForm).toContain('{active ? "Ativo" : "Inativo"}');
    expect(departmentForm.indexOf("<Switch")).toBeLessThan(
      departmentForm.indexOf('<Field label="Departamento *">'),
    );
    expect(departmentForm).not.toContain('<Field label="Situação">');
  });

  it("mostra a limpeza no padrão do dashboard apenas quando existe filtro", () => {
    expect(source).toContain("const hasFilters = Boolean(query.trim() || personType || status)");
    expect(source).toContain("{hasFilters && (");
    expect(source).toContain('variant="secondary"');
    expect(source).toContain('className="min-h-10 w-10 px-0"');
    expect(source).toContain('<FilterX className="h-4 w-4" />');
    expect(source).not.toContain("RotateCcw");
  });

  it("mantém o cadastro responsivo com Geral, Filiais, Departamentos e Contatos", () => {
    expect(source).toContain('["general", "Geral"]');
    expect(source).toContain('["branches", "Filiais"]');
    expect(source).toContain('["departments", "Departamentos"]');
    expect(source).toContain('["contacts", "Contatos"]');
    expect(source).toContain("Adicionar endereço completo");
    expect(source).toContain('import { Switch } from "@/components/ui/switch"');
    expect(source).toContain("checked={form.fullAddress}");
    expect(source).toContain('onCheckedChange={(fullAddress) => set("fullAddress", fullAddress)}');
    expect(source).toContain('aria-label="Adicionar endereço completo"');
    expect(source).not.toContain('onChange={(event) => set("fullAddress", event.target.checked)}');
    expect(source).toContain("<CountryCodeSelect");
    expect(source).toContain("embedded");
    expect(source).toContain('type="tel"');
    expect(source).toContain('inputMode="tel"');
    expect(source).toContain(
      "className={`flex h-9 overflow-hidden rounded-md border bg-transparent transition-colors ${errors.phone",
    );
    expect(source).toContain(
      'placeholder={form.countryCode === "55" ? "(00) 00000-0000" : undefined}',
    );
    expect(source).toContain('placeholder="email@exemplo.com"');
    expect(source).toContain('className="sm:col-span-2"');
    expect(source).toContain("https://viacep.com.br/ws/");
    expect(source).toContain('aria-label="Buscar CEP"');
    expect(source).toContain("Visualizar Cliente");
    expect(source).toContain("ticketApi.listCustomerPortalUsers");
    expect(source).toContain("crmApi.createCustomerBranch");
    expect(source).toContain("crmApi.updateCustomerBranch");
    expect(source).toContain("deleteCustomerBranch");
    expect(source).toContain("crmApi.createCustomerDepartment");
    expect(source).toContain("crmApi.updateCustomerDepartment");
    expect(source).toContain("deleteCustomerDepartment");
    const departmentsStart = source.indexOf("function DepartmentsTab(");
    const relationshipStart = source.indexOf("function RelationshipSection(", departmentsStart);
    const departmentsTab = source.slice(departmentsStart, relationshipStart);
    expect(departmentsTab).not.toContain("Gestor");
    expect(departmentsTab).not.toContain("managerContactId");
    expect(source).toContain('className="sm:max-w-[45rem]"');
    expect(source).not.toContain('className="sm:max-w-4xl"');
  });

  it("mostra no cadastro a bolinha com a cor definida para cada situação", () => {
    expect(source).toContain("<InstanceFilterSelect");
    expect(source).toContain("options={STATUS_OPTIONS}");
    expect(source).toContain("showAllOption={false}");
    expect(source).toContain('color: "var(--color-success)"');
    expect(source).toContain('color: "var(--color-info)"');
    expect(source).toContain('color: "var(--color-warning)"');
    expect(source).toContain('color: "var(--color-destructive)"');
    expect(source).toContain('{ value: "PROSPECT", label: "Prospect"');
  });

  it("torna razão social, responsável e e-mail opcionais somente para Prospect", () => {
    expect(source).toContain('const isProspect = form.status === "PROSPECT";');
    expect(source).toContain(
      '!isProspect && form.personType === "LEGAL" && !form.legalName.trim()',
    );
    expect(source).toContain(
      '!isProspect && form.personType === "LEGAL" && !form.responsibleContactName.trim()',
    );
    expect(source).toContain("!isProspect && !form.email.trim()");
    expect(source).toContain('`Razão Social${isProspect ? "" : " *"}`');
    expect(source).toContain('`Responsável${isProspect ? "" : " *"}`');
  });

  it("usa busca centralizada de cidade nas filiais e deriva a UF sem lista fixa", () => {
    const branchForm = source.slice(
      source.indexOf("function BranchFormModal("),
      source.indexOf("function DepartmentsTab("),
    );
    expect(branchForm).toContain("<CityAutocomplete");
    expect(branchForm).toContain("onCitySelect={(selectedCity) =>");
    expect(branchForm).toContain("initialDivision={state}");
    expect(branchForm).toContain('Cidade <span className="text-destructive">*</span>');
    expect(branchForm).toContain("const missingCity = !city.trim() || !state.trim()");
    expect(branchForm).toContain("showRequiredFieldsToast(pendingFields)");
    expect(branchForm).not.toContain("city: city.trim() || null");
    expect(branchForm).not.toContain("STATES.map");
  });

  it("usa toggle S/N com título acima e preenche o número automaticamente", () => {
    expect(source).toContain("const setAddressWithoutNumber = (addressWithoutNumber: boolean) =>");
    expect(source).toContain('addressNumber: addressWithoutNumber\n        ? "SN"');
    expect(source).toContain('className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"');
    expect(source).toContain(
      'className="relative top-2 mb-1.5 block text-center text-xs font-medium text-muted-foreground"',
    );
    expect(source).toContain('className="flex min-h-10 items-center justify-center"');
    expect(source).toContain("onCheckedChange={setAddressWithoutNumber}");
    expect(source).toContain('aria-label="Endereço sem número"');
    expect(source).toContain(
      "sm:grid-cols-[minmax(8.5rem,0.6fr)_minmax(0,2.1fr)_minmax(8rem,0.3fr)]",
    );
    expect(source).toContain('className="grid gap-4 sm:grid-cols-2"');
    expect(source).toContain('className="relative"');
    expect(source).toContain('className={`pl-10 ${validationBorder("zipCode")}`}');
    expect(source).toContain('className="absolute inset-y-0 left-0 flex w-10');
    expect(source).toContain(
      'addressNumber: customer.addressWithoutNumber ? "SN" : (customer.addressNumber ?? "")',
    );
    expect(source).not.toContain('onChange={(event) => set("addressWithoutNumber"');
  });

  it("remove em tempo real os erros de endereço e número depois do preenchimento", () => {
    expect(source).toContain('nextErrors.addressNumber = "Informe o número."');
    expect(source).not.toContain("Informe o número ou marque S/N.");
    expect(source).toContain('satisfiedErrors.add("address")');
    expect(source).toContain('satisfiedErrors.add("addressNumber")');
    expect(source).toContain("keysToClear.forEach((key) => delete next[key])");
  });

  it("bloqueia o salvamento quando faltam campos obrigatórios do cliente e do endereço completo", () => {
    expect(source).toContain('nextErrors.legalName = "Informe a razão social."');
    expect(source).toContain('nextErrors.responsibleContactName = "Informe o responsável."');
    expect(source).toContain('nextErrors.phone = "Informe o telefone."');
    expect(source).toContain('nextErrors.email = "Informe o e-mail."');
    expect(source).toContain('nextErrors.zipCode = "Informe um CEP válido."');
    expect(source).toContain('nextErrors.neighborhood = "Informe o bairro."');
    expect(source).toContain('<Field label="Bairro *">');
    expect(source).toContain('<Field label="Código Postal (CEP) *">');
    expect(source).not.toContain("nextErrors.state");
  });

  it("indica campos obrigatórios com borda vermelha sem mensagens abaixo", () => {
    expect(source).toContain(
      "const validationBorder = (key: string) => requiredFieldClassName(Boolean(errors[key]))",
    );
    expect(source).toContain("aria-invalid={Boolean(errors.name)}");
    expect(source).toContain("aria-invalid={Boolean(errors.email)}");
    expect(source).toContain("aria-invalid={Boolean(errors.zipCode)}");
    expect(source).toContain("aria-invalid={Boolean(errors.address)}");
    expect(source).toContain("aria-invalid={Boolean(errors.addressNumber)}");
    expect(source).toContain("aria-invalid={Boolean(errors.neighborhood)}");
    expect(source).toContain('errorPresentation="border"');
    expect(source).not.toContain("error={errors.name}");
    expect(source).not.toContain("error={errors.neighborhood}");
  });

  it("lista no aviso todos os campos obrigatórios pendentes alinhados à esquerda", () => {
    expect(source).toContain("const REQUIRED_CUSTOMER_FIELDS");
    expect(source).toContain('setErrors(nextErrors);\n      setTab("general");');
    expect(source).toContain("showRequiredFieldsToast(pendingFields)");
    expect(source).toContain("REQUIRED_CUSTOMER_FIELDS.filter(([key]) => nextErrors[key]).map(");
    expect(source).toContain(
      'import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields"',
    );
  });

  it("aplica a lista consolidada e a borda vermelha em todos os formulários de Clientes", () => {
    const contactStart = source.indexOf("function ContactFormModal(");
    const branchStart = source.indexOf("function BranchFormModal(", contactStart);
    const departmentStart = source.indexOf("function DepartmentFormModal(", branchStart);
    const relationshipStart = source.indexOf("function RelationshipSection(", departmentStart);
    const contactForm = source.slice(contactStart, branchStart);
    const branchForm = source.slice(branchStart, departmentStart);
    const departmentForm = source.slice(departmentStart, relationshipStart);

    expect(contactForm).toContain('...(!name.trim() ? ["Nome"] : [])');
    expect(contactForm).toContain('...(onlyDigits(phone).length < 10 ? ["WhatsApp"] : [])');
    expect(contactForm).toContain('["E-mail"] : [])');
    expect(contactForm).toContain("showRequiredFieldsToast(pendingFields)");
    expect(contactForm).toContain("aria-invalid={validationAttempted && !name.trim()}");
    expect(contactForm).toContain(
      "aria-invalid={validationAttempted && onlyDigits(phone).length < 10}",
    );
    expect(contactForm).toContain("validationAttempted && (!email.trim()");

    expect(branchForm).toContain('...(missingName ? ["Nome da filial"] : [])');
    expect(branchForm).toContain('...(missingCity ? ["Cidade"] : [])');
    expect(branchForm).toContain("aria-invalid={nameMissing}");
    expect(branchForm).toContain("invalid={cityMissing}");

    expect(departmentForm).toContain('showRequiredFieldsToast(["Departamento"])');
    expect(departmentForm).toContain("aria-invalid={nameMissing}");
    expect(source).not.toContain('toast.error("Informe o nome do contato.")');
    expect(source).not.toContain('toast.error("Informe o nome da filial.")');
    expect(source).not.toContain('toast.error("Informe o nome do departamento.")');
  });

  it("mantém CPF e CNPJ opcionais e apresenta o CEP com máscara", () => {
    expect(source).toContain('<Field label="CPF">');
    expect(source).toContain('<Field label="CNPJ">');
    expect(source).not.toContain('nextErrors.document = form.personType === "LEGAL"');
    expect(source).toContain("value={maskZipCode(form.zipCode)}");
    expect(source).toContain('zipCode: maskZipCode(customer.postalCode ?? "")');
  });

  it("mantém o rodapé independente dos cards em todos os tamanhos", () => {
    expect(source).toContain('items.length > 0 && viewMode === "cards"');
    expect(source).toContain('className="mt-3 overflow-hidden rounded-xl border border-border"');
  });

  it("permite criar, editar e convidar contatos do cliente", () => {
    expect(source).toContain("crmApi.createContact");
    expect(source).toContain("crmApi.updateContact");
    expect(source).toContain("inviteCustomerContact");
    expect(source).toContain("Salvar e enviar acesso");
    expect(source).toContain("Salvar contato");
    expect(source).toContain("Desativar contato");
    expect(source).toContain("Reativar contato");
    expect(source).toContain("Salvar alterações");
    expect(source).toContain("save(!isEditing && active)");
    expect(source).toContain('className="justify-self-start"');
    expect(source).toContain('value: "COLLABORATOR"');
    expect(source).toContain('value: "MANAGER"');
    expect(source).toContain('value: "FULL_ACCESS"');
    expect(source).toContain('label="WhatsApp *"');
    expect(source).toContain('label="Filial"');
    expect(source).toContain('label="Departamento"');
    expect(source).toContain("const resendInvite = async (contact: ApiContact) =>");
    expect(source).toContain("await ticketApi.inviteCustomerContact(contact.id)");
    expect(source).toContain("Convite reenviado.");
    expect(source).toContain('user.accessStatus !== "ACTIVE"');
    expect(source).toContain("label={`Reenviar convite para ${contact.nome}`}");
    expect(source).toContain("icon={<SendHorizontal />}");
    expect(source).toContain('success ? "action-hover-success" : defaultHoverClass');
    expect(source).toContain("success");
    expect(source).not.toContain("RefreshCw");
    expect(source).toContain("disabled={resendingContactId !== null}");
    expect(source).toContain("linkExistingToCustomer: true");
    expect(source).toContain('saved.lifecycle === "linked"');
    expect(source).toContain("Contato existente vinculado e acesso processado.");
  });

  it("confirma explicitamente antes de transferir um contato entre clientes", () => {
    const formStart = source.indexOf("function ContactFormModal(");
    const branchesStart = source.indexOf("function BranchesTab(", formStart);
    const contactForm = source.slice(formStart, branchesStart);

    expect(source).toContain('error.code !== "CONTACT_CUSTOMER_TRANSFER_REQUIRED"');
    expect(contactForm).toContain('title="Transferir contato?"');
    expect(contactForm).toContain('confirmLabel="Transferir contato"');
    expect(contactForm).toContain('cancelLabel="Cancelar"');
    expect(contactForm).toContain('pendingLabel="Transferindo…"');
    expect(contactForm).toContain("confirmCustomerTransfer: Boolean(transfer)");
    expect(contactForm).toContain("expectedCustomerId: transfer?.expectedCustomerId");
    expect(contactForm).toContain("expectedCustomerId: pendingTransfer.details.currentCustomer.id");
    const createStart = contactForm.indexOf("const createContact = async");
    const saveStart = contactForm.indexOf("const save = async", createStart);
    const createFlow = contactForm.slice(createStart, saveStart);
    expect(createFlow.indexOf("await crmApi.createContact")).toBeLessThan(
      createFlow.indexOf("await completeSave"),
    );
  });

  it("repete o padrão de WhatsApp e e-mail da tela Contatos no modal do cliente", () => {
    const formStart = source.indexOf("function ContactFormModal(");
    const branchesStart = source.indexOf("function BranchesTab(", formStart);
    const contactForm = source.slice(formStart, branchesStart);

    expect(contactForm).toContain('const [countryCode, setCountryCode] = React.useState("55")');
    expect(contactForm).toContain('splitPhoneByCountry(initial?.telefone ?? "")');
    expect(contactForm).toContain("phone: formatPhoneForSubmit(phone, countryCode)");
    expect(contactForm).toContain(
      "className={`flex h-9 overflow-hidden rounded-md border bg-transparent transition-colors ${",
    );
    expect(contactForm).toContain("<CountryCodeSelect");
    expect(contactForm).toContain('type="tel"');
    expect(contactForm).toContain('inputMode="tel"');
    expect(contactForm).toContain('placeholder="email@exemplo.com"');
  });

  it("mostra filial abaixo do nome e perfil de acesso abaixo do login", () => {
    const contactsStart = source.indexOf("function ContactsTab(");
    const legacyContactsStart = source.indexOf("function LegacyContactsTab(", contactsStart);
    const portalUsers = source.slice(contactsStart, legacyContactsStart);

    expect(portalUsers).toContain('<Building2 className="h-3 w-3 shrink-0" />');
    expect(portalUsers).toContain("user.branch?.name");
    expect(portalUsers).toContain('<ShieldCheck className="h-3 w-3 shrink-0" />');
    expect(portalUsers).toContain("customerAccessProfileLabel(user.accessProfile)");
    expect(portalUsers.indexOf("user.branch?.name")).toBeLessThan(
      portalUsers.indexOf("{user.login}"),
    );
    expect(portalUsers.indexOf("{user.login}")).toBeLessThan(
      portalUsers.indexOf("customerAccessProfileLabel(user.accessProfile)"),
    );
  });

  it("amplia somente o modal de contato do cliente em vinte por cento", () => {
    const formStart = source.indexOf("function ContactFormModal(");
    const branchesStart = source.indexOf("function BranchesTab(", formStart);
    const contactForm = source.slice(formStart, branchesStart);

    expect(contactForm).toContain('size="md"');
    expect(contactForm).toContain('className="sm:max-w-[33.6rem]"');
  });

  it("usa o toggle global no início dos formulários de contato e filial", () => {
    const contactStart = source.indexOf("function ContactFormModal(");
    const branchesStart = source.indexOf("function BranchesTab(", contactStart);
    const contactForm = source.slice(contactStart, branchesStart);
    expect(contactForm).toContain('id="customer-contact-active"');
    expect(contactForm).toContain("checked={active}");
    expect(contactForm).toContain("onCheckedChange={setActive}");
    expect(contactForm).toContain("active,");
    expect(contactForm).not.toContain('<p className="text-xs text-muted-foreground">Situação</p>');

    const branchStart = source.indexOf("function BranchFormModal(");
    const departmentsStart = source.indexOf("function DepartmentsTab(", branchStart);
    const branchForm = source.slice(branchStart, departmentsStart);
    expect(branchForm).toContain('id="customer-branch-active"');
    expect(branchForm).toContain('checked={status === "ACTIVE"}');
    expect(branchForm).toContain('setStatus(checked ? "ACTIVE" : "INACTIVE")');
    expect(branchForm.indexOf("<Switch")).toBeLessThan(
      branchForm.indexOf('<Field label="Nome da filial *">'),
    );
    expect(branchForm).not.toContain('<Field label="Situação">');
  });

  it("reflete a situação global do contato na listagem do cliente", () => {
    expect(source).toContain('tone={contact.active === false ? "destructive" : "success"}');
    expect(source).toContain('{contact.active === false ? "Inativo" : "Ativo"}');
  });

  it("redistribui nome e departamento e reduz a coluna de situação dos contatos", () => {
    expect(source).toContain("grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_5.5rem_10rem] gap-x-3");
    expect(source).toContain(
      "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_5.5rem_10rem] lg:items-center lg:gap-x-3",
    );
  });

  it("padroniza a tipografia dos cabeçalhos de filiais, departamentos e contatos", () => {
    expect(source.match(/text-xs uppercase tracking-widest text-muted-foreground/g)).toHaveLength(
      4,
    );
    expect(
      source.match(/bg-surface-1 px-3 py-2 text-xs font-semibold text-muted-foreground/g),
    ).toBeNull();
  });

  it("apresenta a orientação do convite depois dos últimos campos do contato", () => {
    const formStart = source.indexOf("function ContactFormModal(");
    const branchesStart = source.indexOf("function BranchesTab(", formStart);
    const contactForm = source.slice(formStart, branchesStart);
    const departmentField = contactForm.indexOf('<Field label="Departamento">');
    const invitationHint = contactForm.indexOf(
      "O convite permite ao contato ativar o acesso ao portal do cliente.",
    );

    expect(invitationHint).toBeGreaterThan(departmentField);
    expect(contactForm).toContain('className="text-xs text-muted-foreground sm:col-span-2"');
  });

  it("duplica contatos pelo modal e desvincula sem excluir o cadastro global", () => {
    expect(source).toContain("label={`Duplicar contato ${contact.nome}`}");
    expect(source).toContain('mode: "duplicate"');
    expect(source).toContain('forceCreate={formState?.mode === "duplicate"}');
    expect(source).toContain("const isEditing = Boolean(initial) && !forceCreate");
    expect(source).toContain('title="Remover contato?"');
    expect(source).toContain('confirmLabel="Remover"');
    expect(source).toContain(".updateContact(unlinking.id, { customerId: null })");
    expect(source).not.toContain("crmApi.deleteContact(");
    expect(source).toContain(
      '"hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"',
    );
  });

  it("destaca entre aspas o registro nas confirmações destrutivas relacionadas", () => {
    expect(source).toContain('title="Excluir cliente?"');
    expect(source).toContain('title="Excluir filial?"');
    expect(source).toContain('title="Excluir departamento?"');
    expect(source).toContain("Deseja realmente excluir o cliente");
    expect(source).toContain("Deseja realmente excluir a filial");
    expect(source).toContain("Deseja realmente excluir o departamento");
    expect(source).toContain("Os contatos vinculados serão preservados sem empresa.");
    expect(source).toContain('{`"${deleting?.nome ?? "selecionado"}"`}');
    expect(source).not.toContain("será excluída.");
    expect(source).not.toContain("será excluído.");
    expect(
      source.match(/className="font-semibold text-foreground"/g)?.length,
    ).toBeGreaterThanOrEqual(6);
    expect(source).toContain('{`"${unlinking?.nome ?? "selecionado"}"`}');
    expect(source).toContain('{`"${deleting?.name ?? "selecionada"}"`}');
    expect(source).toContain('{`"${deleting?.name ?? "selecionado"}"`}');
  });

  it("mostra o perfil abaixo do nome e reserva espaço para as ações dos contatos", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.15fr)_5.5rem_10rem]");
    expect(source).toContain("customerAccessProfileLabel(contact.customerAccessProfile)");
    expect(source).not.toContain("<span>Perfil</span>");
    expect(source).not.toContain("<span>WhatsApp</span>");
    expect(source).toContain("<span>Departamento</span>");
    expect(source).not.toContain("<span>Departamento · Filial</span>");
    expect(source.match(/<span className="text-center">Ações<\/span>/g)).toHaveLength(4);
    expect(source.match(/className="flex justify-center gap-1"/g)).toHaveLength(4);
    expect(source).toContain('<ShieldCheck className="h-3 w-3 shrink-0" />');
    expect(source).toContain('<Phone className="h-3 w-3 shrink-0" />');
    expect(source).toContain('<Mail className="h-3 w-3 shrink-0" />');
    expect(source).toContain('{contact.email ?? "Sem e-mail"}');
  });

  it("separa contatos comuns dos usuários do portal e aceita cadastro novo sem e-mail", () => {
    expect(source).toContain('queryKey: ["tickets", "customer-portal-users", initial?.id]');
    expect(source).toContain("ticketApi.listCustomerPortalUsers(initial!.id)");
    expect(source).toContain('title="Vincular contato ao portal"');
    expect(source).toContain('placeholder="Pesquisar contato..."');
    expect(source).toContain("<ContactRegistryFormModal");
    expect(source).toContain("defaultCustomerId={customer?.id}");
    expect(source).toContain("lockCustomer");
    expect(source).toContain("const created = await crmApi.createContact");
    expect(source).toContain("login.trim() || data.email?.trim().toLocaleLowerCase");
    expect(source).toContain("choose(created)");
    expect(source).toContain("const invitation = await link(");
    expect(source).toContain("Contato cadastrado, vinculado e convidado para o portal.");
    expect(source).toContain("revokeCustomerPortalUser");
    expect(source).toContain(
      "O contato continuará vinculado ao cliente, mas não poderá mais acessar o portal.",
    );
  });

  it("configura perfil, Filial e Departamento no acesso ao portal", () => {
    const contactsStart = source.indexOf("function ContactsTab(");
    const legacyContactsStart = source.indexOf("function LegacyContactsTab(", contactsStart);
    const contactsTab = source.slice(contactsStart, legacyContactsStart);

    expect(contactsTab).toContain('<Field label="Perfil de acesso *">');
    expect(contactsTab.match(/<Field label="Filial \*">/g)).toHaveLength(2);
    expect(contactsTab).not.toContain("Filial de lotação");
    expect(contactsTab).toContain('profile !== "FULL_ACCESS"');
    expect(contactsTab).toContain('editProfile !== "FULL_ACCESS"');
    expect(contactsTab).toContain("showRequiredFieldsToast(pendingFields)");
    expect(contactsTab).toContain('...(!branchId ? ["Filial"] : [])');
    expect(contactsTab).toContain(
      '...(profile !== "FULL_ACCESS" && !departmentId ? ["Departamento"] : [])',
    );
    expect(contactsTab).toContain('...(!editBranchId ? ["Filial"] : [])');
    expect(contactsTab).toContain(
      '...(editProfile !== "FULL_ACCESS" && !editDepartmentId ? ["Departamento"] : [])',
    );
    expect(source).toContain("function PortalLoginField(");
    expect(source.match(/<InfoTooltip label="Login">/g)).toHaveLength(1);
    expect(contactsTab).toContain('id="customer-portal-login"');
    expect(contactsTab).toContain('id="customer-portal-edit-login"');
    expect(contactsTab.match(/<PortalLoginField/g)).toHaveLength(2);
    expect(contactsTab).not.toContain(
      "Use o e-mail cadastrado no contato ou um login como nome.sobrenome.",
    );
    expect(contactsTab).not.toContain(
      "mt-1.5 flex items-start gap-1.5 text-xs leading-4 text-muted-foreground",
    );
    expect(contactsTab).not.toContain("border border-blue-200 bg-blue-50");
    expect(source).toContain("O e-mail é sugerido automaticamente.");
    expect(source).toMatch(/Você pode substituí-lo por um login como\s+nome\.sobrenome\./);
    expect(contactsTab).toContain("accessProfile: editProfile");
    expect(contactsTab).toContain("active: editActive");
    expect(contactsTab).toContain("customerBranchId: editBranchId");
    expect(contactsTab).toContain(
      'customerDepartmentId: editProfile === "FULL_ACCESS" ? null : editDepartmentId',
    );
    expect(contactsTab).toContain(".inviteCustomerContact(user.contact.id, customer.id)");
    const linkLogin = contactsTab.indexOf('id="customer-portal-login"');
    const linkBranch = contactsTab.indexOf('<Field label="Filial *">', linkLogin);
    const linkProfile = contactsTab.indexOf('<Field label="Perfil de acesso *">', linkBranch);
    const linkDepartment = contactsTab.indexOf('<Field label="Departamento *">', linkProfile);
    expect(linkLogin).toBeLessThan(linkBranch);
    expect(linkBranch).toBeLessThan(linkProfile);
    expect(linkProfile).toBeLessThan(linkDepartment);

    const editModal = contactsTab.indexOf('title="Editar acesso ao portal"');
    const editLogin = contactsTab.indexOf('id="customer-portal-edit-login"', editModal);
    const editBranch = contactsTab.indexOf('<Field label="Filial *">', editLogin);
    const editProfile = contactsTab.indexOf('<Field label="Perfil de acesso *">', editBranch);
    const editDepartment = contactsTab.indexOf('<Field label="Departamento *">', editProfile);
    expect(editLogin).toBeLessThan(editBranch);
    expect(editBranch).toBeLessThan(editProfile);
    expect(editProfile).toBeLessThan(editDepartment);
    const editToggle = contactsTab.indexOf('id="customer-portal-access-active"', editModal);
    const editContact = contactsTab.indexOf('aria-label="Contato vinculado"', editModal);
    expect(editToggle).toBeGreaterThan(editModal);
    expect(editToggle).toBeLessThan(editContact);
    expect(contactsTab).toContain('setEditActive(user.accessStatus !== "DISABLED")');
    expect(contactsTab).toContain('value === "PENDING") return { label: "Link enviado"');
    expect(contactsTab).toContain('value === "EXPIRED") return { label: "Link expirado"');
    expect(contactsTab).toContain("lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8rem_10rem]");
    expect(contactsTab).toContain('className="whitespace-nowrap"');
    expect(contactsTab).toContain("activeBranches.length === 1");
    expect(contactsTab).toContain("activeDepartments.length === 1");
    expect(contactsTab).toContain(
      'setBranchId(activeBranches.length === 1 ? activeBranches[0].id : "")',
    );
    expect(contactsTab).toContain(
      'setDepartmentId(activeDepartments.length === 1 ? activeDepartments[0].id : "")',
    );
    expect(contactsTab).toContain('toast.success("Acesso ao portal desativado.")');
    expect(contactsTab).toContain('toast.success("Acesso ativado e credenciais reenviadas.")');
    expect(contactsTab).toContain(
      'toast.success("Acesso removido e aviso encaminhado pelo WhatsApp.")',
    );
    expect(contactsTab).toContain(
      '"Acesso removido, mas não foi possível encaminhar o aviso pelo WhatsApp."',
    );
  });

  it("destaca em vermelho os campos obrigatórios inválidos nos dois modais do portal", () => {
    const contactsStart = source.indexOf("function ContactsTab(");
    const legacyContactsStart = source.indexOf("function LegacyContactsTab(", contactsStart);
    const contactsTab = source.slice(contactsStart, legacyContactsStart);

    expect(contactsTab).toContain("setLinkValidationVisible(true)");
    expect(contactsTab).toContain("setEditValidationVisible(true)");
    expect(contactsTab).toContain("invalid={linkValidationVisible && !selected}");
    expect(contactsTab).toContain("invalid={linkValidationVisible && login.trim().length < 3}");
    expect(contactsTab).toContain("aria-invalid={linkValidationVisible && !branchId}");
    expect(contactsTab).toContain("aria-invalid={linkValidationVisible && !profile}");
    expect(contactsTab).toContain("aria-invalid={linkValidationVisible && !departmentId}");
    expect(contactsTab).toContain("invalid={editValidationVisible && editLogin.trim().length < 3}");
    expect(contactsTab).toContain("aria-invalid={editValidationVisible && !editBranchId}");
    expect(contactsTab).toContain("aria-invalid={editValidationVisible && !editProfile}");
    expect(contactsTab).toContain("aria-invalid={editValidationVisible && !editDepartmentId}");
    expect(contactsTab).toContain("disabled={saving}");
    expect(contactsTab).toContain("disabled={updatingLogin}");
    expect(contactsTab).not.toContain("disabled={saving || !selected}");
    expect(contactsTab).not.toContain("disabled={updatingLogin || editLogin.trim().length < 3}");
  });

  it("inicia um novo vínculo sem herdar perfil ou lotação legados do contato", () => {
    const contactsStart = source.indexOf("function ContactsTab(");
    const chooseStart = source.indexOf("const choose = (contact: ApiContact) =>", contactsStart);
    const linkStart = source.indexOf("const link = async", chooseStart);
    const choose = source.slice(chooseStart, linkStart);

    expect(choose).toContain('setProfile("COLLABORATOR")');
    expect(choose).toContain(
      'setDepartmentId(activeDepartments.length === 1 ? activeDepartments[0].id : "")',
    );
    expect(choose).toContain(
      'setBranchId(activeBranches.length === 1 ? activeBranches[0].id : "")',
    );
    expect(choose).not.toContain("contact.customerAccessProfile");
    expect(choose).not.toContain("contact.customerDepartmentId");
    expect(choose).not.toContain("contact.customerBranchId");
    expect(choose).toContain('setLogin(contact.email?.trim().toLocaleLowerCase("en-US") ?? "")');
  });

  it("permite selecionar contato classificado em outro cliente para um acesso independente", () => {
    const contactsStart = source.indexOf("function ContactsTab(");
    const legacyContactsStart = source.indexOf("function LegacyContactsTab(", contactsStart);
    const contactsTab = source.slice(contactsStart, legacyContactsStart);

    expect(contactsTab).not.toContain("belongsElsewhere");
    expect(contactsTab).not.toContain("Outro cliente");
    expect(contactsTab).toContain("disabled={alreadyLinked}");
    expect(contactsTab).toContain("Já vinculado");
  });

  it("só apresenta contatos como sugestões dentro da busca após a digitação", () => {
    expect(source).toContain("enabled: linkOpen && resultsOpen && query.trim().length >= 1");
    expect(source).toContain('className="relative flex-1"');
    expect(source).toContain(
      'className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-20 max-h-56 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"',
    );
    expect(source).toContain("setQuery(contact.nome)");
    expect(source).toContain("setResultsOpen(false)");
    expect(source).not.toContain(
      '<div className="max-h-56 overflow-y-auto rounded-lg border border-border">',
    );
  });

  it("preserva e permite editar o contato vinculado no modal de edição do acesso", () => {
    const contactsStart = source.indexOf("function ContactsTab(");
    const legacyContactsStart = source.indexOf("function LegacyContactsTab(", contactsStart);
    const contactsTab = source.slice(contactsStart, legacyContactsStart);
    const editModal = contactsTab.indexOf('title="Editar acesso ao portal"');
    const editContent = contactsTab.slice(editModal);

    expect(editContent).toContain('aria-label="Contato vinculado"');
    expect(editContent).toContain('aria-readonly="true"');
    expect(editContent).toContain('{editing?.contact.name ?? "Contato não identificado"}');
    expect(editContent).toContain('loadingContactDetails ? "Abrindo..." : "Editar"');
    expect(contactsTab).toContain("crmApi.getContact(editing.contact.id)");
    expect(contactsTab).toContain("contactOptions.refetch()");
    expect(contactsTab).toContain("initial={editingContactDetails ?? undefined}");
    expect(contactsTab).toContain("crmApi.updateContact(");
    expect(contactsTab).not.toContain('showRequiredFieldsToast(["E-mail"])');
    expect(contactsTab).toContain(
      'toast.info("Contato cadastrado. Informe o login para liberar o acesso ao portal.")',
    );
    expect(contactsTab).toContain("Contato vinculado e acesso encaminhado pelo WhatsApp.");
    expect(contactsTab).toContain("Acesso encaminhado novamente pelo WhatsApp.");
  });

  it("duplica filiais e departamentos pelo modal sem salvar imediatamente", () => {
    expect(source).toContain("setEditing({ ...item, name: `${item.name} - Cópia` })");
    expect(source.match(/forceCreate=\{forceCreate\}/g)).toHaveLength(2);
    expect(source.match(/const isEditing = Boolean\(initial\) && !forceCreate/g)).toHaveLength(3);
    expect(source).not.toContain('toast.success("Filial duplicada.")');
    expect(source).not.toContain('toast.success("Departamento duplicado.")');
  });

  it("mostra cidade e UF abaixo da filial com o ícone de localização", () => {
    expect(source).toContain("sm:grid-cols-[minmax(0,1fr)_7rem_8rem]");
    expect(source).toContain('<MapPin className="h-3 w-3 shrink-0" />');
    expect(source).toContain('[item.city, item.state].filter(Boolean).join(" - ") || "-"');
    expect(source).not.toContain("<span>Cidade</span>");
    expect(source).not.toContain("<span>UF</span>");
  });
});
