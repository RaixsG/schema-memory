import { create } from 'zustand';
import { SchemaModel, Table, Column, Ref, PendingDetails } from './types';
import { api } from './api';

interface SchemaStore {
  projectId: string | null;
  projectName: string;
  projectDialect: string;
  baseModel: SchemaModel | null;
  model: SchemaModel | null;
  layout: Record<string, { x: number; y: number }>;
  pending: PendingDetails | null;
  selectedTable: string | null;
  selectedColumn: string | null;
  activeDrawer: 'pending' | 'decisions' | null;
  isAddModalOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadProject: (id: string) => Promise<void>;
  updateLayout: (tableName: string, pos: { x: number; y: number }) => void;
  setSelectedTable: (tableName: string | null) => void;
  setSelectedColumn: (colName: string | null) => void;
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
  removeRef: (index: number) => Promise<void>;

  discardPending: () => Promise<void>;
  refreshPending: () => Promise<void>;
}

let saveTimer: any = null;

export const useSchemaStore = create<SchemaStore>((set, get) => ({
  projectId: null,
  projectName: '',
  projectDialect: 'postgres',
  baseModel: null,
  model: null,
  layout: {},
  pending: null,
  selectedTable: null,
  selectedColumn: null,
  activeDrawer: null,
  isAddModalOpen: false,
  isLoading: false,
  error: null,

  loadProject: async (id: string) => {
    set({ isLoading: true, error: null, projectId: id });
    try {
      const data = await api.getProjectSchema(id);
      const pendingData = await api.getPending(id);
      set({
        projectId: data.id,
        projectName: data.name,
        projectDialect: data.config?.dialect || 'postgres',
        baseModel: data.model,
        model: JSON.parse(JSON.stringify(data.model)),
        layout: data.layout || {},
        pending: pendingData.pending,
        selectedTable: data.model.tables[0]?.name || null,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
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

  setSelectedTable: (tableName: string | null) => set({ selectedTable: tableName, selectedColumn: null }),
  setSelectedColumn: (colName: string | null) => set({ selectedColumn: colName }),
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

    const { details } = await api.savePending(projectId, { model: updatedModel });
    await api.updateLayout(projectId, updatedLayout);
    set({ pending: details });
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

    const { details } = await api.savePending(projectId, { model: updatedModel });
    await api.updateLayout(projectId, updatedLayout);
    set({ pending: details });
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

    const { details } = await api.savePending(projectId, { model: updatedModel });
    await api.updateLayout(projectId, updatedLayout);
    set({ pending: details });
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

    const { details } = await api.savePending(projectId, { model: updatedModel });
    set({ pending: details });
  },

  updateColumn: async (tableName: string, oldColName: string, column: Column) => {
    const { model, projectId } = get();
    if (!model || !projectId) return;

    const updatedTables = model.tables.map((t) => {
      if (t.name !== tableName) return t;
      return {
        ...t,
        columns: t.columns.map((c) => (c.name === oldColName ? column : c)),
      };
    });

    const updatedModel = { ...model, tables: updatedTables };
    set({ model: updatedModel });

    const { details } = await api.savePending(projectId, { model: updatedModel });
    set({ pending: details });
  },

  removeColumn: async (tableName: string, colName: string) => {
    const { model, projectId } = get();
    if (!model || !projectId) return;

    const updatedTables = model.tables.map((t) => {
      if (t.name !== tableName) return t;
      return { ...t, columns: t.columns.filter((c) => c.name !== colName) };
    });

    const updatedModel = { ...model, tables: updatedTables };
    set({ model: updatedModel });

    const { details } = await api.savePending(projectId, { model: updatedModel });
    set({ pending: details });
  },

  addRef: async (ref: Ref) => {
    const { model, projectId } = get();
    if (!model || !projectId) return;

    const updatedModel = { ...model, refs: [...model.refs, ref] };
    set({ model: updatedModel });

    const { details } = await api.savePending(projectId, { model: updatedModel });
    set({ pending: details });
  },

  removeRef: async (index: number) => {
    const { model, projectId } = get();
    if (!model || !projectId) return;

    const updatedModel = {
      ...model,
      refs: model.refs.filter((_, idx) => idx !== index),
    };
    set({ model: updatedModel });

    const { details } = await api.savePending(projectId, { model: updatedModel });
    set({ pending: details });
  },

  discardPending: async () => {
    const { projectId } = get();
    if (!projectId) return;

    await api.clearPending(projectId);
    // Reload original schema from disk
    const data = await api.getProjectSchema(projectId);
    set({
      baseModel: data.model,
      model: JSON.parse(JSON.stringify(data.model)),
      pending: null,
    });
  },

  refreshPending: async () => {
    const { projectId } = get();
    if (!projectId) return;
    const { pending } = await api.getPending(projectId);
    set({ pending });
  },
}));
