# Response Shapes own status identity

Each Response Shape declares its exact HTTP status as a required numeric literal from 100 through 599. TypeScript checks standalone status validity. An Endpoint Contract declares one Response Shape or a nonempty array; multiple alternatives may share a status.

Runtime validation compares the observed status to each shape's declared status. Defined Response status types preserve those exact literals, allowing callers to narrow by status. Alternatives sharing a status retain their correlated headers and body types. [ADR 0008](0008-ordered-response-shapes.md) defines matching order, and [ADR 0004](0004-validation-ownership-follows-lifecycle-seams.md) defines validation ownership.
