import client from './client';

// Downloads a CSV export from the backend. Uses the same axios instance (with its
// auth interceptor) so the request carries the Bearer token, then triggers a
// browser download from the returned blob.
export async function downloadCsv(path, filename, params = {}) {
  const res = await client.get(path, { params, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
