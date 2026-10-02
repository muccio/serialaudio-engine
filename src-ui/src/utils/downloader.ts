/**
 * Robust file downloader utility for SerialAudio Engine.
 * Replaces fragile `window.open` with direct blob streaming,
 * deferred ObjectURL cleanup, and explicit console diagnostics.
 */

export interface DownloadOptions {
  url: string;
  defaultFilename: string;
  onStart?: () => void;
  onProgress?: (percent: number, message: string) => void;
  onSuccess?: (filename: string) => void;
  onError?: (error: Error) => void;
}

export async function downloadFile({
  url,
  defaultFilename,
  onStart,
  onProgress,
  onSuccess,
  onError
}: DownloadOptions): Promise<void> {
  console.log(`[SerialAudio Downloader] Initiating download: ${defaultFilename} from ${url}`);
  onStart?.();
  onProgress?.(10, `Connecting to download stream for ${defaultFilename}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} - Failed to download ${defaultFilename}`);
    }

    // Try to parse filename from Content-Disposition header
    let filename = defaultFilename;
    const disposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        filename = match[1].trim();
      }
    }

    onProgress?.(40, `Receiving data for ${filename}...`);

    const contentLength = response.headers.get('Content-Length') || response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    let blob: Blob;

    if (response.body && totalBytes > 0 && typeof ReadableStream !== 'undefined') {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          const pct = Math.min(95, Math.round((receivedBytes / totalBytes) * 85) + 10);
          onProgress?.(pct, `Downloaded ${(receivedBytes / (1024 * 1024)).toFixed(2)} MB of ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
        }
      }

      blob = new Blob(chunks, {
        type: response.headers.get('Content-Type') || 'application/octet-stream'
      });
    } else {
      blob = await response.blob();
    }

    console.log(`[SerialAudio Downloader] Received blob size: ${blob.size} bytes (${(blob.size / (1024 * 1024)).toFixed(2)} MB)`);
    onProgress?.(95, `Saving ${filename} to disk...`);

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = blobUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    // CRITICAL: Keep object URL alive for 60 seconds so the browser download manager
    // can finish writing the file. Never call revokeObjectURL immediately!
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(blobUrl);
      console.log(`[SerialAudio Downloader] Cleaned up temporary blob URL for ${filename}`);
    }, 60000);

    console.log(`[SerialAudio Downloader] Successfully triggered save for: ${filename}`);
    onProgress?.(100, `Download complete: ${filename}`);
    onSuccess?.(filename);

  } catch (err: any) {
    console.error(`[SerialAudio Downloader] Error downloading ${defaultFilename}:`, err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    
    // Fallback: try anchor navigation directly without blob
    try {
      console.log(`[SerialAudio Downloader] Attempting anchor fallback for ${url}...`);
      const fallbackLink = document.createElement('a');
      fallbackLink.style.display = 'none';
      fallbackLink.href = url;
      fallbackLink.download = defaultFilename;
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      setTimeout(() => {
        if (document.body.contains(fallbackLink)) {
          document.body.removeChild(fallbackLink);
        }
      }, 5000);
    } catch (fallbackErr) {
      console.error('[SerialAudio Downloader] Fallback also failed:', fallbackErr);
    }
    throw err;
  }
}
