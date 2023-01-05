// This is the facade for the worker that will be used in partykit.
// It will be compiled and imported by the CLI.

// @ts-expect-error We'll be replacing __WORKER__ with the path to the input worker
import Worker from "__WORKER__";
import type { WebSocketServer } from "ws";
// this is a node type, careful
import type { IncomingMessage } from "http";

declare const wss: WebSocketServer;
declare const partyRoom: {
  id: string;
  connections: Map<
    string,
    {
      id: string;
      socket: WebSocket;
    }
  >;
};

function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

// The roomId is /party/[roomId]
function getRoomIdFromPathname(pathname: string) {
  // TODO: use a URLPattern here instead
  // TODO: might want to introduce a real router too
  const getRoomId = new RegExp(/\/party\/(.*)/g);
  return getRoomId.exec(pathname)?.[1];
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/party/")) {
    if (
      Worker.unstable_onValidate &&
      typeof Worker.unstable_onValidate === "function"
    ) {
      const isValid = await Worker.unstable_onValidate(request);
      if (typeof isValid !== "boolean") {
        throw new Error(".onValidate() must return a boolean");
      }
      if (!isValid) {
        return new Response("Unauthorized", { status: 401 });
      }
    }
  }
  return new Response("Not found", { status: 404 });
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

if (typeof Worker.onConnect !== "function") {
  throw new Error("onConnect is not a function");
}

wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
  const url = new URL(`http://${request.headers.host}${request.url}`);

  const connectionId = url.searchParams.get("_pk");
  const roomId = getRoomIdFromPathname(url.pathname);

  assert(roomId, "roomId is required");
  assert(connectionId, "_pk is required");

  partyRoom.connections.set(connectionId, {
    id: connectionId,
    socket: ws,
  });

  function closeOrErrorListener() {
    assert(roomId, "roomId is required");
    assert(connectionId, "_pk is required");
    ws.removeEventListener("close", closeOrErrorListener);
    ws.removeEventListener("error", closeOrErrorListener);
    partyRoom.connections.delete(connectionId);
  }

  ws.addEventListener("close", closeOrErrorListener);
  ws.addEventListener("error", closeOrErrorListener);

  Worker.onConnect(ws, partyRoom);
});