import {
  ProjectSummary,
  SchemaModel,
  PendingDetails,
  AdrItem,
  DirectoryEntry,
} from './types';

const BASE_URL = '';

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
    throw new Error(json.error || `HTTP error ${res.status}`);
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
  }) =>
    req<{ project: any }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeProject: (id: string, deleteData = false) =>
    req<{ removed: boolean }>(`/api/projects/${id}?deleteData=${deleteData}`, {
      method: 'DELETE',
    }),

  browseFs: (path?: string) =>
    req<{ current: string; parent: string | null; directories: DirectoryEntry[] }>(
      `/api/fs/list${path ? `?path=${encodeURIComponent(path)}` : ''}`
    ),

  getProjectSchema: (id: string) =>
    req<{
      id: string;
      name: string;
      path: string;
      config: any;
      dbml: string;
      model: SchemaModel;
      layout: Record<string, { x: number; y: number }>;
    }>(`/api/projects/${id}/schema`),

  updateLayout: (id: string, layout: Record<string, { x: number; y: number }>) =>
    req<{ saved: boolean }>(`/api/projects/${id}/layout`, {
      method: 'PUT',
      body: JSON.stringify({ layout }),
    }),

  getPending: (id: string) =>
    req<{ pending: PendingDetails | null }>(`/api/projects/${id}/pending`),

  savePending: (id: string, data: { proposedDbml?: string; model?: SchemaModel; note?: string }) =>
    req<{ details: PendingDetails }>(`/api/projects/${id}/pending`, {
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
