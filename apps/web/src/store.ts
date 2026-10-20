import { create } from 'zustand';
import { SchemaModel, Table, Column, Ref, PendingDetails, AdrItem } from './types';
import { api } from './api';
import {
  adjustEdgeIndexAfterRemoval,
  removeRefsForColumn,
  renameColumnInRefs,
} from './lib/relationships';

interface SchemaStore {
  projectId: string | null;
  projectName: string;
  projectDialect: string;
  baseModel: SchemaModel | null;
  model: SchemaModel | null;
  layout: Record<string, { x: number; y: number }>;
  pending: PendingDetails | null;
  adrs: AdrItem[];
  lastFingerprint: string | null;
  lastSyncedAt: number | null;
  selectedTable: string | null;
  selectedColumn: string | null;
  selectedEdgeIndex: number | null;
  activeDrawer: 'pending' | 'decisions' | null;
  isAddModalOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadProject: (
    id: string,
    opts?: { initialTable?: string | null; silent?: boolean }
  ) => Promise<void>;
  syncIfNeeded: (incomingFingerprint?: string) => Promise<boolean>;
  updateLayout: (tableName: string, pos: { x: number; y: number }) => void;
  applyLayout: (layout: Record<string, { x: number; y: number }>) => void;
  setSelectedTable: (tableName: string | null) => void;
  setSelectedColumn: (colName: string | null) => void;
  setSelectedEdgeIndex: (index: number | null) => void;
  setActiveDrawer: (drawer: 'pending' | 'decisions' | null) => void;
  setAddModalOpen: (open: boolean) => void;

  // Schema editing actions (updates local working model and saves pending)
  addTable: (name: string, note?: string) => Promise<void>;
  updateTable: (oldName: string, newName: string, note?: string) => Promise<void>;
  removeTable: (name: string) => Promise<void>;
  addColumn: (tableName: string, column: Column) => Promise<void>;
  updateColumn: (tableName: string, oldColName: string, column: Column) => Promise<void>;
  removeColumn: (tableName: string, colName: string) => Promise<void>;
  addRef: (ref: Ref) => Promise<void>;
  updateRef: (index: number, updated: Partial<Ref>) => Promise<void>;
  removeRef: (index: number) => Promise<void>;

  discardPending: () => Promise<void>;
  refreshPending: () => Promise<void>;
}

let saveTimer: any = null;

async function updateStoreFingerprint(projectId: string, set: any) {
  try {
    const syncData = await api.getProjectSync(projectId);
    set({ lastFingerprint: syncData.fingerprint });
  } catch {
    // ignore
  }
}

