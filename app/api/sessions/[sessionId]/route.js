import { proxyToPython } from "../../_python";

export async function GET(request, { params }) {
  const { sessionId } = await params;
  return proxyToPython(`/sessions/${encodeURIComponent(sessionId)}`, request);
}
