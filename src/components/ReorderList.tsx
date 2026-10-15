import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './ui';

/** Ordered list with drag on desktop and up/down buttons everywhere (touch and keyboard). */
export function ReorderList({
  items,
  onChange,
  render,
  label,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  render?: (item: string, index: number) => ReactNode;
  label: string;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <ol className="reorder" aria-label={label}>
      {items.map((item, i) => (
        <li
          // Stat patterns repeat values, so the position is part of the key.
          key={`${item}-${i}`}
          className={`reorder-item${dragging === i ? ' is-dragging' : ''}`}
          draggable
          onDragStart={(e) => {
            setDragging(i);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null) move(dragging, i);
            setDragging(null);
          }}
          onDragEnd={() => setDragging(null)}
        >
          <span className="reorder-grip" aria-hidden="true">
            <Icon name="grip" size={16} />
          </span>
          <span className="reorder-rank num">{i + 1}</span>
          <span className="reorder-label">{render ? render(item, i) : item}</span>
          <span className="reorder-actions">
            <IconButton
              icon="up"
              label={`Move ${item} up`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            />
            <IconButton
              icon="down"
              label={`Move ${item} down`}
              disabled={i === items.length - 1}
              onClick={() => move(i, i + 1)}
            />
            <IconButton
              icon="close"
              label={`Remove ${item}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}
