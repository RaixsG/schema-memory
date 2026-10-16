import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Column } from '../types';
import { Key, Hash, HelpCircle } from 'lucide-react';

export interface TableNodeData {
  name: string;
  columns: Column[];
  note?: string | null;
  isSelected?: boolean;
  onSelect?: () => void;
  isDimmed?: boolean;
  isRelationshipEndpoint?: 'source' | 'target' | null;
  highlightedColumns?: Array<{ name: string; role: 'source' | 'target' }>;
}

export const TableNode = memo(function TableNode({
  data,
  selected,
}: {
  data: TableNodeData;
  selected?: boolean;
}) {
  const isSelected = selected ?? data.isSelected ?? false;
  const isEndpoint = data.isRelationshipEndpoint;

  let borderColor = isSelected ? 'var(--accent)' : 'var(--border)';
  let boxShadow = isSelected
    ? '0 0 0 3px rgba(59, 130, 246, 0.35)'
    : '0 4px 12px rgba(0, 0, 0, 0.35)';

  if (isEndpoint === 'source') {
    borderColor = '#3b82f6';
    boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.45), 0 8px 24px rgba(59, 130, 246, 0.25)';
  } else if (isEndpoint === 'target') {
    borderColor = '#10b981';
    boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.45), 0 8px 24px rgba(16, 185, 129, 0.25)';
  }

  return (
    <div
      onClick={data.onSelect}
      style={{
        minWidth: 220,
        backgroundColor: 'var(--bg-secondary)',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        boxShadow,
        opacity: data.isDimmed ? 0.3 : 1,
        filter: data.isDimmed ? 'grayscale(35%)' : 'none',
        transition: 'opacity 0.25s ease, filter 0.25s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Table Header */}
      <div
        style={{
          backgroundColor: isSelected
            ? 'var(--bg-tertiary)'
            : isEndpoint === 'source'
            ? 'rgba(59, 130, 246, 0.15)'
            : isEndpoint === 'target'
            ? 'rgba(16, 185, 129, 0.15)'
            : '#1a1e2b',
          padding: '8px 12px',
          borderBottom: `1px solid ${isEndpoint ? borderColor : 'var(--border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Hash
            size={14}
            color={isEndpoint === 'source' ? '#3b82f6' : isEndpoint === 'target' ? '#10b981' : 'var(--accent)'}
          />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
            {data.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isEndpoint === 'source' && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: '#93c5fd',
                background: 'rgba(59, 130, 246, 0.25)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                padding: '1px 5px',
                borderRadius: 4,
                letterSpacing: 0.5,
              }}
            >
              ORIGEN
            </span>
          )}
          {isEndpoint === 'target' && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: '#6ee7b7',
                background: 'rgba(16, 185, 129, 0.25)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                padding: '1px 5px',
                borderRadius: 4,
                letterSpacing: 0.5,
              }}
            >
              DESTINO
            </span>
          )}
          {data.note && (
            <span
              title={data.note}
              style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', cursor: 'help' }}
            >
              <HelpCircle size={13} />
            </span>
          )}
        </div>
      </div>

      {/* Columns */}
      <div style={{ padding: '4px 0' }}>
        {data.columns.map((col) => {
          const highlight = data.highlightedColumns?.find((h) => h.name === col.name);
          const isSourceCol = highlight?.role === 'source';
          const isTargetCol = highlight?.role === 'target';

          let colBg = 'transparent';
          let borderLeftStyle = '3px solid transparent';
          let handleColor = 'var(--accent)';
          let handleSize = 8;
          let handleShadow = '0 0 0 1px var(--border-focus)';

          if (isSourceCol) {
            colBg = 'rgba(59, 130, 246, 0.2)';
            borderLeftStyle = '3px solid #3b82f6';
            handleColor = '#3b82f6';
            handleSize = 10;
            handleShadow = '0 0 8px rgba(59, 130, 246, 0.8)';
          } else if (isTargetCol) {
            colBg = 'rgba(16, 185, 129, 0.2)';
            borderLeftStyle = '3px solid #10b981';
            handleColor = '#10b981';
            handleSize = 10;
            handleShadow = '0 0 8px rgba(16, 185, 129, 0.8)';
          }

          return (
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
                backgroundColor: colBg,
                borderLeft: borderLeftStyle,
                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                transition: 'background-color 0.2s ease, border-left 0.2s ease',
              }}
            >
              {/* Left handle for incoming relations */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${col.name}-l`}
                style={{
                  background: handleColor,
                  width: handleSize,
                  height: handleSize,
                  borderRadius: '50%',
                  border: '2px solid var(--bg-secondary)',
                  boxShadow: handleShadow,
                  transition: 'all 0.2s ease',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {col.pk && <Key size={12} color="#fbbf24" />}
                <span
                  style={{
                    fontWeight: col.pk || highlight ? 600 : 400,
                    color: isSourceCol
                      ? '#93c5fd'
                      : isTargetCol
                      ? '#6ee7b7'
                      : col.pk
                      ? '#fde68a'
                      : 'var(--text-primary)',
                  }}
                >
                  {col.name}
                </span>
                {isSourceCol && (
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      color: '#93c5fd',
                      background: 'rgba(59, 130, 246, 0.3)',
                      padding: '1px 4px',
                      borderRadius: 3,
                    }}
                  >
                    FK ➜
                  </span>
                )}
                {isTargetCol && (
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      color: '#6ee7b7',
                      background: 'rgba(16, 185, 129, 0.3)',
                      padding: '1px 4px',
                      borderRadius: 3,
                    }}
                  >
                    ➜ REF
                  </span>
                )}
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
                  background: handleColor,
                  width: handleSize,
                  height: handleSize,
                  borderRadius: '50%',
                  border: '2px solid var(--bg-secondary)',
                  boxShadow: handleShadow,
                  transition: 'all 0.2s ease',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});


