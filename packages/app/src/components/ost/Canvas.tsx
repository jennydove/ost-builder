import { useRef, useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';

// Don't start dragging when the pointer is on an interactive element or when panning
class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        if (!event.isPrimary || event.button !== 0) return false;
        if (event.shiftKey) return false; // Allow shift+drag for canvas panning
        let el = event.target as HTMLElement | null;
        let onCard = false;
        while (el) {
          if (el.dataset.ostCard !== undefined) { onCard = true; break; }
          if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(el.tagName)) return false;
          el = el.parentElement;
        }
        return onCard; // Only activate dnd-kit when pointer starts on a card
      },
    },
  ];
}
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';
import { useOSTStore } from '@/store/ostStore';
import { TreeNode } from './TreeNode';
import { OSTCard } from './OSTCard';
import { AddCardButton } from './AddCardButton';
import { LayoutToggleAction } from './header/actions/LayoutToggleAction';
import { SettingsAction } from './header/actions/SettingsAction';
import { ExportAction } from './header/actions/ExportAction';
import { CanvasSyncAction } from './header/actions/CanvasSyncAction';
import { cn } from '@/lib/utils';
import type { OSTCard as OSTCardType } from '@ost-builder/shared';
import { Button } from '@/components/ui/button';
import { computeFitView } from '@/lib/fitView';

