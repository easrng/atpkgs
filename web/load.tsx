import type { ComponentChildren } from "preact";
import { lazy } from "preact-iso";
import { useErrorBoundary, useId, useRef, useState } from "preact/hooks";
import { Loader } from "./components/Loader";
import { ErrorPage } from "./pages/Error";
import { type SessionData, useSession } from ".";
import { useLocation } from "./router";
import isNetworkError from "is-network-error";

export type AsyncComponent<P> =
  & { _asyncComponent: true; _errorWrap: true }
  & ((
    props: P,
  ) => ComponentChildren);

export function async<P extends object>(
  loader: (
    props: {
      $session: SessionData;
      $route: (url: string, replace: boolean) => void;
    } & Omit<P, "$session" | "$route">,
  ) => PromiseLike<
    | ComponentChildren
    | ((
      props: {
        $session: SessionData;
        $route: (url: string, replace: boolean) => void;
      } & P,
    ) => ComponentChildren)
  >,
): AsyncComponent<P> {
  const fn = Object.assign(
    errorWrap(function Wrapper(inputProps: P) {
      const [loading, setLoading] = useState(true);
      const props = {
        ...inputProps,
        $session: useSession(),
        $route: useLocation().route,
      };
      const state = useRef<{
        deps: Set<string>;
        prev: Record<string, unknown>;
        comp: (props: P) => ComponentChildren;
      }>(null);
      let revalidate = false;
      if (!state.current) {
        state.current = {
          prev: props as Record<string, unknown>,
          deps: new Set<string>(),
          comp: () => null,
        };
        revalidate = true;
      } else {
        for (const k in state.current.deps) {
          if (state.current.prev[k] !== (props as Record<string, unknown>)[k]) {
            revalidate = true;
            break;
          }
        }
      }
      if (revalidate) {
        state.current.deps.clear();
        state.current.comp = lazy(
          async (): Promise<(props: P) => ComponentChildren> => {
            try {
              const data = await loader(
                new Proxy(props, {
                  get(o, k) {
                    if (typeof k === "string") state.current!.deps.add(k);
                    return (props as Record<PropertyKey, unknown>)[k];
                  },
                }),
              );
              setLoading(false);
              return typeof data === "function"
                ? (data as (props: P) => ComponentChildren)
                : () => data;
            } catch (e) {
              setLoading(false);
              return () => {
                throw e;
              };
            }
          },
        );
      }
      return (
        <>
          <div style="display:contents">
            <Loader loading={loading} />
          </div>
          <state.current.comp {...props} />
        </>
      );
    }),
    { _asyncComponent: true as const },
  );
  return fn;
}

export type ErrorWrappedComponent<P extends object> =
  & { _errorWrap: true }
  & ((
    props: P,
  ) => ComponentChildren);
export function errorWrap<P extends object>(
  Component: (props: P) => ComponentChildren,
): ErrorWrappedComponent<P> {
  return Object.assign(
    (props: P) => {
      const [error] = useErrorBoundary();
      return error
        ? (
          <ErrorPage
            title={isNetworkError(error)
              ? "Network Error"
              : error instanceof Error
              ? error.name.replace(/(?<!O(?=Auth))(?=[A-Z][a-z])/g, " ")
                .replaceAll("Did ", "DID ")
              : "Error"}
            subtitle={error instanceof Error ? error.message : error + ""}
          />
        )
        : <Component {...props} />;
    },
    {
      _errorWrap: true as const,
    },
  );
}
