import "preact/debug";
import { hydrate, prerender as ssr } from "preact-iso";
// headlessui import is side effectful, adds [data-headlessui-focus-visible]
import "@headlessui/react";
import "./style.css";
import { type Did, type Handle, isHandle } from "@atcute/lexicons/syntax";
import { Splash } from "./components/Loader.js";
import { type ComponentChildren, createContext, type VNode } from "preact";
import {
  configureOAuth,
  deleteStoredSession,
  finalizeAuthorization,
  getSession,
  listStoredSessions,
  OAuthUserAgent,
  type Session,
} from "@atcute/oauth-browser-client";
import { async, errorWrap, type ErrorWrappedComponent } from "./load.js";
import { useSyncExternalStore } from "preact/compat";
import {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { Client, ok as unwrap } from "@atcute/client";
import { Home } from "./pages/Home/index.js";
import { NotFound } from "./pages/Error/index.js";
import { LocationProvider, Route, Router, useLocation } from "./router.js";

if (typeof document !== "undefined") {
  // don't hydrate the splash screen
  document.querySelector(".page-loading-splash") &&
    document.querySelector('script[type="isodata"]')?.remove();

  configureOAuth({
    metadata: {
      client_id: (location.origin === "http://127.0.0.1:5173"
        ? "https://atpkgs.easrng.net"
        : location.origin) + "/oauth-client-metadata.json",
      redirect_uri: location.origin + "/oauth/callback",
    },
  });
}

const OauthCallback = async(async () => {
  if (typeof document === "undefined") return <Splash />;
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search);
  const session = await finalizeAuthorization(params);
  const agent = new OAuthUserAgent(session);
  const rpc = new Client({ handler: agent });
  const data = await unwrap(rpc.get("com.atproto.server.getSession"));
  localStorage.setItem("handle-cached", data.handle);
  const Return = () => {
    const [splash, setSplash] = useState(true);
    useLayoutEffect(() => {
      setSplash(false);
    }, []);
    if (splash) return <Splash />;
    const returnTo = localStorage.getItem("oauth-return-to") ?? "/";
    localStorage.removeItem("oauth-return-to");
    useLocation().route(returnTo, true);
    dispatchEvent(new StorageEvent("storage"));
    return null;
  };
  return <Return />;
});
const SearchPage = async(
  async () => (await import("./pages/Search/index.js")).SearchPage,
);
const PublishPage = async(async () =>
  (await import("./pages/Publish/index.js")).PublishPage()
);
const ProfilePage = async<{ handle: Handle }>(
  async ({ handle, $session, $route }) =>
    await (
      await import("./pages/Profile/index.js")
    ).ProfilePage({
      handle,
      $session,
      $route,
    }),
);

function Routes() {
  const loc = useLocation();
  const pathParts = loc.path.slice(2).split("/");
  let fallback: ErrorWrappedComponent<object> = NotFound;
  if (loc.path[1] === "@" && pathParts.length === 1 && isHandle(pathParts[0])) {
    const handle = pathParts[0];
    fallback = errorWrap(() => <ProfilePage handle={handle} />);
  }
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/search" component={SearchPage} />
      <Route path="/oauth/callback" component={OauthCallback} />
      <Route path="/publish" component={PublishPage} />
      <Route
        default={!fallback}
        path="/404.html"
        component={typeof document !== "undefined" ? NotFound : Splash}
      />
      <Route default component={fallback} />
    </Router>
  );
}

export type SessionData =
  | {
    did: undefined;
    session: undefined;
    rpc: undefined;
    handle: undefined;
  }
  | {
    did: Did;
    session: Promise<Session>;
    rpc: Promise<Client>;
    handle: Handle;
  };
const SessionContext = createContext<SessionData>({
  did: undefined,
  handle: undefined,
  rpc: undefined,
  session: undefined,
});
export function useSession(): SessionData {
  return useContext(SessionContext);
}
const initHandle = (availableSession: Did | undefined) =>
  availableSession
    ? ((localStorage.getItem("handle-cached") as Handle) ?? "handle.invalid")
    : undefined;
function SessionProvider({ children }: { children: ComponentChildren }) {
  const [handle, setHandle] = useState<Handle | undefined>();
  const prevSessionList = useRef<string>("");
  const did = typeof document !== "undefined"
    ? useSyncExternalStore(
      (flush) => {
        const listener = () => {
          const sessions = listStoredSessions();
          while (sessions.length > 1) {
            deleteStoredSession(sessions.shift()!);
          }
          const current = sessions.join("\0");
          if (current !== prevSessionList.current) {
            prevSessionList.current = current;
            flush();
          }
        };
        addEventListener("storage", listener);
        return () => removeEventListener("storage", listener);
      },
      () => {
        const sessions = listStoredSessions();
        return sessions[0];
      },
    )
    : undefined;
  const { session, rpc } = useMemo(() => {
    if (did) {
      const promise = getSession(did).then(async (session) => {
        const agent = new OAuthUserAgent(session);
        const rpc = new Client({ handler: agent });
        const { ok, data } = await rpc.get("com.atproto.server.getSession");
        if (ok) {
          localStorage.setItem("handle-cached", data.handle);
          setHandle(handle);
          return { session, rpc };
        } else {
          deleteStoredSession(did);
          setHandle(undefined);
          dispatchEvent(new StorageEvent("storage"));
          throw new Error("session expired");
        }
      });
      setHandle(undefined);
      return {
        session: promise.then((e) => e.session),
        rpc: promise.then((e) => ((globalThis as any).__rpc__ = e.rpc)),
      };
    } else {
      return {};
    }
  }, [did]);
  const optimisticHandle = useMemo(() => initHandle(did), [did]);
  const obj = useMemo(
    (): SessionData =>
      did
        ? {
          did: did,
          session: session!,
          rpc: rpc!,
          handle: handle ?? optimisticHandle ?? "handle.invalid",
        }
        : {
          did: undefined,
          handle: undefined,
          rpc: undefined,
          session: undefined,
        },
    [did, session, rpc, handle, optimisticHandle],
  );
  return <SessionContext value={obj}>{children}</SessionContext>;
}

export function App() {
  return (
    <LocationProvider>
      <SessionProvider>
        <Routes />
      </SessionProvider>
    </LocationProvider>
  );
}

export const TitleContext = createContext<(title: string) => void>(() => {});

if (typeof window !== "undefined") {
  hydrate(
    <TitleContext value={(title_) => (document.title = title_)}>
      <App />
    </TitleContext>,
    document.getElementById("app")!,
  );
}

export async function prerender(data: any) {
  let title: string = "";
  const result = await ssr(
    <TitleContext value={(title_) => (title = title_)}>
      <App {...data} />
    </TitleContext>,
  );
  return {
    ...result,
    head: {
      title,
    },
  };
}
