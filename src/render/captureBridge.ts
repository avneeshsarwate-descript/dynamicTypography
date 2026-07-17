export type CanvasCapture = (requestedTime?: number) => Promise<Blob>;

type CaptureCommand = {
  id: string;
  client: string;
  time?: number;
};

const RETRY_DELAY = 400;

type CaptureBridgeState = {
  abortController: AbortController;
  capture: CanvasCapture;
  client: string;
  owner: object;
};

declare global {
  interface Window {
    __dynamicTypographyCaptureBridge?: CaptureBridgeState;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function connectCaptureBridge(capture: CanvasCapture): () => void {
  const client = new URL(window.location.href).searchParams.get('captureClient') || 'default';
  const owner = {};
  let state = window.__dynamicTypographyCaptureBridge;

  const poll = async (bridge: CaptureBridgeState): Promise<void> => {
    while (!bridge.abortController.signal.aborted) {
      try {
        const response = await fetch(`/__canvas-capture/next?client=${encodeURIComponent(bridge.client)}`, {
          cache: 'no-store',
          signal: bridge.abortController.signal,
        });
        if (response.status === 204) continue;
        if (!response.ok) throw new Error(`Capture bridge returned ${response.status}`);

        const command = await response.json() as CaptureCommand;
        let body: BodyInit;
        let contentType: string;
        try {
          body = await bridge.capture(command.time);
          contentType = 'image/png';
        } catch (error) {
          body = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
          contentType = 'application/json';
        }
        const upload = fetch(`/__canvas-capture/result/${encodeURIComponent(command.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body,
        });
        void upload.then((result) => {
          if (!result.ok) console.warn(`Capture upload returned ${result.status}`);
        }).catch((error: unknown) => {
          console.warn('Canvas capture upload failed', error);
        });
      } catch (error) {
        if (bridge.abortController.signal.aborted) return;
        console.warn('Canvas capture bridge is reconnecting', error);
        await delay(RETRY_DELAY);
      }
    }
  };

  if (!state || state.abortController.signal.aborted || state.client !== client) {
    state?.abortController.abort();
    state = { abortController: new AbortController(), capture, client, owner };
    window.__dynamicTypographyCaptureBridge = state;
    void poll(state);
  } else {
    state.capture = capture;
    state.owner = owner;
  }

  return () => {
    window.setTimeout(() => {
      if (window.__dynamicTypographyCaptureBridge !== state || state.owner !== owner) return;
      state.abortController.abort();
      delete window.__dynamicTypographyCaptureBridge;
    }, 250);
  };
}
