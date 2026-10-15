import { Handle, Position } from '@xyflow/react';
import { Column } from '../types';
import { Key, Hash, HelpCircle } from 'lucide-react';

export interface TableNodeData {
  name: string;
  columns: Column[];
  note?: string | null;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function TableNode({ data }: { data: TableNodeData }) {
  return (
    <div
      onClick={data.onSelect}
      style={{
        minWidth: 220,
        backgroundColor: 'var(--bg-secondary)',
        border: `2px solid ${data.isSelected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        boxShadow: data.isSelected
          ? '0 0 0 3px rgba(59, 130, 246, 0.25)'
          : '0 4px 12px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Table Header */}
      <div
        style={{
          backgroundColor: data.isSelected ? 'var(--bg-tertiary)' : '#1a1e2b',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Hash size={14} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
            {data.name}
          </span>
        </div>
        {data.note && (
          <span title={data.note} style={{ color: 'var(--text-muted)' }}>
            <HelpCircle size={13} />
          </span>
        )}
      </div>

      {/* Columns */}
      <div style={{ padding: '4px 0' }}>
        {data.columns.map((col) => (
          <div
            key={col.name}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 12px',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
            }}
          >
            {/* Left handle for incoming relations */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.name}-l`}
              style={{
                background: 'var(--accent)',
                width: 7,
                height: 7,
                border: 'none',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {col.pk && <Key size={11} color="#f59e0b" />}
              <span
                style={{
                  fontWeight: col.pk ? 600 : 400,
                  color: col.pk ? '#fcd34d' : 'var(--text-primary)',
                }}
              >
                {col.name}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {col.type}
              </span>
              {col.unique && !col.pk && (
                <span
                  style={{
                    fontSize: 9,
                    background: 'var(--purple-bg)',
                    color: 'var(--purple)',
                    padding: '1px 3px',
                    borderRadius: 3,
                  }}
                >
                  UQ
                </span>
              )}
            </div>

            {/* Right handle for outgoing relations */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${col.name}-r`}
              style={{
                background: 'var(--accent)',
                width: 7,
                height: 7,
                border: 'none',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