const SENSOR_OPTIONS = { activationConstraint: { distance: 8 } };

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rootIds = useOSTStore((state) => state.tree.rootIds);
  const canvasState = useOSTStore((state) => state.canvasState);
  const layoutDirection = useOSTStore((state) => state.layoutDirection);
  const setZoom = useOSTStore((state) => state.setZoom);
  const setOffset = useOSTStore((state) => state.setOffset);
  const addCard = useOSTStore((state) => state.addCard);
  const moveCard = useOSTStore((state) => state.moveCard);
  const selectCard = useOSTStore((state) => state.selectCard);
  const isHorizontal = layoutDirection === 'horizontal';
  const [isPanning, setIsPanning] = useState(false);
  const [activeCard, setActiveCard] = useState<OSTCardType | null>(null);
  const fitInProgressRef = useRef(false);

  const sensors = useSensors(useSensor(SmartPointerSensor, SENSOR_OPTIONS));

  // Panning via native pointer events in capture phase — this runs before dnd-kit's
  // onPointerDown on cards (which calls stopPropagation, preventing mouse events from
  // firing). Using refs avoids React re-render timing issues with isPanning state.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let panStartX = 0;
    let panStartY = 0;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const onCard = target?.closest('[data-ost-card]') !== null;
      const onInteractive = target?.closest('button, input, textarea, select, a, [role="menuitem"], [role="option"]') !== null;
      const isPanGesture =
        e.button === 1 || (e.button === 0 && e.shiftKey) || (e.button === 0 && !onCard && !onInteractive);
      if (!isPanGesture) return;
      e.preventDefault();
      e.stopPropagation(); // prevent dnd-kit from also activating on shift+drag
      panStartX = e.clientX - useOSTStore.getState().canvasState.offset.x;
      panStartY = e.clientY - useOSTStore.getState().canvasState.offset.y;
      container.setPointerCapture(e.pointerId);
      setIsPanning(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!container.hasPointerCapture(e.pointerId)) return;
      useOSTStore.getState().setOffset(e.clientX - panStartX, e.clientY - panStartY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!container.hasPointerCapture(e.pointerId)) return;
      container.releasePointerCapture(e.pointerId);
      setIsPanning(false);
    };

    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const { canvasState } = useOSTStore.getState();
        setZoom(canvasState.zoom + delta);
      } else {
        const { canvasState } = useOSTStore.getState();
        setOffset(canvasState.offset.x - e.deltaX, canvasState.offset.y - e.deltaY);
      }
    },
    [setZoom, setOffset],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const card = useOSTStore.getState().tree.cards[active.id as string];
    if (card) {
      setActiveCard(card);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (over) {
      const droppableId = over.id as string;
      if (droppableId.startsWith('droppable-')) {
        const newParentId = droppableId.replace('droppable-', '');
        if (newParentId !== active.id) {
          moveCard(active.id as string, newParentId);
        }
      }
    }
  }, [moveCard]);

  const handleCanvasClick = () => {
    selectCard(null);
  };

  const handleResetView = () => {
    setZoom(1);
    setOffset(0, 0);
  };

  const handleFitToScreen = () => {
    if (!containerRef.current || !contentRef.current) return;
    if (fitInProgressRef.current) return;
    fitInProgressRef.current = true;

    const containerRect = containerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();
    const currentState = useOSTStore.getState().canvasState;
    const { zoom, offsetX, offsetY } = computeFitView(
      containerRect,
      contentRect,
      currentState.zoom,
      currentState.offset.x,
      currentState.offset.y,
    );

    setZoom(zoom);
    setOffset(offsetX, offsetY);
    requestAnimationFrame(() => {
      if (!containerRef.current || !contentRef.current) return;
      const nextContainerRect = containerRef.current.getBoundingClientRect();
      const nextContentRect = contentRef.current.getBoundingClientRect();
      const nextState = useOSTStore.getState().canvasState;
      const next = computeFitView(
        nextContainerRect,
        nextContentRect,
        nextState.zoom,
        nextState.offset.x,
        nextState.offset.y,
      );
      setZoom(next.zoom);
      setOffset(next.offsetX, next.offsetY);
      fitInProgressRef.current = false;
    });
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full overflow-hidden canvas-grid',
        isPanning ? 'cursor-grabbing' : 'cursor-default',
      )}
      data-ost-export
      onWheel={handleWheel}
      onClick={handleCanvasClick}
    >
      {/* Zoom controls */}
      <div
        className="absolute bottom-6 left-6 flex items-center gap-2 bg-card border border-border rounded-lg p-1 shadow-lg z-50"
        data-ost-export-exclude
      >
        <Button
          data-testid="zoom-out"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom(canvasState.zoom - 0.1)}
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span data-testid="zoom-level" className="text-xs font-medium w-12 text-center">
          {Math.round(canvasState.zoom * 100)}%
        </span>
        <Button
          data-testid="zoom-in"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom(canvasState.zoom + 0.1)}
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-border" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleResetView}>
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFitToScreen}>
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Canvas side controls */}
      <div
        className="absolute top-6 right-6 flex items-center gap-2 bg-card border border-border rounded-lg p-1 shadow-lg z-50"
        data-ost-export-exclude
        onClick={(e) => e.stopPropagation()}
      >
        <ExportAction />
        <div className="w-px h-6 bg-border" />
        <CanvasSyncAction />
        <div className="w-px h-6 bg-border" />
        <LayoutToggleAction compact />
        <div className="w-px h-6 bg-border" />
        <SettingsAction />
      </div>

      {/* Canvas content */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          data-ost-export-content
          className="absolute inset-0 flex justify-center pt-16"
          style={{
            transform: `translate(${canvasState.offset.x}px, ${canvasState.offset.y}px) scale(${canvasState.zoom})`,
            transformOrigin: '50% 0',
          }}
        >
          <div ref={contentRef} data-ost-export-bounds className="flex flex-col items-center gap-6">
            {/* Add new root outcome button */}
            {rootIds.length > 0 && (
              <div className="mt-2">
                <AddCardButton type="outcome" onClick={() => addCard('outcome', null)} size="md" />
              </div>
            )}

            {/* Root nodes */}
            {rootIds.length === 0 ? (
              <div className="flex flex-col items-center gap-4 mt-32">
                <p className="text-muted-foreground text-lg">Start by adding an Outcome</p>
                <AddCardButton type="outcome" onClick={() => addCard('outcome', null)} size="md" />
              </div>
            ) : (
              <div className={cn('flex gap-16', isHorizontal && 'flex-col')}>
                {rootIds.map((rootId) => (
                  <TreeNode key={rootId} cardId={rootId} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeCard && <OSTCard card={activeCard} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
