import type * as Utils from '../../utils';

export type ComparableSnapshot = ReturnType<typeof Utils.buildWorkspaceComparableSnapshot>;

export type Updater<T> = T | ((current: T) => T);

export function resolveUpdater<T>(current: T, next: Updater<T>) {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
}
