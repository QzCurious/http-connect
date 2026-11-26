---
status: accepted
implementation: complete
---

# One Request Shape per Endpoint Contract

An Endpoint Contract declares its method and path alongside exactly one Request Shape. The path declaration owns the template and its params schema. Call Input combines the input of that path with the input of the Request Shape. Multiple Endpoint Contracts may share a method and path while declaring different representations. Unions of Request Shapes are not supported by `endpoint()`. Separate Endpoint Contracts express different methods, paths, or representations, keeping Call Input and Request Encoder compatibility tied to one declaration.

Section schemas may accept unions of values. Call Input supplies every declared variable section, including sections whose schemas accept undefined, and excludes Fixed Request Facts.

Request encoding follows [ADR 0007](0007-request-content-type-and-encoding.md), method/body compatibility follows [ADR 0002](0002-method-body-compatibility-belongs-to-transport.md), response alternatives follow [ADR 0008](0008-ordered-response-shapes.md), and validation ownership follows [ADR 0004](0004-validation-ownership-follows-lifecycle-seams.md).
