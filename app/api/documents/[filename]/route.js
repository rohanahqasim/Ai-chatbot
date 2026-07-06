import { proxyToPython } from "../../_python";

export async function DELETE(request, { params }) {
  const { filename } = await params;
  return proxyToPython(`/documents/${encodeURIComponent(filename)}`, request);
}
