import { useLocation } from "../router.js";
import { SearchIcon } from "lucide-preact";
import { isPackageName } from "../../lib/package-name";
import { isHandle } from "@atcute/lexicons/syntax";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
export function Search({ value }: { value?: string | undefined }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    inputRef.current!.value = value ?? "";
  }, [value]);
  const location = useLocation();
  return (
    <form
      action="/search"
      class="search-form"
      onSubmit={(e) => {
        e.preventDefault();
        const search = e.currentTarget.querySelector<HTMLInputElement>(
          '[name="q"]',
        )!.value;
        let url;
        if (
          isPackageName(search) ||
          search.startsWith("@") && isHandle(search.slice(1))
        ) {
          url = "/" + search;
        } else {
          url = "/search?q=" + encodeURIComponent(search);
        }
        if (location.url !== url) {
          location.route(url);
        }
      }}
    >
      <input
        type="search"
        name="q"
        placeholder="Search packages"
        autoComplete="off"
        ref={inputRef}
      />{" "}
      <button type="submit" title="Search">
        <SearchIcon />
      </button>
    </form>
  );
}
