const files = new Map<string, string>()

function keyStem(key: string) {
  return key.slice(0, key.lastIndexOf('.'))
}

export function setLocalPdfs(selected: FileList | File[]) {
  for (const url of files.values()) URL.revokeObjectURL(url)
  files.clear()
  for (const file of Array.from(selected)) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      files.set(file.name.replace(/\.pdf$/i, ''), URL.createObjectURL(file))
    }
  }
  return files.size
}

export function localPdfUrl(key: string) {
  return files.get(keyStem(key))
}
