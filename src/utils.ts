// Copyright (c) 2024 Antmicro <www.antmicro.com>
//
// SPDX-License-Identifier: Apache-2.0

import WebSocket from 'isomorphic-ws';

// Binds all event handlers to their respected events,
// but unbinds all of them once any of those events happens.
//
// Useful for, e.g. when there's multiple possible responses
// to an event yet we only care about the first one that shows up.
//
// Example: See usage in `tryConnectWs`
export function eventSelect(target: any, handlers: { [event: string]: any }) {
  let realHandlers = Object.entries(handlers).map(
    ([ev, handler]): [string, any] => [
      ev,
      (...args: any[]) => {
        handler(...args);
        for (const [ev, realHandler] of realHandlers) {
          target.removeEventListener(ev, realHandler);
        }
      },
    ],
  );

  for (const [ev, realHandler] of realHandlers) {
    target.addEventListener(ev, realHandler);
  }
}

export function tryJsonParse(input: string): object | string {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function tryConnectWs(uri: string): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(uri);

    eventSelect(socket, {
      open: () => resolve(socket),
      error: () => reject('Error while connecting'),
      close: () => reject('Could not connect'),
    });
  });
}

export function assert(condition: any, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}
