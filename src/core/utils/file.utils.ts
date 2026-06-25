/**
 * Renombra un File para que el nombre subido al backend coincida con el "Nombre del
 * documento" elegido por el usuario (en vez del nombre original del archivo), preservando
 * la extensión real para que la previsualización/descarga sigan funcionando.
 */
export function renameFileForUpload(file: File, desiredName: string, index = 0, total = 1): File {
  const trimmed = desiredName.trim();
  if (!trimmed) return file;

  const dotIdx = file.name.lastIndexOf('.');
  const ext = dotIdx > -1 ? file.name.slice(dotIdx) : '';
  const suffix = total > 1 ? ` (${index + 1})` : '';

  return new File([file], `${trimmed}${suffix}${ext}`, { type: file.type, lastModified: file.lastModified });
}
