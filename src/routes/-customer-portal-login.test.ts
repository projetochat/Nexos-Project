import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const portalSource = readFileSync(new URL("./login_.portal-cliente.tsx", import.meta.url), "utf8");
const internalSource = readFileSync(new URL("./login.tsx", import.meta.url), "utf8");
const routeTreeSource = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");
const portalTicketsSource = readFileSync(
  new URL("./portal-cliente_.chamados.tsx", import.meta.url),
  "utf8",
);

describe("login exclusivo do Portal do Cliente", () => {
  it("possui rota, conteúdo e campos próprios do portal", () => {
    expect(portalSource).toContain('createFileRoute("/login_/portal-cliente")');
    expect(routeTreeSource).toContain("path: '/login/portal-cliente'");
    expect(portalSource).toContain("Bem-vindo ao");
    expect(portalSource).toContain("Portal do Cliente");
    expect(portalSource).toContain('<PortalField label="Login" htmlFor="portal-login">');
    expect(portalSource).toContain('placeholder="Informe seu usuário"');
    expect(portalSource).toContain("Entrar no Portal");
    expect(portalSource).toContain("V 1.0");
    expect(portalSource).not.toContain("Ambiente seguro e exclusivo para clientes TRIXUS.");
    expect(portalSource).toContain("signInCustomerPortal");
    expect(portalSource).toContain("selectCustomerPortal");
    expect(portalSource).toContain("setError(message);");
    expect(portalSource).not.toContain("toast.error(message);");
  });

  it("usa apresentação própria, responsiva e ícones Lucide", () => {
    expect(portalSource).toContain("lg:grid-cols-");
    expect(portalSource).toContain("min-h-dvh");
    expect(portalSource).toContain("Headphones");
    expect(portalSource).toContain("ClipboardList");
    expect(portalSource).toContain("BarChart3");
    expect(portalSource).toContain("EyeOff");
    expect(portalSource).toContain(
      'className="mt-4 hidden max-w-xl text-base leading-relaxed text-slate-600 sm:block sm:text-lg"',
    );
    expect(portalSource).toContain(
      'className="mx-auto mb-6 h-auto w-44 object-contain sm:w-52 lg:mx-0 lg:mb-10 lg:w-64"',
    );
    expect(portalSource).toContain(
      'className="mt-7 hidden max-w-xl grid-cols-3 gap-3 sm:grid sm:gap-5 lg:mt-10"',
    );
    expect(portalSource).toContain("content-start items-start gap-3 px-5 pb-8 pt-20");
    expect(portalSource).not.toContain(
      "Entre com as credenciais vinculadas ao seu acesso externo.",
    );
  });

  it("usa no convite a tela centralizada de ativação aprovada", () => {
    expect(portalSource).toContain("function CustomerPortalActivationPage(");
    expect(portalSource).toContain("Ativar meu acesso");
    expect(portalSource).toContain("Você recebeu um convite para o portal da");
    expect(portalSource).toContain('<ActivationInfoRow icon={UserRound} label="Nome"');
    expect(portalSource).toContain('<ActivationInfoRow icon={AtSign} label="Login"');
    expect(portalSource).toContain("value={activationLogin(preview)}");
    expect(portalSource).toContain("icon={BadgeCheck}");
    expect(portalSource).toContain('label="Perfil"');
    expect(portalSource).toContain("value={activationProfileLabel(preview.profile)}");
    expect(portalSource).toContain('COLLABORATOR: "Colaborador"');
    expect(portalSource).toContain('MANAGER: "Gerente"');
    expect(portalSource).toContain('FULL_ACCESS: "Acesso Full"');
    expect(portalSource).toContain('label="Departamento"');
    expect(portalSource).toContain('label="Filial"');
    expect(portalSource).toContain("Após ativar, você poderá abrir e acompanhar seus chamados.");
    expect(portalSource).toContain(
      'className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-white',
    );
    expect(portalSource).toContain("max-w-[466px]");
  });

  it("mantém o login administrativo sem conteúdo ou credenciais do portal", () => {
    expect(internalSource).toContain('createFileRoute("/login")');
    expect(internalSource).toContain(">\n                    E-mail\n                  </label>");
    expect(internalSource).toContain('placeholder="email@exemplo.com"');
    expect(internalSource).not.toContain("signInCustomerPortal");
    expect(internalSource).not.toContain("Entrar no Portal");
  });

  it("direciona o portal para uma rota exclusiva que reutiliza a tela de chamados", () => {
    expect(portalSource).toContain("CUSTOMER_PORTAL_TICKETS_PATH");
    expect(portalSource).not.toContain('to: "/chamados"');
    expect(portalTicketsSource).toContain('createFileRoute("/portal-cliente_/chamados")');
    expect(portalTicketsSource).toContain(
      '<ChamadosPage mode="customer_portal" search={Route.useSearch()} />',
    );
    expect(routeTreeSource).toContain("path: '/portal-cliente/chamados'");
  });
});
