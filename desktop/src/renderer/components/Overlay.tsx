import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UiNode } from '../store';

type Props = {
  nodes: UiNode[];
  selectedId?: string;
  selectedBounds?: string;
  onSelect?: (node: UiNode) => void;
  onDoubleSelect?: (node: UiNode) => void;
  screenshotPath?: string;
  disableHighlight?: boolean;
};

export const parseBounds = (b?: string) => {
  if (!b) return null;
  const m = b.match(/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/);
  if (!m) return null;
  return {
    x1: Number(m[1]),
    y1: Number(m[2]),
    x2: Number(m[3]),
    y2: Number(m[4])
  };
};

export const flatNodes = (nodes: UiNode[]): UiNode[] => {
  const out: UiNode[] = [];
  const walk = (n: UiNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
};

const palette = ['#22c55eaa', '#f97316aa', '#3b82f6aa', '#a855f7aa', '#eab308aa'];

const shouldIgnoreNode = (n: UiNode, b: { x1: number; y1: number; x2: number; y2: number }, ratio: number) => {
  const area = (b.x2 - b.x1) * (b.y2 - b.y1);
  const cls = (n.cls || '').toLowerCase();
  const rid = (n.resourceId || '').toLowerCase();
  const patterns = ['round_corner', 'statusbarbackground', 'navigationbarbackground', 'decor', 'background'];
  const hitsPattern = patterns.some((p) => cls.includes(p) || rid.includes(p));
  return hitsPattern || ratio > 0.9;
};

const isMeaningful = (n: UiNode) =>
  !!(
    n.resourceId ||
    n.contentDesc ||
    n.text ||
    n.clickable ||
    n.focusable ||
    n.checkable ||
    n.scrollable ||
    n.longClickable
  );

type OverlayItem = {
  n: UiNode;
  b: { x1: number; y1: number; x2: number; y2: number };
  color: string;
  tooBig?: boolean;
  ratio?: number;
  selected?: boolean;
  faded?: boolean;
};

export const buildOverlayItems = (
  nodes: UiNode[],
  natural: { w: number; h: number },
  selectedId?: string,
  selectedBounds?: string
): OverlayItem[] => {
  const flat = flatNodes(nodes)
    .map((n, idx) => {
      const b = parseBounds(n.bounds);
      if (!b) return null;
      return { n, b, color: palette[idx % palette.length] } as OverlayItem;
    })
    .filter(Boolean) as OverlayItem[];
  const imgArea = natural.w * natural.h || 1;
  const annotated = flat.map((i) => {
    const area = (i.b.x2 - i.b.x1) * (i.b.y2 - i.b.y1);
    const ratio = imgArea > 0 ? area / imgArea : 0;
    const ignore = shouldIgnoreNode(i.n, i.b, ratio);
    return { ...i, tooBig: ignore, ratio };
  });
  const hasSelection = !!selectedId || !!selectedBounds;
  return annotated.map((i) => {
    const selected = selectedId ? i.n.id === selectedId : !!selectedBounds && i.n.bounds === selectedBounds;
    const faded = hasSelection && !selected;
    return {
      ...i,
      ...(selected ? { selected: true } : {}),
      ...(faded ? { faded: true } : {})
    };
  });
};

export const Overlay: React.FC<Props> = ({
  nodes,
  selectedId,
  selectedBounds,
  onSelect,
  onDoubleSelect,
  screenshotPath,
  disableHighlight
}) => {
  const toFileUrl = (p?: string) => {
    if (!p) return undefined;
    // Normalize Windows paths so Chromium accepts them (file:///C:/...)
    const normalized = p.replace(/\\/g, '/');
    if (normalized.startsWith('file://')) return normalized;
    if (normalized.startsWith('/')) return `file://${normalized}`;
    return `file:///${normalized}`;
  };

  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [rendered, setRendered] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [display, setDisplay] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const list = useMemo(
    () => buildOverlayItems(nodes, natural, selectedId, selectedBounds),
    [nodes, natural, selectedId, selectedBounds]
  );

  // letterbox-aware scale/offset
  const scale = Math.min(rendered.w / natural.w, rendered.h / natural.h);
  const displayW = natural.w * scale;
  const displayH = natural.h * scale;
  const offsetX = (rendered.w - displayW) / 2;
  const offsetY = (rendered.h - displayH) / 2;

  const src = toFileUrl(screenshotPath || (nodes.length ? nodes[0].screenshotPath : undefined));
  const ready = imgLoaded && natural.w > 1 && natural.h > 1 && rendered.w > 1 && rendered.h > 1;

  useEffect(() => {
    const handleResize = () => {
      const el = imgRef.current;
      if (!el) return;
      setRendered({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!src) {
    return (
      <div
        style={{
          borderRadius: 8,
          background: '#0b1221',
          color: '#9ca3af',
          padding: 12,
          border: '1px dashed #1f2937'
        }}
      >
        No screenshot available. Capture first.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxHeight: 700, overflow: 'hidden', pointerEvents: 'auto' }}>
      <img
        ref={imgRef}
        src={src}
        alt=""
        style={{ width: '100%', maxHeight: 640, objectFit: 'contain', borderRadius: 8, display: 'block' }}
        onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
          const el = e.currentTarget;
          setNatural({ w: el.naturalWidth || 1, h: el.naturalHeight || 1 });
          setRendered({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
          setDisplay({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
          setImgLoaded(true);
        }}
      />
      {ready && !disableHighlight &&
        list.map((item, idx) => {
          const { n, b, color } = item;
          const x = b.x1 * scale + offsetX;
          const y = b.y1 * scale + offsetY;
          const w = (b.x2 - b.x1) * scale;
          const h = (b.y2 - b.y1) * scale;
          const isSel = n.id === selectedId || (!selectedId && !!selectedBounds && n.bounds === selectedBounds);
          const area = w * h;
          const z = Math.min(200, Math.floor(1000000 / (area + 1)));
          return (
            <div
              key={`${n.id}-${idx}`}
              onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
                onSelect && onSelect(n);
              }}
              onDoubleClick={(e: React.MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
                onDoubleSelect && onDoubleSelect(n);
              }}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                height: h,
                border: isSel
                  ? `3px solid ${color.replace('aa', 'ff')}`
                  : `2px solid ${color}`,
                opacity: isSel ? 1 : 0.6,
                background: isSel ? color.replace('aa', '30') : 'transparent',
                borderRadius: 6,
                cursor: 'pointer',
                boxSizing: 'border-box',
                pointerEvents: 'auto',
                zIndex: Math.max(1, z)
              }}
              title={n.text || n.resourceId || n.cls}
            />
          );
        })}
    </div>
  );
};
