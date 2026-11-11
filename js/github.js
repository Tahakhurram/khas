// Thin GitHub Contents API client. One instance per repo: gh({owner, repo, token}).
const API = 'https://api.github.com';
const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

export function gh(cfg) {
  const req = (path, opts = {}) => fetch(API + path, {
    cache: 'no-store', ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
  const base = `/repos/${cfg.owner}/${cfg.repo}`;
  async function put(path, content, sha, message) {
    const body = { message, content }; if (sha) body.sha = sha;
    const res = await req(`${base}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
    if (res.status === 409 || res.status === 422) { const e = new Error('This data was changed by someone else. It has been reloaded; please try again.'); e.conflict = true; throw e; }
    if (res.status === 401) throw new Error('Invalid token.');
    if (!res.ok) throw new Error(`Could not save ${path} (${res.status})`);
    return (await res.json()).content.sha;
  }
  return {
    repo: cfg.repo,
    // Returns {canWrite} or throws.
    async check() {
      const res = await req(base);
      if (res.status === 401) throw new Error('Invalid token.');
      if (res.status === 404) throw new Error(`Repo "${cfg.repo}" not found, or this login has no access to it.`);
      if (!res.ok) throw new Error('GitHub error ' + res.status);
      const j = await res.json();
      return { canWrite: !!(j.permissions && (j.permissions.push || j.permissions.admin)) };
    },
    // Returns {data, sha} or null if the file doesn't exist.
    async read(path) {
      const res = await req(`${base}/contents/${path}`);
      if (res.status === 404) return null;
      if (res.status === 401) throw new Error('Invalid token.');
      if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
      const j = await res.json();
      let text;
      if (j.content) text = b64decode(j.content);
      else { // files over 1 MB come back without content: fetch the blob instead
        const r2 = await req(`${base}/git/blobs/${j.sha}`); if (!r2.ok) throw new Error(`Could not read ${path} (${r2.status})`);
        text = b64decode((await r2.json()).content);
      }
      return { data: JSON.parse(text), sha: j.sha };
    },
    // File names inside a folder (empty list if the folder doesn't exist).
    async list(path) {
      const res = await req(`${base}/contents/${path}`);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`Could not list ${path} (${res.status})`);
      const j = await res.json(); return Array.isArray(j) ? j.map((f) => f.name) : [];
    },
    // Writes JSON. Pass the sha from the last read (omit for new files). Throws err.conflict on a clash.
    write: (path, data, sha, message) => put(path, b64encode(JSON.stringify(data, null, 1) + '\n'), sha, message),
    // Binary files (receipt photos), as base64 without the data: prefix.
    writeBinary: (path, base64, message) => put(path, base64, null, message),
    async readBinary(path) {
      const res = await req(`${base}/contents/${path}`); if (!res.ok) return null;
      const j = await res.json(); if (j.content) return j.content.replace(/\n/g, '');
      const r2 = await req(`${base}/git/blobs/${j.sha}`); return r2.ok ? (await r2.json()).content.replace(/\n/g, '') : null;
    },
  };
}
