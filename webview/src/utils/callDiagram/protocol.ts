import type { CallDiagramData } from '../../../../src/analyzer/calls/diagramData';
import { findFolderNode } from '../../../../src/analyzer/calls/diagramData';
import { buildDiagramModel } from './model';
import { computeDiagramLayout, type DiagramLayout, type ElkLike } from './layout';

export interface DiagramRequest {
  requestId: number;
  data: CallDiagramData;
  /** Optional folder restriction within the tab's scope (workspace-relative). */
  folderPath?: string;
}

export type DiagramStage = 'model' | 'layout' | 'edges';

export type DiagramResponse =
  | { requestId: number; type: 'progress'; stage: DiagramStage }
  | { requestId: number; type: 'result'; layout: DiagramLayout | null }
  | { requestId: number; type: 'error'; message: string };

/** Restricts diagram data to a folder below the tab's scope (edges leaving it become stubs). */
export function restrictToFolder(data: CallDiagramData, folderPath?: string): CallDiagramData {
  if (!folderPath || !data.tree) return data;
  const tree = findFolderNode(data.tree, folderPath);
  return tree ? { ...data, tree, scopePath: folderPath } : data;
}

/** Builds the model and lays it out with ELK for one request, reporting progress. */
export async function handleDiagramRequest(
  req: DiagramRequest,
  post: (msg: DiagramResponse) => void,
  elk: ElkLike
): Promise<void> {
  try {
    post({ requestId: req.requestId, type: 'progress', stage: 'model' });
    const data = restrictToFolder(req.data, req.folderPath);
    const model = buildDiagramModel(data);
    if (!model) {
      post({ requestId: req.requestId, type: 'result', layout: null });
      return;
    }
    post({ requestId: req.requestId, type: 'progress', stage: 'layout' });
    const layout = await computeDiagramLayout(data, model, elk);
    post({ requestId: req.requestId, type: 'result', layout });
  } catch (err) {
    post({ requestId: req.requestId, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}
