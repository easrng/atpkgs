import {
  deleteStoredSession,
  resolveFromService,
  TokenRefreshError,
} from "@atcute/oauth-browser-client";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import { ArrowRight, AtSign, LoaderCircleIcon, UserRound } from "lucide-preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { resolveMiniDoc } from "../../lib/resolve-mini-doc";
import type { Did, Handle } from "@atcute/lexicons";
import { createAuthorizationUrl } from "@atcute/oauth-browser-client";
import { useLocation } from "../router.js";
import { useSession } from "..";

function LogIn() {
  const input = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (error) throw error;
  const location = useLocation();
  return (
    <Popover>
      <PopoverButton>
        <AtSign /> Log In
      </PopoverButton>
      <PopoverPanel
        anchor="bottom"
        className="popover handle-input"
        focus={true}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting) return;
            try {
              setSubmitting(true);
              const doc = await resolveMiniDoc({
                identifier: input.current!.value as Handle,
              });
              const { metadata } = await resolveFromService(doc.pds);
              const authUrl = await createAuthorizationUrl({
                metadata,
                identity: {
                  id: doc.did,
                  pds: new URL(doc.pds),
                  raw: doc.handle,
                },
                scope: "atproto transition:generic",
              });
              localStorage.setItem("oauth-return-to", location.url);
              await new Promise((cb) => setTimeout(cb, 200));
              window.location.assign(authUrl);
              await new Promise((_resolve, reject) => {
                window.addEventListener(
                  "pageshow",
                  () => {
                    reject(new Error(`user aborted the login request`));
                  },
                  { once: true },
                );
              });
            } catch (error) {
              setError(error);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <AtSign />
          <input
            ref={input}
            autoFocus={true}
            type="text"
            required
            placeholder="atproto.example.org"
          />{" "}
          <button
            type="submit"
            title={submitting ? "Logging In" : "Log In"}
            aria-disabled={submitting}
            class={submitting ? "button-loading" : ""}
          >
            <ArrowRight />
          </button>
        </form>
      </PopoverPanel>
    </Popover>
  );
}

function Account({ big }: { big?: boolean }) {
  const { did, handle, rpc } = useSession();
  return (
    <Menu>
      <MenuButton title={"Signed in as " + handle!}>
        {big
          ? (
            <>
              <AtSign />
              {handle}
            </>
          )
          : <UserRound />}
      </MenuButton>
      <MenuItems anchor="bottom" className="menu">
        <MenuItem>
          <a class="menu-item menu-item-account" href={"/@" + handle!}>
            <div class="menu-item-account-caption">Signed in as</div>
            <div class="menu-item-account-handle">@{handle!}</div>
          </a>
        </MenuItem>
        <MenuItem>
          <button
            class="menu-item not-button menu-item-destructive"
            onClick={async () => {
              localStorage.removeItem("handle-cached");
              try {
                await (
                  await rpc!
                ).post("com.atproto.server.deleteSession", {
                  as: "json",
                });
              } catch (e) {
                if (!(e instanceof TokenRefreshError)) {
                  throw e;
                }
              }
              deleteStoredSession(did!);
              dispatchEvent(new StorageEvent("storage"));
            }}
          >
            Sign Out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}

export function AccountButton({ big }: { big?: boolean }) {
  const [splash, setSplash] = useState(true);
  useLayoutEffect(() => {
    setSplash(false);
  }, []);
  if (splash) {
    /**
     * SSR markup that we can update in hipri.js to make sure
     * the first paint and the hydrated paint match
     */
    return (
      <button>
        <span class="account-button-ssr-logged-in">
          {big
            ? (
              <>
                <AtSign />
                <span class="account-button-ssr-handle"></span>
              </>
            )
            : <UserRound />}
        </span>
        <span class="account-button-ssr-logged-out">
          <AtSign /> Log In
        </span>
      </button>
    );
  }
  const session = useSession();
  if (session.did) return <Account big={big} />;
  return <LogIn />;
}
