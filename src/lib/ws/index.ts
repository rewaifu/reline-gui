import "./core";
import { endpoint } from "./endpoint";
import { createHub } from "./hub";

export { openConnection } from "./connection";
export type { Connection, ConnectionEvents } from "./connection";
export type { Frame } from "./codec";
export { createHub, WsRequestError } from "./hub";
export type { Hub, RequestOptions, WsFailure } from "./hub";
export { wsMethods } from "./methods";
export type { WsMethod } from "./methods";
export { endpoint, setEndpoint } from "./endpoint";

/** The app's shared connection to the runner: `ls`, and whatever a plugin asks
 * through `wsMethods` / `request`. A run has a connection of its own (it needs
 * to resume a job across drops, see `run-client.ts`). */
export const wsHub = createHub(endpoint);
