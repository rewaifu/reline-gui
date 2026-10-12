import { decode, encode } from "notepack.io";

/** One WebSocket frame, `WS_API.md` "Конверт": the method name, the id of the
 * request (clients count up; events carry the id of the run) and a payload map. */
export interface Frame {
  m: string;
  id?: number;
  d?: Record<string, unknown>;
}

/** MessagePack bytes of a frame. */
export const encodeFrame = (frame: Frame): Uint8Array<ArrayBuffer> =>
  // notepack allocates a plain buffer; its type just does not say so
  encode(frame) as Uint8Array<ArrayBuffer>;

/** The frame in a binary message (`binaryType = "arraybuffer"`), or
 * `undefined` for bytes that are not a MessagePack map with a method name. */
export const decodeFrame = (data: ArrayBuffer): Frame | undefined => {
  try {
    const frame = decode(new Uint8Array(data)) as Frame | null;
    return typeof frame === "object" &&
      frame !== null &&
      typeof frame.m === "string"
      ? frame
      : undefined;
  } catch {
    return undefined;
  }
};
