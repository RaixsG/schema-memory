import {
  ProjectSummary,
  SchemaModel,
  PendingDetails,
  AdrItem,
  DirectoryEntry,
  LocationEntry,
} from './types';

const BASE_URL = '';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new ApiError(
      json.error || `HTTP error ${res.status}`,
      res.status,
      json
    );
  }
  return json;
}

export const api = {
  getProjects: () => req<{ projects: ProjectSummary[] }>('/api/projects'),

  planProject: (path: string) =>
    req<{ plan: any }>('/api/projects/plan', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  addProject: (data: {
    path: string;
    name?: string;
    dialect?: string;
    installProjectSkill?: boolean;
    resolveConflict?: 'replace' | 'new';
  }) =>
    req<{ project: any; adopted: boolean; needsBootstrap: boolean }>(
      '/api/projects',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  removeProject: (id: string, deleteData = false) =>
    req<{ removed: boolean }>(`/api/projects/${id}?deleteData=${deleteData}`, {
      method: 'DELETE',
    }),

  browseFs: (path?: string) =>
    req<{ current: string; parent: string | null; directories: DirectoryEntry[] }>(
      `/api/fs/list${path ? `?path=${encodeURIComponent(path)}` : ''}`
    ),

  getLocations: () =>
    req<{ locations: LocationEntry[] }>('/api/fs/locations'),

  getProjectSchema: (id: string) =>
    req<{
      id: string;
      name: string;
      path: string;
      config: any;
      dbml: string;
      model: SchemaModel;
      pendingModel?: SchemaModel | null;
      pending?: PendingDetails | null;
      layout: Record<string, { x: number; y: number }>;
      fingerprint?: string;
    }>(`/api/projects/${id}/schema`),

  getProjectSync: (id: string) =>
    req<{
      fingerprint: string;
      hasPending: boolean;
      adrCount: number;
    }>(`/api/projects/${id}/sync`),

  updateLayout: (id: string, layout: Record<string, { x: number; y: number }>) =>
    req<{ saved: boolean }>(`/api/projects/${id}/layout`, {
      method: 'PUT',
      body: JSON.stringify({ layout }),
    }),

  getPending: (id: string) =>
    req<{ pending: PendingDetails | null }>(`/api/projects/${id}/pending`),

  savePending: (id: string, data: { proposedDbml?: string; model?: SchemaModel; note?: string }) =>
    req<{ details: PendingDetails; fingerprint?: string }>(`/api/projects/${id}/pending`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  clearPending: (id: string) =>
    req<{ cleared: boolean }>(`/api/projects/${id}/pending`, {
      method: 'DELETE',
    }),

  getAdrs: (id: string, params?: { table?: string; column?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.table) q.set('table', params.table);
    if (params?.column) q.set('column', params.column);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return req<{ adrs: AdrItem[] }>(`/api/projects/${id}/adrs${qs ? `?${qs}` : ''}`);
  },

  getBootstrapPrompt: (id: string) =>
    req<{ prompt: string }>(`/api/projects/${id}/bootstrap-prompt`),
};
