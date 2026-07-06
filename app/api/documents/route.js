import { proxyToPython } from "../_python";

export async function GET(request) {
  return proxyToPython("/documents", request);
}
