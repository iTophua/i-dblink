import { BaseEdge } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { selfLoopPath } from './layout';

/**
 * 自引用外键（如 categories.parent_id → categories.id）。
 * 库自带的连线类型不处理自环：从右侧出、左侧入会被画成一条横穿表身的直线。
 * 这里让线的两端都落在右侧的连接点上，出去绕一小圈再回来。
 */
export function SelfLoopEdge({ id, sourceX, sourceY, markerStart, markerEnd, style }: EdgeProps) {
  return (
    <BaseEdge
      id={id}
      path={selfLoopPath(sourceX, sourceY)}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
    />
  );
}
