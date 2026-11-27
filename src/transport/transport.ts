import type { Codecs, RequiredCodecs } from "../codec/codecs";
import type { EndpointContract } from "../contract/endpoint";
import { shallowMergeDefined, type Invalid } from "../internal";
import { createFetcher } from "./fetcher";

export type TransportConfig = {
  baseUrl: string;
  fetch?: (request: Request, init?: RequestInit) => Promise<Response>;
  codecs?: Codecs;
};

type FetchCompatibleShape =
  | { method: Exclude<EndpointContract["method"], "GET" | "HEAD"> }
  | { request: Extract<EndpointContract["request"], { body?: never }> };

type CompatibleEndpoint<E extends EndpointContract> = E &
  ([E] extends [FetchCompatibleShape]
    ? {}
    : { request: Invalid<"Error: Fetch cannot send GET or HEAD requests with a body."> });

type FetchOverride = Pick<TransportConfig, "fetch">;

type FetcherConfig<Overrides> = keyof Overrides extends never
  ? [config?: FetchOverride]
  : {} extends Overrides
    ? [config?: FetchOverride & { codecs?: Overrides }]
    : [config: FetchOverride & { codecs: Overrides }];

export function createTransport<const Config extends TransportConfig>(config: Config) {
  type Defaults = Config extends { codecs: infer C extends Codecs } ? C : {};

  return {
    createFetcher<const Endpoint extends EndpointContract>(
      endpoint: CompatibleEndpoint<Endpoint>,
      ...[fetcherConfig]: FetcherConfig<RequiredCodecs<NoInfer<Endpoint>, Defaults>>
    ) {
      const overrides: Pick<TransportConfig, "fetch" | "codecs"> | undefined = fetcherConfig;
      return createFetcher<Endpoint>(endpoint, {
        baseUrl: config.baseUrl,
        fetch: overrides?.fetch ?? config.fetch ?? globalThis.fetch,
        codecs: {
          encoders: shallowMergeDefined(config.codecs?.encoders, overrides?.codecs?.encoders),
          decoders: shallowMergeDefined(config.codecs?.decoders, overrides?.codecs?.decoders),
        } as RequiredCodecs<Endpoint>,
      });
    },
  };
}
