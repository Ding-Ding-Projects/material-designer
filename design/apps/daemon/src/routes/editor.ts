// "Open in external editor" — the editor hand-off proper.
//
//   GET  /api/editor/detect   what is installed, what is chosen, what would run
//   POST /api/editor/open     open a project folder or a file in that editor
//
// Distinct from `host-tools.ts`, which is the broader "reveal this project in
// any local app" surface (Finder, Terminal, Warp, …) keyed to a project id.
// This surface is narrower and does three things that one does not:
//
//   1. It carries a PERSISTED CHOICE (`app-config.externalEditor`), so the
//      user picks their editor once — or adds their own executable — instead
//      of choosing from a list every time.
//   2. It opens a folder AS A WORKSPACE ROOT. `buildEditorLaunchArgs` puts the
//      folder first in the argument vector precisely so the window has a file
//      tree; a lone file in an empty window is the failure this exists to
//      avoid, which is why an editor that cannot take a folder says so rather
//      than quietly opening the file alone.
//   3. It accepts an arbitrary ABSOLUTE path, so anything the app can export
//      is openable in one action from wherever it was written — with its
//      containing directory as the workspace root by default.
//
// Security shape, in one place:
//   - Local-only. `POST /api/editor/open` spawns a process, so it sits behind
//     `requireLocalDaemonRequest` like every other launching endpoint.
//   - No shell, ever. The launch goes through `launchHostTool`, which routes
//     through `createCommandInvocation` (detached spawn, `.cmd`/`.bat` via
//     cmd.exe with verbatim CommandLineToArgvW-safe args, never `shell: true`).
//   - A path is data, not a command fragment. Every path reaching the argument
//     vector passes `assertEditorPathArg`: no NUL bytes, absolute and
//     normalized only. Shell metacharacters need no filtering because no shell
//     sees them; what IS rejected is anything that could still change meaning
//     at the argv layer (a relative path, a leading `-`).
//   - The executable is never taken from the request. It comes from the
//     catalogue probe or the user's own stored `custom` command — a caller can
//     choose WHICH editor, never WHAT binary.

import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { Express } from 'express';
import type {
  EditorDetectResponse,
  EditorNotFoundDetails,
  EditorOpenResponse,
  ExternalEditorId,
} from '@open-design/contracts';
import { isExternalEditorId } from '@open-design/contracts';
import {
  EditorArgumentError,
  buildEditorLaunchArgs,
  createFsEditorProbe,
  currentEditorPlatform,
  detectEditors,
  normalizeExternalEditorPrefs,
} from '../external-editors.js';
import type { EditorLaunchTarget } from '../external-editors.js';
import { launchHostTool, projectHostOpenDir } from './host-tools.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterEditorRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'projectFiles' | 'appConfig'> {}

export type EditorTargetKind = 'directory' | 'file' | 'missing';

async function classifyPath(candidate: string): Promise<EditorTargetKind> {
  try {
    const info = await stat(candidate);
    return info.isDirectory() ? 'directory' : 'file';
  } catch {
    return 'missing';
  }
}

