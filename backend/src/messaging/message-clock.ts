export const MESSAGE_CLOCK = Symbol("MESSAGE_CLOCK");

export type MessageClock = { now(): Date };

export const SYSTEM_MESSAGE_CLOCK: MessageClock = {
  now: () => new Date(),
};
