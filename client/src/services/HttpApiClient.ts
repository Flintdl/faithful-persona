import type {
  ApiClient,
  AuthSession,
  LoginRequest,
  SaveGetResponse,
  SavePutRequest,
  SavePutResponse,
  SignupRequest,
} from '@shared/types/api.types';

/**
 * Client HTTP real — usado quando VITE_USE_MOCK_BACKEND=false.
 * Espera que o servidor Fastify esteja rodando em VITE_API_BASE_URL.
 *
 * Importante:
 * - credentials: 'include' pra cookies de sessão (HttpOnly + SameSite=Strict)
 * - sem JWT em body/header — sessão via cookie opaco
 */
export class HttpApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {
    if (!baseUrl) throw new Error('HttpApiClient: baseUrl is required');
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { code?: string; message?: string };
        if (body.code || body.message) message = `${body.code ?? 'ERR'}:${body.message ?? ''}`;
      } catch {
        // body não-JSON, mantém mensagem padrão
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  }

  signup(req: SignupRequest): Promise<AuthSession> {
    return this.req('/auth/signup', { method: 'POST', body: JSON.stringify(req) });
  }
  login(req: LoginRequest): Promise<AuthSession> {
    return this.req('/auth/login', { method: 'POST', body: JSON.stringify(req) });
  }
  async logout(): Promise<void> {
    await this.req<void>('/auth/logout', { method: 'POST' });
  }
  async me(): Promise<AuthSession | null> {
    try {
      return await this.req<AuthSession>('/auth/me');
    } catch {
      return null;
    }
  }
  getSave(): Promise<SaveGetResponse> {
    return this.req('/save', { method: 'GET' });
  }
  putSave(req: SavePutRequest): Promise<SavePutResponse> {
    return this.req('/save', { method: 'PUT', body: JSON.stringify(req) });
  }
}
