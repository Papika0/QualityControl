import { useEffect, useState } from 'react'

/**
 * Object URLs for a list of stored blobs, keyed by id and revoked when the list
 * changes or the component unmounts — an un-revoked URL pins its blob in memory
 * for the life of the document.
 */
export function useBlobUrls(items: { id: string; blob: Blob }[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const map: Record<string, string> = {}
    for (const it of items) map[it.id] = URL.createObjectURL(it.blob)
    setUrls(map)
    return () => {
      setUrls({})
      Object.values(map).forEach(URL.revokeObjectURL)
    }
  }, [items])

  return urls
}