function readStringField(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

export interface ResolvedEditorTarget {
  folder?: string;
  file?: string;
  /** True when the folder was derived from the file rather than requested. */
  folderWasDerived: boolean;
}

/**
 * Turn a request into the folder/file pair the editor will be handed.
 *
 * `openWorkspaceRoot` (default true) is what makes "open this export in VS
 * Code" one useful action: given only a file, the containing directory becomes
 * the workspace root so the file tree is usable. It is tracked as *derived* so
 * that an editor which cannot open folders drops it silently, while an
 * explicitly requested folder on such an editor is an honest error instead.
 */
export function resolveEditorTarget(input: {
  folder?: string;
  file?: string;
  projectDir?: string;
  pathKind?: EditorTargetKind;
  pathValue?: string;
  openWorkspaceRoot: boolean;
}): ResolvedEditorTarget {
  let folder = input.folder || input.projectDir || '';
  let file = input.file || '';
  if (input.pathValue) {
    if (input.pathKind === 'directory') {
      if (!folder) folder = input.pathValue;
    } else if (!file) {
      file = input.pathValue;
    }
  }
  let folderWasDerived = false;
  if (!folder && file && input.openWorkspaceRoot) {
    folder = path.dirname(file);
    folderWasDerived = true;
  }
  return {
    ...(folder ? { folder } : {}),
    ...(file ? { file } : {}),
    folderWasDerived,
  };
}

export function registerEditorRoutes(app: Express, ctx: RegisterEditorRoutesDeps) {
  const { db } = ctx;
  const { sendApiError, requireLocalDaemonRequest } = ctx.http;
  const { PROJECTS_DIR, RUNTIME_DATA_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { resolveProjectDir } = ctx.projectFiles;
  const { readAppConfig } = ctx.appConfig;

  async function detect(): Promise<EditorDetectResponse> {
    const config = await readAppConfig(RUNTIME_DATA_DIR);
    const platform = currentEditorPlatform();
    return detectEditors({
      platform,
      env: process.env,
      probe: createFsEditorProbe(process.env, platform),
      selected: normalizeExternalEditorPrefs(config?.externalEditor),
    });
  }

  app.get('/api/editor/detect', async (_req, res) => {
    try {
      res.json(await detect());
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.post('/api/editor/open', requireLocalDaemonRequest, async (req, res) => {
    try {
      const body: unknown = req.body;
      const requestedEditorId = readStringField(body, 'editorId');
      if (requestedEditorId && !isExternalEditorId(requestedEditorId)) {
        return sendApiError(res, 400, 'BAD_REQUEST', `unknown editor: ${requestedEditorId}`);
      }
      const projectId = readStringField(body, 'projectId');
      const requestedFolder = readStringField(body, 'folder');
      const requestedFile = readStringField(body, 'file');
      const requestedPath = readStringField(body, 'path');
      const openWorkspaceRoot =
        (body as { openWorkspaceRoot?: unknown } | null)?.openWorkspaceRoot !== false;

      if (!projectId && !requestedFolder && !requestedFile && !requestedPath) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'one of projectId, folder, file, or path is required',
        );
      }

      let projectDir = '';
      if (projectId) {
        const project = getProject(db, projectId);
        if (!project) {
          return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        }
        projectDir = projectHostOpenDir(PROJECTS_DIR, project, resolveProjectDir);
      }

      // A caller-supplied path is classified on disk rather than guessed from
      // its extension: a `.design` directory and an extensionless file both
      // exist, and opening the wrong one as a workspace root is exactly the
      // "no context" failure mode this route is meant to prevent.
      let pathKind: EditorTargetKind = 'missing';
      if (requestedPath) {
        pathKind = await classifyPath(requestedPath);
        if (pathKind === 'missing') {
          return sendApiError(res, 404, 'FILE_NOT_FOUND', `path does not exist: ${requestedPath}`);
        }
      }

      const target = resolveEditorTarget({
        ...(requestedFolder ? { folder: requestedFolder } : {}),
        ...(requestedFile ? { file: requestedFile } : {}),
        ...(projectDir ? { projectDir } : {}),
        ...(requestedPath ? { pathKind, pathValue: requestedPath } : {}),
        openWorkspaceRoot,
      });

      const detection = await detect();
      // Falling back to `selectedEditorId` when nothing is effective is what
      // lets the miss be reported by NAME: `effectiveEditorId` is deliberately
      // null when the user's stored choice is no longer installed, and
      // "Cursor is not installed" is a far more useful answer than "no editor
      // was found" on a machine that has three of them.
      const editorId: ExternalEditorId | null = requestedEditorId
        ? (requestedEditorId as ExternalEditorId)
        : detection.effectiveEditorId ?? detection.selectedEditorId;
      const editor = editorId
        ? detection.editors.find((candidate) => candidate.id === editorId)
        : undefined;

      if (!editorId || !editor || !editor.available || !editor.command) {
        // Honest degradation. Nothing else is launched in place of the editor
        // that was asked for (or chosen), and the reply carries the download
        // URL plus everything that was probed so the client can offer the
        // install rather than a dead end.
        const details: EditorNotFoundDetails = {
          kind: 'editor-not-found',
          ...(editorId ? { editorId } : {}),
          downloadUrl: editor?.downloadUrl ?? detection.vscodeDownloadUrl,
          probedCommands: editor?.probedCommands ?? [],
          probedPaths: editor?.probedPaths ?? [],
        };
        const message = editorId
          ? `${editor?.label ?? editorId} is not installed on this machine`
          : 'no external editor was found on this machine';
        return sendApiError(res, 409, 'EDITOR_NOT_FOUND', message, { details });
      }

      const command = editor.command;

      // An editor that cannot open a folder keeps the file, and loses only a
      // workspace root the caller never asked for. An explicitly requested
      // folder is a different story — buildEditorLaunchArgs throws, and the
      // caller is told which editor cannot do it.
      const launchTarget: EditorLaunchTarget =
        target.folderWasDerived && !editor.supportsFolders
          ? { ...(target.file !== undefined ? { file: target.file } : {}) }
          : {
              ...(target.folder !== undefined ? { folder: target.folder } : {}),
              ...(target.file !== undefined ? { file: target.file } : {}),
            };

      let args: string[];
      try {
        args = buildEditorLaunchArgs(editor, launchTarget);
      } catch (err) {
        if (err instanceof EditorArgumentError) {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        throw err;
      }

      const launch = await launchHostTool(command, args);
      if (!launch.ok) {
        return sendApiError(
          res,
          500,
          'EDITOR_LAUNCH_FAILED',
          `Failed to launch ${editor.label}: ${launch.error}`,
        );
      }

      const responseBody: EditorOpenResponse = {
        ok: true,
        editorId: editor.id,
        label: editor.label,
        command,
        args,
        ...(launchTarget.folder !== undefined ? { folder: launchTarget.folder } : {}),
        ...(launchTarget.file !== undefined ? { file: launchTarget.file } : {}),
      };
      res.json(responseBody);
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });
}
