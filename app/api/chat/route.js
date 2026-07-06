import { proxyToPython } from "../_python";

export async function POST(request) {
  return proxyToPython("/chat", request);
}
