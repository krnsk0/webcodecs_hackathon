export const log = (prefix: string, ...args: unknown[]) => {
  console.log(`[${Date.now().toFixed(0).slice(-5)}][${prefix}]`, ...args);
};
