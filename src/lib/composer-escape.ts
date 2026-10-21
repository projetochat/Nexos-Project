export type ComposerEscapeState = {
  managedOverlayOpen: boolean;
  sendInProgress: boolean;
  customOverlayOpen: boolean;
  sequencePending: boolean;
  recording: boolean;
  audioPending: boolean;
  filesPending: boolean;
  quickReplyPending: boolean;
};

export type ComposerEscapeActions = {
  dismissCustomOverlay: () => void;
  cancelSequence: () => void;
  discardRecording: () => void;
  discardAudio: () => void;
  clearFiles: () => void;
  cancelQuickReply: () => void;
  closeConversation: () => void;
};

type EscapeKeyboardEvent = Pick<
  KeyboardEvent,
  "key" | "defaultPrevented" | "preventDefault" | "stopPropagation"
>;

export function textToRestoreAfterQuickReply(currentText: string) {
  return currentText.startsWith("/") ? "" : currentText;
}

/**
 * Cancels at most one composer layer. Managed overlays (Radix menus, popovers
 * and modals) receive Escape first and therefore deliberately short-circuit
 * the pending-send actions below.
 */
export function handleComposerEscape(
  event: EscapeKeyboardEvent,
  state: ComposerEscapeState,
  actions: ComposerEscapeActions,
) {
  if (
    event.key !== "Escape" ||
    event.defaultPrevented ||
    state.managedOverlayOpen ||
    (state.sendInProgress && !state.sequencePending)
  )
    return false;

  let action: (() => void) | null = null;
  if (state.customOverlayOpen) action = actions.dismissCustomOverlay;
  else if (state.sequencePending) action = actions.cancelSequence;
  else if (state.recording) action = actions.discardRecording;
  else if (state.audioPending) action = actions.discardAudio;
  else if (state.filesPending) action = actions.clearFiles;
  else if (state.quickReplyPending) action = actions.cancelQuickReply;
  else action = actions.closeConversation;

  event.preventDefault();
  event.stopPropagation();
  action();
  return true;
}
