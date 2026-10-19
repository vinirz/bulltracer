import { API_BASE_URL } from "./config";

/** Erro normalizado da API: o backend responde um objeto de erro em falhas. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "HTTP_ERROR";
  let message = `Falha na requisição (${response.status})`;
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    if (body.message) message = body.message;
    if (body.error) code = body.error;
  } catch {
    // resposta sem corpo JSON — mantém a mensagem genérica
  }
  return new ApiError(response.status, code, message);
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Content-Type só quando há corpo: DELETE/GET sem corpo e com o header JSON
  // são rejeitados pelo servidor (400 FST_ERR_CTP_EMPTY_JSON_BODY).
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body != null ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", ...jsonBody(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", ...jsonBody(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
