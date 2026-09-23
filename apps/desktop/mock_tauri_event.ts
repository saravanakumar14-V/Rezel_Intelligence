const listeners: Record<string, Function[]> = {};

export async function listen(event: string, handler: Function) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(handler);
  return () => {}; // unlisten
}

export function emit(event: string, payload: any) {
  if (listeners[event]) {
    for (const h of listeners[event]) h({ payload });
  }
}
