import { invoke } from '@tauri-apps/api/core';
import type { OpenEditorFileOptions } from '../../../stores/editorStore';

function fileNameFromPath(path: string) {
  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalizedPath.split('/').pop() || normalizedPath;
}

export function resolveLocalPathFromHref(href: string) {
  const trimEditorLocationSuffix = (value: string) => value
    .replace(/#L\d+(?:C\d+)?$/i, '')
    .replace(/:\d+(?::\d+)?$/i, '');

  if (href.startsWith('file://')) {
    try {
      return trimEditorLocationSuffix(decodeURIComponent(new URL(href).pathname));
    } catch {
      return null;
    }
  }

  if (href.startsWith('/')) {
    return trimEditorLocationSuffix(href);
  }

  return null;
}

export async function openLocalPath(
  path: string,
  openFile: (path: string, name: string, content?: string, options?: OpenEditorFileOptions) => void
) {
  try {
    const content = await invoke<string>('terminal_read_file', {
      request: { path }
    });
    openFile(path, fileNameFromPath(path), content);
    return true;
  } catch (error) {
    try {
      await invoke('open_external_url', { url: path });
      return true;
    } catch (openError) {
      console.warn('[chat] failed to open local path from chat link', {
        path,
        readError: error,
        openError
      });
      return false;
    }
  }
}
