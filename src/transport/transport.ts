import type { EndpointContract } from "../contract/endpoint";
import { shallowMergeDefined, type Invalid } from "../internal";
import type { CodecOptions, Codecs, RequiredCodecs } from "../codec/codecs";
import { createFetcher, type Fetcher } from "./fetcher";

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

interface Transport<C extends Codecs = {}> {
  createFetcher<const Endpoint extends EndpointContract>(
    endpoint: CompatibleEndpoint<Endpoint>,
    ...options: CodecOptions<NoInfer<Endpoint>, C>
  ): Fetcher<Endpoint>;
}

export function createTransport<const Config extends TransportConfig>(
  config: Config,
): Transport<Config extends { codecs: infer C extends Codecs } ? C : {}>;
export function createTransport(config: TransportConfig): Transport {
  const dispatch = config.fetch ?? globalThis.fetch;
  return {
    createFetcher<const Endpoint extends EndpointContract>(
      endpoint: CompatibleEndpoint<Endpoint>,
      options?: Pick<TransportConfig, "codecs">,
    ) {
      return createFetcher<Endpoint>(endpoint, {
        baseUrl: config.baseUrl,
        fetch: dispatch,
        codecs: {
          encoders: shallowMergeDefined(config.codecs?.encoders, options?.codecs?.encoders),
          decoders: shallowMergeDefined(config.codecs?.decoders, options?.codecs?.decoders),
        } as RequiredCodecs<Endpoint>,
      });
    },
  };
}
