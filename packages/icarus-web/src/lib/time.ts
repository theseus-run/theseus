export const nowMillis = (): number => Date.now();

export const makeLocalId = (prefix = ""): string => `${prefix}${nowMillis()}`;
