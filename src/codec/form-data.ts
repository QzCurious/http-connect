type FormDataPrimitive = string | number | boolean | null | Blob;

type FormDataPrimitiveArray = readonly (FormDataPrimitive | undefined)[];

type FormDataStructuredArray = readonly (
  | FormDataObject
  | FormDataPrimitiveArray
  | FormDataStructuredArray
  | undefined
)[];

type FormDataValue =
  | FormDataPrimitive
  | undefined
  | FormDataPrimitiveArray
  | FormDataStructuredArray
  | FormDataObject;

export type FormDataObject = {
  readonly [key: string]: FormDataValue;
};

type ArrayEncodingMode = "auto" | "indexed";

type FormDataEntry = {
  key: string;
  value: string | Blob;
};

export function toFormData(value: FormData | FormDataObject): FormData {
  if (value instanceof FormData) {
    return value;
  }

  const entries = Object.entries(value).flatMap(([key, fieldValue]) =>
    formDataFieldEntries(key, fieldValue),
  );

  const formData = new FormData();
  for (const entry of entries) {
    formData.append(entry.key, entry.value);
  }

  return formData;
}

function formDataFieldEntries(
  key: string,
  value: FormDataValue,
  arrayEncodingMode: ArrayEncodingMode = "auto",
): FormDataEntry[] {
  if (value === undefined) {
    return [];
  }

  if (value === null) {
    return [{ key, value: "" }];
  }

  if (value instanceof Blob) {
    return [{ key, value }];
  }

  if (isFormDataScalar(value)) {
    return [{ key, value: String(value) }];
  }

  if (Array.isArray(value)) {
    return formDataArrayEntries(key, value, arrayEncodingMode);
  }

  return Object.entries(value).flatMap(([childKey, childValue]) =>
    formDataFieldEntries(`${key}[${childKey}]`, childValue),
  );
}

function formDataArrayEntries(
  key: string,
  value: readonly FormDataValue[],
  arrayEncodingMode: ArrayEncodingMode,
): FormDataEntry[] {
  const hasStructuredValue =
    arrayEncodingMode === "indexed" ||
    value.some(
      (item) =>
        item !== undefined && item !== null && !isFormDataScalar(item) && !(item instanceof Blob),
    );

  return value.flatMap((item, index) => {
    const itemKey = hasStructuredValue ? `${key}[${index}]` : key;

    return formDataFieldEntries(
      itemKey,
      item,
      hasStructuredValue && Array.isArray(item) ? "indexed" : "auto",
    );
  });
}

function isFormDataScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
