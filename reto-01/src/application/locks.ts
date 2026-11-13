const locks = new Map<string, Promise<void>>();

export async function withCaseLock<T>(directory: string, name: string, action: () => Promise<T>): Promise<T> {
  const key = `${directory}\0${name}`;
  const previous = locks.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const lock = new Promise<void>(resolve => { release = resolve; });
  locks.set(key, lock);
  await previous;
  try {
    return await action();
  } finally {
    if (locks.get(key) === lock) locks.delete(key);
    release();
  }
}
