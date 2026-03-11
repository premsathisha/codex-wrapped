import type { AIStatsRPC } from "@shared/types";

type BunRequests = AIStatsRPC["bun"]["requests"];
type BunMessages = AIStatsRPC["bun"]["messages"];
type WebviewMessages = AIStatsRPC["webview"]["messages"];

type MessageName = keyof WebviewMessages;
type MessageListener<K extends MessageName> = (payload: WebviewMessages[K]) => void;

type WrappedRPCRequests = Pick<BunRequests, "getDashboardSummary" | "getDailyTimeline">;
export type RPCRequestName = keyof WrappedRPCRequests;
export type RPCRequestParams<K extends RPCRequestName> = WrappedRPCRequests[K]["params"];
export type RPCRequestResponse<K extends RPCRequestName> = WrappedRPCRequests[K]["response"];

const endpointByRequest: { [K in keyof BunRequests]: string } = {
  getDashboardSummary: "/api/getDashboardSummary",
  getDailyTimeline: "/api/getDailyTimeline",
  triggerScan: "/api/triggerScan",
  getScanStatus: "/api/getScanStatus",
  getTrayStats: "/api/getTrayStats",
  getSettings: "/api/getSettings",
  exportFullSharePdf: "/api/exportFullSharePdf",
  updateSettings: "/api/updateSettings",
};

const endpointByMessage: { [K in keyof BunMessages]: string } = {
  log: "/api/log",
  openExternal: "/api/openExternal",
};

const listeners = new Map<MessageName, Set<(payload: unknown) => void>>();
let eventSource: EventSource | null = null;
const toError = async (response: Response): Promise<Error> => {

  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) {
      return new Error(body.error);
    }
  } catch {
    // Ignore JSON parse failures.
  }
  return new Error(`Request failed with status ${response.status}`);
};

const postJson = async <Input, Output>(url: string, payload: Input): Promise<Output> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return (await response.json()) as Output;
};

const getJson = async <Output>(url: string): Promise<Output> => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return (await response.json()) as Output;
};

const emitMessage = (name: MessageName, payload: unknown) => {
  const group = listeners.get(name);
  if (!group) return;
  for (const listener of group) {
    listener(payload);
  }
};

const ensureEventStream = (): void => {
  if (eventSource) return;
  eventSource = new EventSource("/api/events");

  const bind = <K extends MessageName>(name: K) => {
    eventSource?.addEventListener(name, (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as WebviewMessages[K];
        emitMessage(name, parsed);
      } catch {
        // Ignore malformed event payloads.
      }
    });
  };

  bind("sessionsUpdated");
  bind("scanStarted");
  bind("scanCompleted");
  bind("navigate");
  bind("themeChanged");

  eventSource.addEventListener("error", () => {
    // Browser reconnects automatically. Keep listeners alive.
  });
};

const rpc = {
  request: {
    getDashboardSummary: (params: BunRequests["getDashboardSummary"]["params"]) =>
      postJson<typeof params, BunRequests["getDashboardSummary"]["response"]>(
        endpointByRequest.getDashboardSummary,
        params,
      ),
    getDailyTimeline: (params: BunRequests["getDailyTimeline"]["params"]) =>
      postJson<typeof params, BunRequests["getDailyTimeline"]["response"]>(
        endpointByRequest.getDailyTimeline,
        params,
      ),
    triggerScan: (params: BunRequests["triggerScan"]["params"]) =>
      postJson<typeof params, BunRequests["triggerScan"]["response"]>(endpointByRequest.triggerScan, params),
    getScanStatus: (_params: BunRequests["getScanStatus"]["params"]) =>
      getJson<BunRequests["getScanStatus"]["response"]>(endpointByRequest.getScanStatus),
    getTrayStats: (_params: BunRequests["getTrayStats"]["params"]) =>
      getJson<BunRequests["getTrayStats"]["response"]>(endpointByRequest.getTrayStats),
    getSettings: (_params: BunRequests["getSettings"]["params"]) =>
      getJson<BunRequests["getSettings"]["response"]>(endpointByRequest.getSettings),
    exportFullSharePdf: (params: BunRequests["exportFullSharePdf"]["params"]) =>
      postJson<typeof params, BunRequests["exportFullSharePdf"]["response"]>(
        endpointByRequest.exportFullSharePdf,
        params,
      ),
    updateSettings: (params: BunRequests["updateSettings"]["params"]) =>
      postJson<typeof params, BunRequests["updateSettings"]["response"]>(
        endpointByRequest.updateSettings,
        params,
      ),
  },
  send: {
    openExternal: (payload: BunMessages["openExternal"]) =>
      postJson<typeof payload, { ok: boolean }>(endpointByMessage.openExternal, payload),
    log: (payload: BunMessages["log"]) =>
      postJson<typeof payload, { ok: boolean }>(endpointByMessage.log, payload),
  },
  addMessageListener: <K extends MessageName>(name: K, listener: MessageListener<K>) => {
    ensureEventStream();
    const existing = listeners.get(name) ?? new Set<(payload: unknown) => void>();
    existing.add(listener as (payload: unknown) => void);
    listeners.set(name, existing);
  },
  removeMessageListener: <K extends MessageName>(name: K, listener: MessageListener<K>) => {
    const existing = listeners.get(name);
    if (!existing) return;
    existing.delete(listener as (payload: unknown) => void);
    if (existing.size === 0) {
      listeners.delete(name);
    }
  },
};

export const rpcRequest = <K extends RPCRequestName>(
  method: K,
  params: RPCRequestParams<K>,
): Promise<RPCRequestResponse<K>> => {
  const requestFn = rpc.request[method] as (
    input: RPCRequestParams<K>,
  ) => Promise<RPCRequestResponse<K>>;
  return requestFn(params);
};

export const useRPC = () => rpc;
