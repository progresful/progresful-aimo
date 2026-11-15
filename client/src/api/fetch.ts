type RequestInitWithObjectBody =
  | (Omit<RequestInit, 'body'> & {
      body?: BodyInit | object;
    })
  | RequestInit;

export interface FetchErrorResponse extends Error {
  response: {
    error: {
      message: string;
      details?: {
        path: string;
        message: string;
        code: string;
      }[];
    };
    success: boolean;
  };
  options: RequestInitWithObjectBody;
  status: {
    url: string;
    code: number;
    message: string;
  };
}

export const doFetch = async (url: string, options?: RequestInitWithObjectBody) => {
  let body: BodyInit | null = null;
  if (options?.body) {
    if (typeof options?.body === 'object') {
      body = JSON.stringify(options.body);
    } else {
      body = options.body;
    }
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  if (res.ok && res.status >= 200 && res.status <= 299) {
    if (res.status === 204) {
      return '';
    }
    const contenttype = res.headers.get('content-type');
    if (contenttype && contenttype.includes('application/json')) {
      return res.json();
    }
    if (contenttype && contenttype.includes('text/')) {
      return res.text();
    }
    return res.blob();
  }
  const response = await res.json();
  return Promise.reject({
    response,
    options,
    status: {
      url,
      code: res.status,
      message: res.statusText,
    },
  } as FetchErrorResponse);
};
