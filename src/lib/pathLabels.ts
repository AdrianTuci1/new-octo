export function formatCompactPathLabel(path: string | null, homeDir: string | null) {
  if (!path) {
    return '~';
  }

  if (!homeDir) {
    const pathSegments = path.split('/').filter(Boolean);
    return pathSegments[pathSegments.length - 1] ?? path;
  }

  if (path === homeDir) {
    return '~';
  }

  if (path.startsWith(`${homeDir}/`)) {
    const relativeSegments = path.slice(homeDir.length + 1).split('/').filter(Boolean);
    if (relativeSegments.length === 0) {
      return '~';
    }

    return `~/${relativeSegments[relativeSegments.length - 1]}`;
  }

  const pathSegments = path.split('/').filter(Boolean);
  return pathSegments[pathSegments.length - 1] ?? path;
}
