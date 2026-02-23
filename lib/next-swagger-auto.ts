import type { ZodTypeAny } from "zod";

export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";

export type RouteDoc = {
  method: HttpMethod;
  summary?: string;
  description?: string;
  tags?: string[];
  request?: ZodTypeAny;
  response?: ZodTypeAny;
  responses?: Record<
    string,
    {
      description?: string;
      schema?: ZodTypeAny;
    }
  >;
};

export function defineRoute(doc: RouteDoc) {
  return doc;
}
