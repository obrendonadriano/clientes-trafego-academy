import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

// Token do app mobile, válido só dentro das rotas /api/mobile. O escopo por
// AsyncLocalStorage impede que um header Authorization mude a autenticação de
// qualquer outra rota do site, que continua usando apenas os cookies.
const mobileAuthStorage = new AsyncLocalStorage<{ accessToken: string }>();

export function runWithMobileToken<T>(accessToken: string, run: () => T) {
  return mobileAuthStorage.run({ accessToken }, run);
}

export function getMobileAccessToken() {
  return mobileAuthStorage.getStore()?.accessToken ?? null;
}