export const useSchemaStore = create<SchemaStore>((set, get) => ({
  projectId: null,
  projectName: '',
  projectDialect: 'postgres',
  baseModel: null,
  model: null,
  layout: {},
  pending: null,
  adrs: [],
  lastFingerprint: null,
  lastSyncedAt: null,
  selectedTable: null,
  selectedColumn: null,
  selectedEdgeIndex: null,
  activeDrawer: null,
  isAddModalOpen: false,
  isLoading: false,
  error: null,

  loadProject: async (id: string, opts?: { initialTable?: string | null; silent?: boolean }) => {
    const isSilent = opts?.silent === true;
    const prevProjectId = get().projectId;
    const prevSelectedTable = get().selectedTable;

    if (!isSilent) {
      set({ isLoading: true, error: null, projectId: id });
    }
    try {
      const [data, adrsData] = await Promise.all([
        api.getProjectSchema(id),
        api.getAdrs(id),
      ]);

      const workingSource = data.pendingModel || data.model;
      const workingModel: SchemaModel = structuredClone(workingSource);

      const preferredTable =
        opts?.initialTable !== undefined
          ? opts.initialTable
          : prevProjectId === id
            ? prevSelectedTable
            : null;

      const resolvedTable =
        preferredTable && workingModel.tables.some((t) => t.name === preferredTable)
          ? preferredTable
          : workingModel.tables[0]?.name || null;

      set({
        projectId: data.id,
        projectName: data.name,
        projectDialect: data.config?.dialect || 'postgres',
        baseModel: data.model,
        model: workingModel,
        layout: data.layout || {},
        pending: data.pending ?? null,
        adrs: adrsData.adrs || [],
        lastFingerprint: data.fingerprint ?? get().lastFingerprint,
        selectedTable: resolvedTable,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      if (!isSilent) {
        set({ error: err.message, isLoading: false });
      }
    }
  },

  syncIfNeeded: async (incomingFingerprint?: string) => {
    const { projectId, lastFingerprint, isLoading } = get();
    if (!projectId || isLoading) return false;
    try {
      const currentFp =
        incomingFingerprint ?? (await api.getProjectSync(projectId)).fingerprint;
      if (lastFingerprint && currentFp !== lastFingerprint) {
        await get().loadProject(projectId, { silent: true });
        set({ lastSyncedAt: Date.now(), lastFingerprint: currentFp });
        return true;
      }
      if (!lastFingerprint) {
        set({ lastFingerprint: currentFp });
      }
    } catch {
      // ignore transient network error
    }
    return false;
  },

  updateLayout: (tableName: string, pos: { x: number; y: number }) => {
    const { projectId, layout } = get();
    const updated = { ...layout, [tableName]: pos };
    set({ layout: updated });

    if (projectId) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api.updateLayout(projectId, updated).catch(console.error);
      }, 500);
    }
  },

  applyLayout: (layout: Record<string, { x: number; y: number }>) => {
    const { projectId } = get();
    set({ layout });

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    if (projectId) {
      api.updateLayout(projectId, layout).catch(console.error);
    }
  },

  setSelectedTable: (tableName: string | null) =>
    set({ selectedTable: tableName, selectedColumn: null, selectedEdgeIndex: null }),
  setSelectedColumn: (colName: string | null) => set({ selectedColumn: colName }),
  setSelectedEdgeIndex: (index: number | null) =>
    set({ selectedEdgeIndex: index, selectedTable: null, selectedColumn: null }),
  setActiveDrawer: (drawer) => set({ activeDrawer: drawer }),
  setAddModalOpen: (open) => set({ isAddModalOpen: open }),

  addTable: async (name: string, note?: string) => {
    const { model, layout, projectId } = get();
    if (!model || !projectId) return;

    const newTable: Table = {
      name,
      columns: [
        { name: 'id', type: 'integer', pk: true, increment: true },
      ],
      note: note || null,
    };

    const updatedModel: SchemaModel = {
      ...model,
      tables: [...model.tables, newTable],
    };

    // Calculate position for new table node
    const tableCount = updatedModel.tables.length;
    const x = 50 + ((tableCount - 1) % 3) * 320;
    const y = 50 + Math.floor((tableCount - 1) / 3) * 280;
    const updatedLayout = { ...layout, [name]: { x, y } };

    set({ model: updatedModel, layout: updatedLayout, selectedTable: name });

    const [{ details, fingerprint }] = await Promise.all([
      api.savePending(projectId, { model: updatedModel }),
      api.updateLayout(projectId, updatedLayout),
    ]);
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  updateTable: async (oldName: string, newName: string, note?: string) => {
    const { model, layout, projectId } = get();
    if (!model || !projectId) return;

    const updatedTables = model.tables.map((t) =>
      t.name === oldName ? { ...t, name: newName, note: note ?? t.note } : t
    );

    // Update refs referencing oldName
    const updatedRefs = model.refs.map((r) => {
      let from = r.from;
      let to = r.to;
      if (from.table === oldName) from = { ...from, table: newName };
      if (to.table === oldName) to = { ...to, table: newName };
      return { ...r, from, to };
    });

    const updatedLayout = { ...layout };
    if (oldName !== newName && updatedLayout[oldName]) {
      updatedLayout[newName] = updatedLayout[oldName]!;
      delete updatedLayout[oldName];
    }

    const updatedModel = { ...model, tables: updatedTables, refs: updatedRefs };
    set({ model: updatedModel, layout: updatedLayout, selectedTable: newName });

    const [{ details, fingerprint }] = await Promise.all([
      api.savePending(projectId, { model: updatedModel }),
      api.updateLayout(projectId, updatedLayout),
    ]);
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  removeTable: async (name: string) => {
    const { model, layout, projectId } = get();
    if (!model || !projectId) return;

    const updatedTables = model.tables.filter((t) => t.name !== name);
    const updatedRefs = model.refs.filter(
      (r) => r.from.table !== name && r.to.table !== name
    );
    const updatedLayout = { ...layout };
    delete updatedLayout[name];

    const updatedModel = { ...model, tables: updatedTables, refs: updatedRefs };
    set({
      model: updatedModel,
      layout: updatedLayout,
      selectedTable: updatedTables[0]?.name || null,
    });

    const [{ details, fingerprint }] = await Promise.all([
      api.savePending(projectId, { model: updatedModel }),
      api.updateLayout(projectId, updatedLayout),
    ]);
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  addColumn: async (tableName: string, column: Column) => {
    const { model, projectId } = get();
    if (!model || !projectId) return;

    const updatedTables = model.tables.map((t) => {
      if (t.name !== tableName) return t;
      return { ...t, columns: [...t.columns, column] };
    });

    const updatedModel = { ...model, tables: updatedTables };
    set({ model: updatedModel });

    const { details, fingerprint } = await api.savePending(projectId, { model: updatedModel });
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  updateColumn: async (tableName: string, oldColName: string, column: Column) => {
    const { model, projectId, selectedColumn } = get();
    if (!model || !projectId) return;

    const updatedTables = model.tables.map((t) => {
      if (t.name !== tableName) return t;
      return {
        ...t,
        columns: t.columns.map((c) => (c.name === oldColName ? column : c)),
      };
    });

    const updatedRefs = renameColumnInRefs(
      model.refs,
      tableName,
      oldColName,
      column.name
    );

    const updatedModel = {
      ...model,
      tables: updatedTables,
      refs: updatedRefs,
    };
    set({
      model: updatedModel,
      selectedColumn:
        selectedColumn === oldColName ? column.name : selectedColumn,
    });

    const { details, fingerprint } = await api.savePending(projectId, { model: updatedModel });
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  removeColumn: async (tableName: string, colName: string) => {
    const { model, projectId } = get();
    if (!model || !projectId) return;

    const updatedTables = model.tables.map((t) => {
      if (t.name !== tableName) return t;
      return { ...t, columns: t.columns.filter((c) => c.name !== colName) };
    });

    const { refs: updatedRefs, removed } = removeRefsForColumn(
      model.refs,
      tableName,
      colName
    );

    const updatedModel = {
      ...model,
      tables: updatedTables,
      refs: updatedRefs,
    };
    set({
      model: updatedModel,
      selectedEdgeIndex: removed > 0 ? null : get().selectedEdgeIndex,
    });

    const { details, fingerprint } = await api.savePending(projectId, { model: updatedModel });
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  addRef: async (ref: Ref) => {
    const { model, projectId } = get();
    if (!model || !projectId) return;

    const updatedModel = { ...model, refs: [...model.refs, ref] };
    set({
      model: updatedModel,
      selectedEdgeIndex: model.refs.length,
      selectedTable: null,
      selectedColumn: null,
    });

    const { details, fingerprint } = await api.savePending(projectId, { model: updatedModel });
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  updateRef: async (index: number, updated: Partial<Ref>) => {
    const { model, projectId } = get();
    if (!model || !projectId || !model.refs[index]) return;

    const updatedRefs = model.refs.map((r, idx) =>
      idx === index ? { ...r, ...updated } : r
    );
    const updatedModel = { ...model, refs: updatedRefs };
    set({ model: updatedModel });

    const { details, fingerprint } = await api.savePending(projectId, { model: updatedModel });
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  removeRef: async (index: number) => {
    const { model, projectId, selectedEdgeIndex } = get();
    if (!model || !projectId) return;

    const updatedModel = {
      ...model,
      refs: model.refs.filter((_, idx) => idx !== index),
    };
    set({
      model: updatedModel,
      selectedEdgeIndex: adjustEdgeIndexAfterRemoval(
        selectedEdgeIndex,
        index
      ),
    });

    const { details, fingerprint } = await api.savePending(projectId, { model: updatedModel });
    set({
      pending: details,
      ...(fingerprint ? { lastFingerprint: fingerprint } : {}),
    });
    if (!fingerprint) await updateStoreFingerprint(projectId, set);
  },

  discardPending: async () => {
    const { projectId } = get();
    if (!projectId) return;

    await api.clearPending(projectId);
    // Reload original schema from disk
    const data = await api.getProjectSchema(projectId);
    set({
      baseModel: data.model,
      model: structuredClone(data.model),
      pending: null,
      ...(data.fingerprint ? { lastFingerprint: data.fingerprint } : {}),
    });
    if (!data.fingerprint) await updateStoreFingerprint(projectId, set);
  },

  refreshPending: async () => {
    const { projectId } = get();
    if (!projectId) return;
    const { pending } = await api.getPending(projectId);
    set({ pending });
    await updateStoreFingerprint(projectId, set);
  },
}));
