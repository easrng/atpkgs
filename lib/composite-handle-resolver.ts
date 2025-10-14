import type { AtprotoDid, Handle } from "@atcute/lexicons/syntax";

import {
  AmbiguousHandleError,
  type HandleResolver,
  type ResolveHandleOptions,
} from "@atcute/identity-resolver";

export type CompositeStrategy = "race" | "all";

export interface CompositeHandleResolverOptions {
  /** controls how the resolution is done, defaults to 'race' */
  strategy?: CompositeStrategy;
  /** the methods to use for resolving the handle. */
  methods: Record<string, HandleResolver>;
}

export class CompositeHandleResolver implements HandleResolver {
  #methods: Record<string, HandleResolver>;
  strategy: CompositeStrategy;

  constructor({ methods, strategy = "race" }: CompositeHandleResolverOptions) {
    this.#methods = methods;
    this.strategy = strategy;
  }

  async resolve(
    handle: Handle,
    options?: ResolveHandleOptions,
  ): Promise<AtprotoDid> {
    const parentSignal = options?.signal;
    const controller = new AbortController();
    if (parentSignal) {
      parentSignal.addEventListener("abort", () => controller.abort(), {
        signal: controller.signal,
      });
    }

    const promises = Object.values(this.#methods).map((e) =>
      e.resolve(handle, {
        ...options,
        signal: controller.signal,
      })
    );

    promises.forEach((e) => e.catch(() => {}));

    switch (this.strategy) {
      case "race": {
        return new Promise((resolve, reject) => {
          let remaining = promises.length;
          for (const promise of promises) {
            promise.then(
              (did) => {
                controller.abort();
                resolve(did);
              },
              (e) => {
                remaining--;
                if (!remaining) {
                  reject(e);
                }
              },
            );
          }
        });
      }
      case "all": {
        const results = await Promise.allSettled(promises);

        const dids = [
          ...new Set(
            results.filter((e) => e.status === "fulfilled").map((e) => e.value),
          ),
        ];

        if (dids.length > 1) {
          throw new AmbiguousHandleError(handle);
        }

        return dids[0]!;
      }
    }
  }
}
