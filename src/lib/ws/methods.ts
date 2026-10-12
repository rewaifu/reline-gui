import * as v from "valibot";

/**
 * A request/response method of the runner protocol, declared once: its wire
 * name, what a request may carry and what a reply must look like. The hub
 * checks both sides, so a plugin that asks for the wrong thing — or a runner
 * that answers with something else — fails with a readable error at the call
 * instead of a malformed value deep inside the UI.
 */
export interface WsMethod<Req = Record<string, unknown>, Res = unknown> {
  /** Wire name. Core methods are bare (`ls`); a plugin's are `x.<plugin>.<name>`. */
  name: string;
  /** Method name of the reply when it differs from the request's. */
  reply?: string;
  request?: v.GenericSchema<Req>;
  response?: v.GenericSchema<Res>;
  /** How long to wait for the reply. Default 17 s. */
  timeoutMs?: number;
}

type Dispose = () => void;

const methods = new Map<string, WsMethod<never, unknown>>();

export const wsMethods = {
  /** Declare a method. Defining a name again replaces it; the disposer removes
   * it only if it is still the definition this call put there. */
  define<Req, Res>(method: WsMethod<Req, Res>): Dispose {
    const stored = method as unknown as WsMethod<never, unknown>;
    methods.set(method.name, stored);
    return () => {
      if (methods.get(method.name) === stored) methods.delete(method.name);
    };
  },

  get(name: string): WsMethod<never, unknown> | undefined {
    return methods.get(name);
  },

  list(): string[] {
    return [...methods.keys()];
  },
};
