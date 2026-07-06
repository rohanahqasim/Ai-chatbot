/** Base URL for the FastAPI app (uvicorn locally, serverless on Vercel). */
export function pythonApiBase() {
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/index`;
  }
  return process.env.API_ORIGIN ?? "http://127.0.0.1:8001";
}

/** Proxy a request to the Python backend and return the response. */
export async function proxyToPython(path, request) {
  const url = `${pythonApiBase()}${path}`;
  const init = { method: request.method };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("multipart/form-data")) {
      init.body = await request.formData();
    } else if (contentType?.includes("application/json")) {
      init.headers = { "Content-Type": "application/json" };
      init.body = await request.text();
    } else {
      init.body = await request.arrayBuffer();
      if (contentType) {
        init.headers = { "Content-Type": contentType };
      }
    }
  }

  try {
    const res = await fetch(url, init);
    const body = await res.text();
    const isJson =
      res.headers.get("content-type")?.includes("application/json") ||
      body.trimStart().startsWith("{");

    if (!isJson) {
      return Response.json(
        {
          detail:
            body.trim() ||
            `Backend error (${res.status}). Is Python running? Try: npm run dev:api`,
        },
        { status: res.status || 500 }
      );
    }

    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    return Response.json(
      {
        detail: `Cannot reach Python backend at ${url}. Run "npm run dev:api" in a second terminal.`,
      },
      { status: 503 }
    );
  }
}
