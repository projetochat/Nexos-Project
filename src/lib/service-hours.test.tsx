// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
import { GreetingMessageEditor, ServiceHoursTable } from "../routes/instancias";
import { sameServiceHours, serviceHoursError } from "./instance-validation";

describe("service hours editor", () => {
  it("confirms a greeting edit with Enter and preserves Shift+Enter for a new line", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onSubmit = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <GreetingMessageEditor
            value="Olá"
            attachment={null}
            variables={[]}
            disabled={false}
            invalid={false}
            placeholder="Mensagem"
            showAttachment={false}
            onChange={() => {}}
            onSubmit={onSubmit}
          />,
        ),
      );
      const textarea = host.querySelector("textarea")!;
      await act(async () => {
        textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(onSubmit).toHaveBeenCalledOnce();

      await act(async () => {
        textarea.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
        );
      });
      expect(onSubmit).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("shows and clears an inline error while typing, without blur or saving", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Editor() {
      const [rows, setRows] = React.useState([
        {
          day: "Terça",
          active: true,
          periods: [{ id: "terca-1", start: "08:00", end: "18:00" }],
        },
      ]);
      return <ServiceHoursTable rows={rows} onChange={setRows} enabled focusStartSignal={0} />;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Editor />));
      expect(
        Array.from(host.querySelectorAll("colgroup col"), (column) => column.className),
      ).toEqual([
        "w-[20%] sm:w-[30%]",
        "w-[23%] sm:w-[20%]",
        "w-[23%] sm:w-[20%]",
        "w-[34%] sm:w-[30%]",
      ]);
      expect(host.querySelectorAll("thead th")).toHaveLength(4);
      expect(host.querySelector("table")?.className).not.toContain("min-w-[580px]");
      expect(host.querySelector('p[aria-label="Terça"] .sm\\:hidden')?.textContent).toBe("Ter");
      expect(
        host
          .querySelector('[aria-label="Ativar atendimento em Terça"]')
          ?.closest("td")
          ?.querySelector('p[aria-label="Terça"]'),
      ).not.toBeNull();
      const start = host.querySelector<HTMLInputElement>('[aria-label="Início de Terça"]')!;
      const end = host.querySelector<HTMLInputElement>('[aria-label="Fim de Terça"]')!;
      expect(start.closest("td")?.className).toContain("!px-0");
      expect(end.closest("td")?.className).toContain("!px-0");
      expect(start.closest("td")?.className).toContain("sm:!px-2");
      expect(end.closest("td")?.className).toContain("sm:!px-2");
      await act(async () => start.focus());
      const deleteButton = host.querySelector<HTMLButtonElement>(
        '[aria-label="Excluir período 1 de Terça"]',
      )!;
      expect(deleteButton.closest("td")?.className).toContain("!pl-1");
      expect(deleteButton.closest("td")?.className).toContain("!pr-0");
      expect(deleteButton.closest("td")?.className).toContain("sm:!px-2");
      const actionButtons = [
        deleteButton,
        host.querySelector<HTMLButtonElement>(
          '[aria-label="Copiar horários de Terça para todos os dias ativos"]',
        )!,
        host.querySelector<HTMLButtonElement>('[aria-label="Incluir horário em Terça"]')!,
      ];
      for (const actionButton of actionButtons) {
        expect(actionButton.classList.contains("min-h-8")).toBe(true);
        expect(actionButton.classList.contains("px-2.5")).toBe(true);
        expect(actionButton.querySelector("svg")?.classList.contains("h-3.5")).toBe(true);
        expect(actionButton.querySelector("svg")?.classList.contains("w-3.5")).toBe(true);
      }
      const type = async (input: HTMLInputElement, value: string) => {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            input,
            value,
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      };
      await type(start, "18:00");
      const equalAlert = host.querySelector('[role="alert"]');
      expect(equalAlert?.textContent).toContain("diferentes");
      expect(equalAlert?.closest("td")?.colSpan).toBe(3);
      expect(start.getAttribute("aria-invalid")).toBe("true");
      expect(end.getAttribute("aria-invalid")).toBe("true");
      await type(start, "19:00");
      expect(host.querySelector('[role="alert"]')).toBeNull();
      await type(end, "20:00");
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(start.getAttribute("aria-invalid")).toBe("false");
      await type(end, "07:00");
      expect(host.querySelector('[role="alert"]')).toBeNull();
      await act(async () =>
        host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
      );
      expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("inserts an emoji at the cursor before the variables button", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Editor() {
      const [value, setValue] = React.useState("Olá ");
      return (
        <GreetingMessageEditor
          value={value}
          attachment={null}
          variables={[{ token: "{{nome}}", description: "Nome" }]}
          disabled={false}
          invalid={false}
          placeholder="Mensagem"
          showAttachment={false}
          showEmoji
          onChange={(nextValue) => setValue(nextValue)}
        />
      );
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Editor />));
      const textarea = host.querySelector("textarea")!;
      await act(async () => {
        textarea.focus();
        textarea.setSelectionRange(4, 4);
      });
      const emojiButton = host.querySelector<HTMLButtonElement>('[aria-label="Inserir emoji"]')!;
      const variablesButton = host.querySelector<HTMLButtonElement>(
        '[aria-label="Inserir variável"]',
      )!;
      expect(
        emojiButton.compareDocumentPosition(variablesButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        emojiButton.querySelector("svg")?.classList.contains("lucide-face-slightly-smiling-plus"),
      ).toBe(true);
      await act(async () => emojiButton.click());
      expect(document.querySelector('[aria-label="Biblioteca de emojis"]')).not.toBeNull();
      const smilingEmoji = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.getAttribute("aria-label") === "Inserir emoji 😊",
      )!;
      await act(async () => smilingEmoji.click());
      expect(host.querySelector("textarea")?.value).toBe("Olá 😊");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
  it("shows the segmented attachment and audio choices only when requested", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <GreetingMessageEditor
            value="Olá"
            attachment={null}
            variables={[]}
            disabled={false}
            invalid={false}
            placeholder="Mensagem"
            attachmentLayout="segmented"
            onChange={() => {}}
          />,
        ),
      );
      const attachmentMode = host.querySelector<HTMLButtonElement>(
        '[aria-label="Selecionar anexo"]',
      )!;
      const audioMode = host.querySelector<HTMLButtonElement>(
        '[aria-label="Selecionar gravação de áudio"]',
      )!;
      expect(attachmentMode.getAttribute("aria-pressed")).toBe("true");
      expect(host.textContent).toContain("Carregar anexo.");
      expect(host.querySelector('[aria-label="Abrir opções de anexo"]')).toBeNull();

      await act(async () => audioMode.click());
      expect(audioMode.getAttribute("aria-pressed")).toBe("true");
      expect(host.querySelector('[aria-label="Gravar áudio"]')).not.toBeNull();
      expect(host.textContent).toContain("Gravar Áudio");

      await act(async () =>
        root.render(
          <GreetingMessageEditor
            value="Olá"
            attachment={{
              fileName: "audio-123.webm",
              mimeType: "audio/webm",
              size: 123,
              dataUrl: "data:audio/webm;base64,AA==",
            }}
            variables={[]}
            disabled={false}
            invalid={false}
            placeholder="Mensagem"
            attachmentLayout="segmented"
            onChange={() => {}}
          />,
        ),
      );
      expect(host.textContent).toContain("Áudio gravado.");
      expect(host.querySelector('[aria-label="Remover áudio"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
  it("uses the Inbox recording controls in the segmented audio field", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    const originalMediaRecorder = globalThis.MediaRecorder;
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      state: RecordingState = "inactive";
      mimeType = "audio/ogg;codecs=opus";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      start() {
        this.state = "recording";
      }

      pause() {
        this.state = "paused";
      }

      resume() {
        this.state = "recording";
      }

      requestData() {}

      stop() {
        this.state = "inactive";
        this.onstop?.(new Event("stop"));
      }
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: FakeMediaRecorder,
    });

    const onChange = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <GreetingMessageEditor
            value="Olá"
            attachment={null}
            variables={[]}
            disabled={false}
            invalid={false}
            placeholder="Mensagem"
            showEmoji
            attachmentLayout="segmented"
            onChange={onChange}
          />,
        ),
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>('[aria-label="Selecionar gravação de áudio"]')!
          .click(),
      );
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Gravar áudio"]')!.click(),
      );

      expect(getUserMedia).toHaveBeenCalledWith({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      expect(host.textContent).toContain("Gravando áudio");
      expect(host.querySelector('[aria-label="Apagar Gravação"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Pausar gravação"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Encerrar gravação"]')).not.toBeNull();
      const recordingLayout = host.querySelector<HTMLElement>('[data-audio-recording="true"]')!;
      expect(recordingLayout.classList.contains("max-sm:order-2")).toBe(false);
      expect(recordingLayout.classList.contains("max-sm:flex-[1_0_100%]")).toBe(false);
      expect(
        host
          .querySelector<HTMLElement>('[aria-label="Tipo de mídia"]')!
          .classList.contains("max-sm:hidden"),
      ).toBe(false);
      expect(host.querySelector('[aria-label="Selecionar anexo"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Selecionar gravação de áudio"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Inserir emoji"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Inserir variável"]')).not.toBeNull();
      expect(
        host.querySelector<HTMLElement>('[aria-live="polite"]')!.classList.contains("sm:min-h-12"),
      ).toBe(true);

      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Pausar gravação"]')!.click(),
      );
      expect(host.textContent).toContain("Áudio pausado");
      expect(host.querySelector('[aria-label="Continuar gravação"]')).not.toBeNull();

      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Continuar gravação"]')!.click(),
      );
      expect(host.textContent).toContain("Gravando áudio");

      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Apagar Gravação"]')!.click(),
      );
      expect(host.querySelector('[aria-label="Gravar áudio"]')).not.toBeNull();
      expect(stopTrack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      if (mediaDevicesDescriptor) {
        Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "mediaDevices");
      }
      Object.defineProperty(globalThis, "MediaRecorder", {
        configurable: true,
        writable: true,
        value: originalMediaRecorder,
      });
    }
  });
  it("shows a single validation warning in the footer of a day with multiple invalid periods", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <ServiceHoursTable
            rows={[
              {
                day: "Segunda",
                active: true,
                periods: [
                  { id: "segunda-1", start: "24:00", end: "18:00" },
                  { id: "segunda-2", start: "25:00", end: "18:00" },
                ],
              },
            ]}
            onChange={() => {}}
            enabled
            focusStartSignal={0}
          />,
        ),
      );
      const alerts = host.querySelectorAll('[role="alert"]');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toContain("Segunda");
      expect(alerts[0].closest("td")?.colSpan).toBe(3);
      expect(alerts[0].closest("tr")?.previousElementSibling?.textContent).toContain("Segunda");
      const describedBy = host
        .querySelector<HTMLInputElement>('[aria-label="Início de Segunda"]')!
        .getAttribute("aria-describedby");
      expect(describedBy).toBe(alerts[0].id);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
  it("accepts overnight periods and rejects equal endpoints", () => {
    expect(
      serviceHoursError([{ day: "Segunda", active: true, start: "08:00", end: "18:00" }]),
    ).toBe("");
    expect(
      serviceHoursError([{ day: "Segunda", active: true, start: "22:00", end: "02:00" }]),
    ).toBe("");
    expect(
      serviceHoursError([{ day: "Segunda", active: true, start: "08:00", end: "08:00" }]),
    ).toContain("diferentes");
  });
  it("compares saved periods by value instead of JSON property order", () => {
    const expected = [
      {
        day: "Segunda",
        active: true,
        start: "08:00",
        end: "12:00",
        periods: [
          { start: "08:00", end: "12:00" },
          { start: "13:00", end: "18:00" },
        ],
      },
    ];
    const reordered = [
      {
        periods: [
          { end: "12:00", start: "08:00" },
          { end: "18:00", start: "13:00" },
        ],
        end: "12:00",
        start: "08:00",
        active: true,
        day: "Segunda",
      },
    ];
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(expected));
    expect(sameServiceHours(reordered, expected)).toBe(true);
    expect(
      sameServiceHours(
        [{ day: "Segunda", active: true, start: "08:00", end: "12:00" }],
        [{ day: "Segunda", active: true, start: "08:00", end: "12:00" }],
      ),
    ).toBe(true);
  });
  it("focuses and selects the start of the first available day upon activation", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const rows = [
      {
        day: "Segunda",
        active: false,
        periods: [{ id: "segunda-1", start: "08:00", end: "18:00" }],
      },
      {
        day: "Terça",
        active: true,
        periods: [{ id: "terca-1", start: "09:00", end: "17:00" }],
      },
    ];
    try {
      await act(async () =>
        root.render(
          <ServiceHoursTable
            rows={rows}
            onChange={() => {}}
            enabled={false}
            focusStartSignal={0}
          />,
        ),
      );
      await act(async () =>
        root.render(
          <ServiceHoursTable rows={rows} onChange={() => {}} enabled focusStartSignal={1} />,
        ),
      );
      const input = document.activeElement as HTMLInputElement;
      expect(input.getAttribute("aria-label")).toBe("Início de Terça");
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(5);
      expect(scroll).toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });
  it("appends a period from the previous end and leaves its end blank", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Editor() {
      const [rows, setRows] = React.useState([
        {
          day: "Segunda",
          active: true,
          periods: [{ id: "segunda-1", start: "08:00", end: "12:00" }],
        },
      ]);
      return <ServiceHoursTable rows={rows} onChange={setRows} enabled focusStartSignal={0} />;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Editor />));
      await act(async () =>
        host.querySelector<HTMLInputElement>('[aria-label="Fim de Segunda"]')!.focus(),
      );
      const addButton = host.querySelector<HTMLButtonElement>(
        '[aria-label="Incluir horário em Segunda"]',
      )!;
      expect(addButton.className).toContain("hover:text-primary");
      expect(addButton.querySelector("svg")?.getAttribute("class")).toContain(
        "group-hover:text-primary",
      );
      await act(async () => addButton.click());
      expect(
        host.querySelector<HTMLInputElement>('[aria-label="Início do período 2 de Segunda"]')!
          .value,
      ).toBe("12:00");
      expect(
        host.querySelector<HTMLInputElement>('[aria-label="Fim do período 2 de Segunda"]')!.value,
      ).toBe("");
      expect(
        host.querySelector<HTMLInputElement>('[aria-label="Início do período 2 de Segunda"]')!
          .parentElement?.className,
      ).toContain("flex-col");
      expect(
        host.querySelector<HTMLInputElement>('[aria-label="Fim do período 2 de Segunda"]')!
          .parentElement?.className,
      ).toContain("flex-col");
      expect(
        host.querySelector<HTMLButtonElement>('[aria-label="Excluir período 2 de Segunda"]')!
          .parentElement?.className,
      ).toContain("grid-cols-3");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
  it("removes one period and restores the default when the last one is removed", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Editor() {
      const [rows, setRows] = React.useState([
        {
          day: "Segunda",
          active: true,
          periods: [
            { id: "segunda-1", start: "08:00", end: "12:00" },
            { id: "segunda-2", start: "13:00", end: "18:00" },
          ],
        },
      ]);
      return <ServiceHoursTable rows={rows} onChange={setRows} enabled focusStartSignal={0} />;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Editor />));
      await act(async () =>
        host.querySelector<HTMLInputElement>('[aria-label="Fim de Segunda"]')!.focus(),
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>('[aria-label="Excluir período 2 de Segunda"]')!
          .click(),
      );
      expect(host.querySelector('[aria-label="Fim do período 2 de Segunda"]')).toBeNull();
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>('[aria-label="Excluir período 1 de Segunda"]')!
          .click(),
      );
      expect(host.querySelector<HTMLInputElement>('[aria-label="Início de Segunda"]')!.value).toBe(
        "08:00",
      );
      expect(host.querySelector<HTMLInputElement>('[aria-label="Fim de Segunda"]')!.value).toBe(
        "18:00",
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
  it("duplicates every period only to the other active days", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Editor() {
      const [rows, setRows] = React.useState([
        {
          day: "Segunda",
          active: true,
          periods: [
            { id: "segunda-1", start: "08:00", end: "12:00" },
            { id: "segunda-2", start: "13:00", end: "18:00" },
          ],
        },
        {
          day: "Terça",
          active: true,
          periods: [{ id: "terca-1", start: "09:00", end: "17:00" }],
        },
        {
          day: "Quarta",
          active: false,
          periods: [{ id: "quarta-1", start: "10:00", end: "16:00" }],
        },
      ]);
      return <ServiceHoursTable rows={rows} onChange={setRows} enabled focusStartSignal={0} />;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Editor />));
      await act(async () =>
        host.querySelector<HTMLInputElement>('[aria-label="Fim de Segunda"]')!.focus(),
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            '[aria-label="Copiar horários de Segunda para todos os dias ativos"]',
          )!
          .click(),
      );
      expect(
        host.querySelector<HTMLButtonElement>(
          '[aria-label="Copiar horários de Segunda para todos os dias ativos"]',
        )?.title,
      ).toBe("Copiar para todos");
      expect(
        host.querySelector<HTMLInputElement>('[aria-label="Início do período 2 de Terça"]')!.value,
      ).toBe("13:00");
      expect(host.querySelector('[aria-label="Início do período 2 de Quarta"]')).toBeNull();
      expect(host.querySelector<HTMLInputElement>('[aria-label="Início de Quarta"]')!.value).toBe(
        "10:00",
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
