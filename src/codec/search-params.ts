import type { Prettify } from "../internal";

export type URLSearchParamsNativeInput = NonNullable<
  ConstructorParameters<typeof URLSearchParams>[0]
>;

type URLSearchParamsPrimitive = Prettify<string | number | boolean | null>;

type URLSearchParamsPrimitiveArray = readonly (URLSearchParamsPrimitive | undefined)[];

type URLSearchParamsStructuredArray = readonly (
  | URLSearchParamsObject
  | URLSearchParamsPrimitiveArray
  | URLSearchParamsStructuredArray
  | undefined
)[];

export type URLSearchParamsValue =
  | URLSearchParamsPrimitive
  | undefined
  | URLSearchParamsPrimitiveArray
  | URLSearchParamsStructuredArray
  | URLSearchParamsObject;

export type URLSearchParamsObject = {
  readonly [key: string]: URLSearchParamsValue;
};

type ArrayEncodingMode = "auto" | "indexed";

type URLSearchParamEntry = {
  key: string;
  value: string;
};

export function toURLSearchParams(
  value: URLSearchParamsNativeInput | URLSearchParamsObject,
): URLSearchParams {
  if (value instanceof URLSearchParams) {
    return value;
  }

  if (typeof value === "string" || Array.isArray(value)) {
    return new URLSearchParams(value);
  }

  const entries = Object.entries(value).flatMap(([key, fieldValue]) =>
    urlSearchParamFieldEntries(key, fieldValue),
  );

  const searchParams = new URLSearchParams();
  for (const entry of entries) {
    searchParams.append(entry.key, entry.value);
  }

  return searchParams;
}

function urlSearchParamFieldEntries(
  key: string,
  value: URLSearchParamsValue,
  arrayEncodingMode: ArrayEncodingMode = "auto",
): URLSearchParamEntry[] {
  if (value === undefined) {
    return [];
  }

  if (value === null) {
    return [{ key, value: "" }];
  }

  if (isURLSearchParamsScalar(value)) {
    return [{ key, value: String(value) }];
  }

  if (Array.isArray(value)) {
    return urlSearchParamArrayEntries(key, value, arrayEncodingMode);
  }

  return Object.entries(value).flatMap(([childKey, childValue]) =>
    urlSearchParamFieldEntries(`${key}[${childKey}]`, childValue),
  );
}

function urlSearchParamArrayEntries(
  key: string,
  value: readonly URLSearchParamsValue[],
  arrayEncodingMode: ArrayEncodingMode,
): URLSearchParamEntry[] {
  const hasStructuredValue =
    arrayEncodingMode === "indexed" ||
    value.some((item) => item !== undefined && item !== null && !isURLSearchParamsScalar(item));

  return value.flatMap((item, index) => {
    const itemKey = hasStructuredValue ? `${key}[${index}]` : key;

    return urlSearchParamFieldEntries(
      itemKey,
      item,
      hasStructuredValue && Array.isArray(item) ? "indexed" : "auto",
    );
  });
}

function isURLSearchParamsScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
