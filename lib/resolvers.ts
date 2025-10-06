import {
  CompositeDidDocumentResolver,
  DohJsonHandleResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
  XrpcHandleResolver,
} from "@atcute/identity-resolver";
import { CompositeHandleResolver } from "./composite-handle-resolver";

export const publicHandleResolver = new CompositeHandleResolver({
  strategy: "race",
  methods: {
    dns: new DohJsonHandleResolver({
      dohUrl: "https://mozilla.cloudflare-dns.com/dns-query",
    }),
    http: new WellKnownHandleResolver(),
    microcosm: new XrpcHandleResolver({
      serviceUrl: "https://slingshot.microcosm.blue",
    }),
    bsky: new XrpcHandleResolver({
      serviceUrl: "https://public.api.bsky.app",
    }),
  },
});
export const publicDidDocResolver = new CompositeDidDocumentResolver({
  methods: {
    plc: new PlcDidDocumentResolver(),
    web: new WebDidDocumentResolver(),
  },
});
