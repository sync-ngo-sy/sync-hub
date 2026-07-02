export type ChatTurn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; response: AgentResponse };

import type { AgentResponse } from "@/lib/contracts";

export type ChatStoreState = {
  messages: ChatTurn[];
  question: string;
  resolvedCandidateIds: string[];
  loadingAnswer: boolean;
  error: string | null;
  hasUnreadResponse: boolean;
};

export const chatStore: {
  state: ChatStoreState;
  listeners: Set<() => void>;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ChatStoreState;
  update: (next: Partial<ChatStoreState>) => void;
} = {
  state: {
    messages: [],
    question: "",
    resolvedCandidateIds: [],
    loadingAnswer: false,
    error: null,
    hasUnreadResponse: false,
  },
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    chatStore.listeners.add(listener);
    return () => {
      chatStore.listeners.delete(listener);
    };
  },
  getSnapshot(): ChatStoreState {
    return chatStore.state;
  },
  update(next: Partial<ChatStoreState>) {
    chatStore.state = { ...chatStore.state, ...next };
    chatStore.listeners.forEach((l: () => void) => l());
  },
};
