// @ts-check
import { cloneElement, createContext, Fragment, h, toChildArray } from "preact";
import {
  useContext,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "preact/hooks";

/**
 * @template T
 * @typedef {import('preact').RefObject<T>} RefObject
 * @typedef {import('preact').VNode} VNode
 */

/** @type {boolean | undefined} */
let push;
/** @type {string | RegExp | undefined} */
let scope;

/**
 * @param {string} href
 * @returns {boolean}
 */
function isInScope(href) {
  return (
    !scope ||
    (typeof scope == "string" ? href.startsWith(scope) : scope.test(href))
  );
}

/**
 * @param {string} state
 * @param {MouseEvent | PopStateEvent | { url: string, replace?: boolean }} action
 */
function handleNav(state, action) {
  let url = "";
  push = undefined;
  if (action && "ctrlKey" in action && action.type === "click") {
    // ignore events the browser takes care of already:
    if (
      action.ctrlKey ||
      action.metaKey ||
      action.altKey ||
      action.shiftKey ||
      action.button !== 0
    ) {
      return state;
    }

    const link = /** @type {HTMLAnchorElement} */ (
        /** @type {any[]} */ (action.composedPath()).find(
          (el) => el.nodeName == "A" && el.href,
        )
      ),
      href = link && link.getAttribute("href");
    if (
      !href ||
      link.origin != location.origin ||
      /^#/.test(href) ||
      !/^(_?self)?$/i.test(link.target) ||
      !isInScope(href)
    ) {
      return state;
    }

    push = true;
    action.preventDefault();
    url = link.href.replace(location.origin, "");
  } else if (action && "url" in action) {
    push = !action.replace;
    url = action.url;
  } else {
    url = location.pathname + location.search;
  }

  if (push === true) history.pushState(null, "", url);
  else if (push === false) history.replaceState(null, "", url);
  return url;
}

/** @type {(url: string, route: string, matches: import('preact-iso').MatchProps) => (undefined | import('preact-iso').MatchProps)} */
export const exec = (inurl, inroute, matches) => {
  const url = inurl.split("/").filter(Boolean);
  const route = (inroute || "").split("/").filter(Boolean);
  if (!matches.params) matches.params = {};
  for (let i = 0, val, rest; i < Math.max(url.length, route.length); i++) {
    let [, m, param, flag] = (route[i] || "").match(/^(:?)(.*?)([+*?]?)$/) ||
      [];
    val = url[i];
    // segment match:
    if (!m && param == val) continue;
    // /foo/* match
    if (!m && val && flag == "*") {
      matches.rest = "/" + url.slice(i).map(decodeURIComponent).join("/");
      break;
    }
    // segment mismatch / missing required field
    if (!m || (!val && flag != "?" && flag != "*")) return;
    rest = flag == "+" || flag == "*";
    // rest (+/*) match:
    if (rest) val = url.slice(i).map(decodeURIComponent).join("/") || undefined;
    // normal/optional field:
    else if (val) val = decodeURIComponent(val);
    param ??= "";
    matches.params[param] = val ?? "";
    if (!(param in matches)) matches[param] = val;
    if (rest) break;
  }
  return matches;
};

/**
 * @param {Object} props
 * @param {string | RegExp} [props.scope]
 * @param {import('preact').ComponentChildren} [props.children]
 */
export function LocationProvider(props) {
  const [url, route] = useReducer(
    handleNav,
    location.pathname + location.search,
  );
  if (props.scope) scope = props.scope;
  const wasPush = push === true;

  const value = useMemo(() => {
    const u = new URL(url, location.origin);
    const path = u.pathname.replace(/\/+$/g, "") || "/";
    return {
      url,
      path,
      query: Object.fromEntries(u.searchParams),
      route: (/** @type {string} */ url, /** @type {boolean} */ replace) =>
        route({ url, replace }),
      wasPush,
    };
  }, [url]);

  useLayoutEffect(() => {
    addEventListener("click", route);
    addEventListener("popstate", route);

    return () => {
      removeEventListener("click", route);
      removeEventListener("popstate", route);
    };
  }, []);

  // @ts-ignore
  return h(LocationProvider.ctx.Provider, { value }, props.children);
}

const RESOLVED = Promise.resolve();
const EMPTY = h(Fragment, null);

/** @type {(props: {
	onRouteChange?: (url: string) => void;
	onLoadEnd?: (url: string) => void;
	onLoadStart?: (url: string) => void;
	children: Array<import('preact').VNode>;
})=> import('preact').VNode} */
export function Router(props) {
  const [c, update] = useReducer((c) => c + 1, 0);

  const { url, query, wasPush, path } = useLocation();
  if (!url) {
    throw new Error(
      `preact-iso's <Router> must be used within a <LocationProvider>, see: https://github.com/preactjs/preact-iso#locationprovider`,
    );
  }
  const { rest = path, params = {} } = useContext(RouteContext);

  const isLoading = useRef(false);
  const prevRoute = useRef(path);
  // Monotonic counter used to check if an un-suspending route is still the current route:
  const count = useRef(0);
  // The current route:
  const cur = /** @type {{current:VNode<any>}} */ (useRef());
  // Previous route (if current route is suspended):
  const prev = /** @type {{current:{first:boolean;node: VNode<any>}}} */ (
    useRef({ first: true, node: EMPTY })
  );
  // A not-yet-hydrated DOM root to remove once we commit:
  const pendingBase = /** @type {RefObject<Element | Text>} */ (useRef());
  // has this component ever successfully rendered without suspending:
  const hasEverCommitted = useRef(false);
  // was the most recent render successful (did not suspend):
  const didSuspend = /** @type {RefObject<boolean>} */ (useRef());

  let /** @type {import('preact').VNode | undefined} */ pathRoute,
    /** @type {import('preact').VNode | undefined} */ defaultRoute,
    /** @type {import("preact-iso").RouteHook  & { rest: string; }} */ matchProps;
  props.children.some((vnode) => {
    const matches = exec(
      rest,
      vnode.props.path,
      matchProps = {
        ...vnode.props,
        path: rest,
        query,
        params: Object.assign({}, params),
        rest: "",
      },
    );
    if (matches) return (pathRoute = cloneElement(vnode, matchProps));
    if (vnode.props.default) defaultRoute = cloneElement(vnode, matchProps);
  });

  /** @type {VNode<any> | undefined} */
  let incoming = pathRoute || defaultRoute;

  const isHydratingSuspense = cur.current &&
    // @ts-ignore
    cur.current.__u & MODE_HYDRATE &&
    // @ts-ignore
    cur.current.__u & MODE_SUSPENDED;
  // @ts-ignore
  const isHydratingBool = cur.current && cur.current.__h;
  const routeChanged = useMemo(() => {
    const prevSuspended = didSuspend.current;
    didSuspend.current = false;

    if (!prevSuspended) {
      prev.current = {
        node: cur.current ?? EMPTY,
        first: !prev.current?.first,
      };
    }

    cur.current = /** @type {VNode<any>} */ (
      h(RouteContext.Provider, { value: matchProps }, incoming)
    );

    // Only mark as an update if the route component changed.
    const outgoing = prev.current && prev.current.node.props.children;
    if (
      !outgoing ||
      !incoming ||
      incoming.type !== outgoing.type ||
      incoming.props.component !== outgoing.props.component
    ) {
      // This hack prevents Preact from diffing when we swap `cur` to `prev`:
      // @ts-ignore
      if (this.__v && this.__v.__k) this.__v.__k.reverse();
      count.current++;
      return true;
    }
    return false;
    // @ts-ignore
  }, [url, JSON.stringify(matchProps)]);

  if (isHydratingSuspense) {
    // @ts-ignore
    cur.current.__u |= MODE_HYDRATE;
    // @ts-ignore
    cur.current.__u |= MODE_SUSPENDED;
  } else if (isHydratingBool) {
    // @ts-ignore
    cur.current.__h = true;
  }

  // This borrows the _childDidSuspend() solution from compat.
  this.__c = (
    /** @type {Promise<any>} */ e,
    /** @type {import("preact").VNode} */ suspendedVNode,
  ) => {
    // Mark the current render as having suspended:
    didSuspend.current = true;

    // Fire an event saying we're waiting for the route:
    if (props.onLoadStart) props.onLoadStart(url);
    isLoading.current = true;

    // Re-render on unsuspend:
    let c = count.current;
    e.then(() => {
      // Ignore this update if it isn't the most recently suspended update:
      if (c !== count.current) return;

      // Successful route transition: un-suspend after a tick and stop rendering the old route:
      prev.current.node = EMPTY;
      if (cur.current) {
        // @ts-ignore
        if (suspendedVNode.__h) {
          // _hydrating
          // @ts-ignore
          cur.current.__h = suspendedVNode.__h;
        }

        // @ts-ignore
        if (suspendedVNode.__u & MODE_SUSPENDED) {
          // _flags
          // @ts-ignore
          cur.current.__u |= MODE_SUSPENDED;
        }

        // @ts-ignore
        if (suspendedVNode.__u & MODE_HYDRATE) {
          // @ts-ignore
          cur.current.__u |= MODE_HYDRATE;
        }
      }

      RESOLVED.then(() => {
        didSuspend.current = false;
        update(undefined);
      });
    });
  };

  const [, rerender] = useState([]);
  useLayoutEffect(() => {
    // @ts-ignore
    const currentDom = this.__v && this.__v.__e;

    // Ignore suspended renders (failed commits):
    if (didSuspend.current) {
      // If we've never committed, mark any hydration DOM for removal on the next commit:
      if (!hasEverCommitted.current && !pendingBase.current) {
        pendingBase.current = currentDom;
      }
      return;
    } else {
      prev.current.node = EMPTY;
      rerender([]);
    }

    // If this is the first ever successful commit and we didn't use the hydration DOM, remove it:
    if (!hasEverCommitted.current && pendingBase.current) {
      if (pendingBase.current !== currentDom) pendingBase.current.remove();
      pendingBase.current = null;
    }

    // Mark the component has having committed:
    hasEverCommitted.current = true;

    // The route is loaded and rendered.
    if (prevRoute.current !== path) {
      if (wasPush) scrollTo(0, 0);
      if (props.onRouteChange) props.onRouteChange(url);

      prevRoute.current = path;
    }

    if (props.onLoadEnd && isLoading.current) props.onLoadEnd(url);
    isLoading.current = false;
  }, [path, wasPush, c]);

  // Note: cur MUST render first in order to set didSuspend & prev.
  return h(
    Fragment,
    null,
    h(Fragment, { key: !prev.current.first }, cur.current),
    h(Fragment, { key: prev.current.first }, prev.current.node),
  );
}

const MODE_HYDRATE = 1 << 5;
const MODE_SUSPENDED = 1 << 7;

// Lazily render a ref's current value:
const RenderRef = (
  /** @type {{r:import("preact").RefObject<import("preact").ComponentChildren>}} */ {
    r,
  },
) => r.current;

Router.Provider = LocationProvider;

LocationProvider.ctx = createContext(
  /** @type {import("preact-iso").LocationHook & { wasPush: boolean }} */ ({}),
);
const RouteContext = createContext(
  /** @type {import("preact-iso").RouteHook & { rest: string }} */ ({}),
);

/** @type {(props: import('preact-iso').RouteProps<object>) => import('preact').VNode} */
export const Route = (props) => h(props.component, null);

export const useLocation = () => useContext(LocationProvider.ctx);
export const useRoute = () => useContext(RouteContext);
