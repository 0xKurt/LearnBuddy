// In the browser the normal fetch already streams the response body.
export const streamingFetch = (url: string, init: RequestInit): Promise<Response> =>
  fetch(url, init);
