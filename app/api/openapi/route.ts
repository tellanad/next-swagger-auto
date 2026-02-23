import { NextResponse } from "next/server";
import { openapiSpec } from "../../../openapi-spec";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(openapiSpec);
}
