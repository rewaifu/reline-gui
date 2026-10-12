/**
 * Heartbeat contract shared by every WebSocket client (WS_API.md): echo
 * every 5 s so proxies/NAT do not drop an idle socket; no echo reply for
 * 15 s = the peer is gone, drop the socket ourselves.
 *
 * Both constants live in one module so the two clients cannot drift: the
 * interval must stay strictly below the timeout, or an idle-but-healthy
 * connection is closed by its own watchdog.
 */
export const ECHO_INTERVAL_MS = 5000;
export const ECHO_TIMEOUT_MS = 15000;

/** How long `stop` may go unconfirmed before the UI forces itself back to idle. */
export const STOP_WATCHDOG_MS = 5000;
