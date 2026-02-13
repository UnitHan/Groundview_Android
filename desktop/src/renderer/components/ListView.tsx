import React from 'react';
import { formatParagraphs } from '../utils/locatorHelpers';

interface ListViewProps {
  nodes: any[];
  selectedNodeId?: string;
  selectedBounds?: string;
  onSelect: (id: string, bounds?: string) => void;
  onDoubleClick: (node: any) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  nodes,
  selectedNodeId,
  selectedBounds,
  onSelect,
  onDoubleClick
}) => {
  const listRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const listWrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    console.log('[ListView] useEffect triggered:', { selectedNodeId, selectedBounds, nodesLength: nodes.length });
    
    // Find target element by ID or bounds
    let targetId = selectedNodeId;
    
    // If no ID but bounds exists, find node by bounds
    if (!targetId && selectedBounds) {
      const nodeByBounds = nodes.find(n => n.bounds === selectedBounds);
      console.log('[ListView] Searching by bounds:', selectedBounds, 'found:', nodeByBounds?.id);
      if (nodeByBounds) {
        targetId = nodeByBounds.id;
      }
    }
    
    if (!targetId) {
      console.log('[ListView] No targetId, skipping scroll');
      return;
    }
    
    console.log('[ListView] Will scroll to targetId:', targetId);
    
    // Use setTimeout to ensure refs are set after render
    const timeoutId = setTimeout(() => {
      // Double RAF to ensure DOM is fully updated
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          const el = listRefs.current[targetId!];
          const wrap = listWrapRef.current;
          
          if (!el) {
            console.warn('[ListView] Element not found for id:', targetId);
            console.log('[ListView] Available refs:', Object.keys(listRefs.current));
            return;
          }
          
          if (!wrap) {
            console.warn('[ListView] Wrapper not found');
            return;
          }
          
          console.log('[ListView] Scrolling to element:', targetId);
          
          // Manual scroll calculation for more reliable behavior
          const wrapRect = wrap.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const scrollTop = wrap.scrollTop;
          
          // Calculate target scroll position to center the element
          const targetScrollTop = scrollTop + (elRect.top - wrapRect.top) - (wrapRect.height / 2) + (elRect.height / 2);
          
          console.log('[ListView] Scroll calculation:', {
            currentScrollTop: scrollTop,
            targetScrollTop,
            wrapHeight: wrapRect.height,
            elTop: elRect.top,
            wrapTop: wrapRect.top
          });
          
          // Use smooth scrolling
          wrap.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        });
      });
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [selectedNodeId, selectedBounds]);

  return (
    <div
      ref={listWrapRef}
      style={{
        maxHeight: 520,
        overflowY: 'auto',
        background: '#0b1221',
        borderRadius: 8,
        padding: 8,
        border: '1px solid #1f2937',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}
    >
      {nodes.length === 0 && <div style={{ color: '#9ca3af' }}>No tree data.</div>}
      {nodes.map((n) => {
        const label = n.resourceId || n.contentDesc || n.text || n.cls || '(node)';
        const isSel = selectedNodeId === n.id || (!selectedNodeId && !!selectedBounds && selectedBounds === n.bounds);
        const paragraphs = formatParagraphs(n.text || n.contentDesc);
        
        return (
          <div
            key={n.id}
            ref={(el) => {
              if (el) {
                listRefs.current[n.id] = el;
              } else {
                delete listRefs.current[n.id];
              }
            }}
            data-bounds={n.bounds || ''}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(n.id, n.bounds);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onSelect(n.id, n.bounds);
              onDoubleClick(n);
            }}
            style={{
              padding: 8,
              borderRadius: 8,
              border: '1px solid #1f2937',
              background: isSel ? '#4338ca' : '#0e1726',
              color: '#e5e7eb',
              cursor: 'pointer'
            }}
            title={n.bounds || ''}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
              {n.resourceId && (
                <span style={{ background: '#0f172a', color: '#38bdf8', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                  id: {n.resourceId}
                </span>
              )}
              {n.contentDesc && (
                <span style={{ background: '#14532d', color: '#4ade80', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                  desc: {n.contentDesc}
                </span>
              )}
              {n.text && (
                <span style={{ background: '#78350f', color: '#fbbf24', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                  text: {n.text}
                </span>
              )}
              {n.clickable && (
                <span style={{ background: '#0f172a', color: '#facc15', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                  clickable
                </span>
              )}
              {n.focusable && (
                <span style={{ background: '#0f172a', color: '#a5b4fc', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                  focusable
                </span>
              )}
              {n.scrollable && (
                <span style={{ background: '#0f172a', color: '#f472b6', padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>
                  scrollable
                </span>
              )}
            </div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{label}</div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
              class: {n.cls || '-'} • id: {n.resourceId || '-'} • desc: {n.contentDesc || '-'}
            </div>
            <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {paragraphs.map((p: string, idx: number) => (
                <div key={idx} style={{ marginBottom: 4 }}>
                  {p}
                </div>
              ))}
            </div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>bounds: {n.bounds || '-'}</div>
          </div>
        );
      })}
    </div>
  );
};
