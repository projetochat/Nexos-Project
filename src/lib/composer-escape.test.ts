import { describe, expect, it, vi } from "vitest";
import {
  handleComposerEscape,
  textToRestoreAfterQuickReply,
  type ComposerEscapeActions,
  type ComposerEscapeState,
} from "./composer-escape";

function setup(overrides: Partial<ComposerEscapeState> = {}) {
  let defaultPrevented = false;
  const stopPropagation = vi.fn();
  const event = {
    key: "Escape",
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault: vi.fn(() => {
      defaultPrevented = true;
    }),
    stopPropagation,
  };
  const actions: ComposerEscapeActions = {
    dismissCustomOverlay: vi.fn(),
    cancelSequence: vi.fn(),
    discardRecording: vi.fn(),
    discardAudio: vi.fn(),
    clearFiles: vi.fn(),
    cancelQuickReply: vi.fn(),
    closeConversation: vi.fn(),
  };
  const state: ComposerEscapeState = {
    managedOverlayOpen: false,
    sendInProgress: false,
    customOverlayOpen: false,
    sequencePending: false,
    recording: false,
    audioPending: false,
    filesPending: false,
    quickReplyPending: false,
    ...overrides,
  };
  return { event, actions, state, stopPropagation };
}

describe("Escape no compositor", () => {
  it("preserva texto independente ao preparar uma mensagem rápida", () => {
    expect(textToRestoreAfterQuickReply("texto do atendente")).toBe("texto do atendente");
  });

  it("não restaura o atalho que pertence à mensagem rápida cancelada", () => {
    expect(textToRestoreAfterQuickReply("/boasvindas")).toBe("");
  });

  it.each([
    ["sequência", { sequencePending: true }, "cancelSequence"],
    ["gravação", { recording: true }, "discardRecording"],
    ["áudio pronto", { audioPending: true }, "discardAudio"],
    ["anexos", { filesPending: true }, "clearFiles"],
    ["mensagem rápida", { quickReplyPending: true }, "cancelQuickReply"],
  ] as const)("cancela %s e consome a tecla", (_label, pending, expectedAction) => {
    const { event, actions, state, stopPropagation } = setup(pending);

    expect(handleComposerEscape(event, state, actions)).toBe(true);
    expect(actions[expectedAction]).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("respeita a camada superior sem cancelar a preparação", () => {
    const { event, actions, state } = setup({
      managedOverlayOpen: true,
      sequencePending: true,
      recording: true,
      audioPending: true,
      filesPending: true,
      quickReplyPending: true,
    });

    expect(handleComposerEscape(event, state, actions)).toBe(false);
    Object.values(actions).forEach((action) => expect(action).not.toHaveBeenCalled());
    expect(event.defaultPrevented).toBe(false);
  });

  it("fecha somente o menu próprio antes de qualquer pendência", () => {
    const { event, actions, state } = setup({
      customOverlayOpen: true,
      filesPending: true,
      quickReplyPending: true,
    });

    expect(handleComposerEscape(event, state, actions)).toBe(true);
    expect(actions.dismissCustomOverlay).toHaveBeenCalledOnce();
    expect(actions.clearFiles).not.toHaveBeenCalled();
    expect(actions.cancelQuickReply).not.toHaveBeenCalled();
  });

  it("não faz cascata quando há mais de uma pendência", () => {
    const { event, actions, state } = setup({
      recording: true,
      audioPending: true,
      filesPending: true,
      quickReplyPending: true,
    });

    handleComposerEscape(event, state, actions);

    expect(actions.discardRecording).toHaveBeenCalledOnce();
    expect(actions.discardAudio).not.toHaveBeenCalled();
    expect(actions.clearFiles).not.toHaveBeenCalled();
    expect(actions.cancelQuickReply).not.toHaveBeenCalled();
  });

  it("fecha a conversa com ESC quando não há uma camada pendente", () => {
    const { event, actions, state } = setup();

    expect(handleComposerEscape(event, state, actions)).toBe(true);
    expect(actions.closeConversation).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("não interfere com mídia cujo envio já começou", () => {
    const { event, actions, state } = setup({ sendInProgress: true, filesPending: true });

    expect(handleComposerEscape(event, state, actions)).toBe(false);
    expect(actions.clearFiles).not.toHaveBeenCalled();
    expect(actions.closeConversation).not.toHaveBeenCalled();
  });
});
