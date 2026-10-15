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
          <span
            title={data.note}
            style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', cursor: 'help' }}
          >
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
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: '2px solid var(--bg-secondary)',
                boxShadow: '0 0 0 1px var(--border-focus)',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {col.pk && <Key size={12} color="#fbbf24" />}
              <span
                style={{
                  fontWeight: col.pk ? 600 : 400,
                  color: col.pk ? '#fde68a' : 'var(--text-primary)',
                }}
              >
                {col.name}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {col.type}
              </span>
              {col.unique && !col.pk && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    background: 'rgba(139, 92, 246, 0.25)',
                    color: '#c4b5fd',
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    padding: '1px 4px',
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
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: '2px solid var(--bg-secondary)',
                boxShadow: '0 0 0 1px var(--border-focus)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
