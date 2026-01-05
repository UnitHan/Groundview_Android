import React from 'react';
import { UiNode } from '../store';

type NodeProps = {
  node: UiNode;
  depth: number;
  baseDepth: number;
  onSelect?: (node: UiNode) => void;
  onDoubleSelect?: (node: UiNode) => void;
  selectedId?: string;
  selectedBounds?: string;
  registerRef?: (id: string, bounds: string | undefined, el: HTMLDivElement | null) => void;
  collapsed: Record<string, boolean>;
  toggleCollapse: (id: string) => void;
};

const NodeRow: React.FC<NodeProps> = ({
  node,
  depth,
  baseDepth,
  onSelect,
  onDoubleSelect,
  selectedId,
  selectedBounds,
  registerRef,
  collapsed,
  toggleCollapse
}) => {
  const pad = Math.max(0, depth - baseDepth) * 6;
  const label = node.cls || '(node)';
  const isSelected = selectedId === node.id || (!selectedId && !!selectedBounds && node.bounds === selectedBounds);
  const isCollapsed = collapsed[node.id];
  const hasChildren = !!(node.children && node.children.length);
  const tags = [
    node.resourceId ? { label: `id: ${node.resourceId}`, color: '#38bdf8' } : null,
    node.contentDesc ? { label: `desc: ${node.contentDesc}`, color: '#22c55e' } : null,
    node.text ? { label: `text: ${node.text}`, color: '#fbbf24', textColor: '#0b1221' } : null
  ].filter(Boolean) as { label: string; color: string; textColor?: string }[];
  const flags = [
    node.clickable ? 'clickable' : '',
    node.focusable ? 'focusable' : '',
    node.scrollable ? 'scrollable' : '',
    node.checkable ? 'checkable' : '',
    node.longClickable ? 'long-clickable' : ''
  ].filter(Boolean);

  return (
    <>
      <div
        ref={(el) => registerRef && registerRef(node.id, node.bounds, el)}
        style={{
          paddingLeft: pad,
          paddingTop: 4,
          paddingBottom: 4,
          paddingRight: 24,
          background: isSelected ? '#1f2937' : 'transparent',
          cursor: onSelect ? 'pointer' : 'default',
          userSelect: 'none',
          transition: 'background 0.12s ease',
          borderRadius: 4,
          marginBottom: 2
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect && onSelect(node);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect && onSelect(node);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleSelect && onDoubleSelect(node);
        }}
        role="button"
        tabIndex={0}
      >
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.35,
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          whiteSpace: 'normal',
          overflow: 'visible',
          textOverflow: 'clip',
          color: '#cbd5e1'
        }}
      >
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(node.id);
            }}
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              textAlign: 'center',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: 10,
              lineHeight: '14px',
              flexShrink: 0,
              userSelect: 'none'
            }}
          >
            {isCollapsed ? '▸' : '▾'}
          </span>
        )}
        {!hasChildren && <span style={{ width: 14, flexShrink: 0 }} />}
        <span
          style={{
            fontWeight: 700,
            color: isSelected ? '#facc15' : '#22d3ee',
            flexShrink: 0
          }}
        >
          &lt;{label}&gt;
        </span>
        {tags.map((t, idx) => (
          <span
            key={idx}
            style={{
              background: t.color,
              color: t.textColor || '#0b1221',
              padding: '1px 5px',
              borderRadius: 4,
              fontSize: 11,
              lineHeight: 1.2,
              flexShrink: 0
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#94a3b8',
          paddingLeft: hasChildren ? 20 : 0,
          marginTop: 2
        }}
      >
        bounds: {node.bounds || '-'}
      </div>
      {flags.length > 0 && (
        <div
          style={{
            fontSize: 10,
            color: '#9ca3af',
            lineHeight: 1.2,
            marginTop: 4,
            paddingLeft: 20,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap'
          }}
        >
          {flags.map((f) => (
            <span
              key={f}
              style={{
                padding: '2px 6px',
                borderRadius: 999,
                background: '#111827',
                border: '1px solid #1f2937',
                color: '#cbd5e1',
                flexShrink: 0
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}
      </div>
      {node.children && node.children.length > 0 && !isCollapsed && (
        <div style={{ paddingLeft: pad }}>
          {node.children.map((c) => (
            <NodeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              baseDepth={baseDepth}
              onSelect={onSelect}
              onDoubleSelect={onDoubleSelect}
              selectedId={selectedId}
              selectedBounds={selectedBounds}
              registerRef={registerRef}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
            />
          ))}
        </div>
      )}
    </>
  );
};

export const TreeView: React.FC<{
  nodes: UiNode[];
  onSelect?: (node: UiNode) => void;
  onDoubleSelect?: (node: UiNode) => void;
  selectedId?: string;
  selectedBounds?: string;
}> = ({ nodes, onSelect, onDoubleSelect, selectedId, selectedBounds }) => {
  const nodeRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const boundsToId = React.useRef<Record<string, string>>({});
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const registerRef = (id: string, bounds: string | undefined, el: HTMLDivElement | null) => {
    nodeRefs.current[id] = el;
    if (bounds) boundsToId.current[bounds] = id;
  };

  // Flatten nodes to find by bounds
  const flattenNodes = React.useMemo(() => {
    const result: UiNode[] = [];
    const walk = (n: UiNode) => {
      result.push(n);
      n.children?.forEach(walk);
    };
    nodes.forEach(walk);
    return result;
  }, [nodes]);

  React.useEffect(() => {
    // Try ID first, then bounds via boundsToId map, then fallback to finding in nodes
    let targetId = selectedId;
    
    if (!targetId && selectedBounds) {
      // First try the boundsToId map (faster)
      targetId = boundsToId.current[selectedBounds];
      
      // If not in map yet, search nodes directly
      if (!targetId) {
        const nodeByBounds = flattenNodes.find(n => n.bounds === selectedBounds);
        if (nodeByBounds) {
          targetId = nodeByBounds.id;
        }
      }
    }
    
    if (!targetId) return;
    
    // Double RAF to ensure DOM is fully updated
    let raf1: number;
    let raf2: number;
    
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = nodeRefs.current[targetId];
        if (!el) return;
        
        const wrap = wrapRef.current;
        if (wrap) {
          const top = el.offsetTop - wrap.clientHeight / 2;
          wrap.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
        } else {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    });
    
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [selectedId, selectedBounds, flattenNodes]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filtered = nodes;

  const minDepth = (arr: UiNode[], depth = 0): number => {
    if (!arr.length) return Infinity;
    let best = Infinity;
    for (const n of arr) {
      best = Math.min(best, depth);
      if (n.children?.length) best = Math.min(best, minDepth(n.children, depth + 1));
    }
    return best === Infinity ? 0 : best;
  };
  const baseDepth = Math.max(0, minDepth(filtered));

  return (
    <div
      ref={wrapRef}
      style={{
        maxHeight: 540,
        overflowY: 'auto',
        overflowX: 'auto',
        background: '#0b1221',
        borderRadius: 8,
        padding: '8px 32px 8px 8px',
        border: '1px solid #1f2937',
        userSelect: 'none',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box'
      }}
    >
      {filtered.length === 0 && <div style={{ color: '#9ca3af' }}>No tree data.</div>}
      {filtered.map((n) => (
        <NodeRow
          key={n.id}
          node={n}
          depth={0}
          baseDepth={baseDepth}
          onSelect={onSelect}
          onDoubleSelect={onDoubleSelect}
          selectedId={selectedId}
          selectedBounds={selectedBounds}
          registerRef={registerRef}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
        />
      ))}
    </div>
  );
};
