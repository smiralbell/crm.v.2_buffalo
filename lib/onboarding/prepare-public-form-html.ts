/**
 * Prepara el HTML pegado por el admin para servirlo como documento completo.
 * Así funcionan <html>, <head>, CSS, fuentes y <script> (no se pierden al inyectar en un div React).
 */

function escapeJsString(value: string): string {
  return JSON.stringify(String(value))
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildCaptureScript(slug: string): string {
  // Captura submit nativo + FormData vía fetch externo + API window.BuffaloCRM.submit
  return `<script data-buffalo-form-capture="1">
(function(){
  var SLUG = ${escapeJsString(slug)};
  var ENDPOINT = "/api/f/" + encodeURIComponent(SLUG);
  var origFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  var lastSent = "";
  var lastSentAt = 0;

  function toObj(fd){
    var o = {};
    try {
      fd.forEach(function(v, k){
        if (!k) return;
        var val = (typeof v === "string") ? v : (v && v.name) ? v.name : String(v);
        if (Object.prototype.hasOwnProperty.call(o, k)) {
          if (!Array.isArray(o[k])) o[k] = [o[k]];
          o[k].push(val);
        } else {
          o[k] = val;
        }
      });
    } catch (e) {}
    return o;
  }

  function flattenAnswers(raw){
    if (!raw || typeof raw !== "object") return {};
    if (raw.respuestas && typeof raw.respuestas === "object") {
      var merged = {};
      try {
        Object.keys(raw).forEach(function(k){ if (k !== "respuestas") merged[k] = raw[k]; });
        Object.keys(raw.respuestas).forEach(function(k){ merged[k] = raw.respuestas[k]; });
      } catch (e) {}
      return merged;
    }
    return raw;
  }

  function post(payload){
    try {
      if (!payload || typeof payload !== "object") return Promise.resolve(false);
      var data = flattenAnswers(payload);
      var keys = Object.keys(data);
      if (!keys.length) return Promise.resolve(false);
      var body = JSON.stringify(data);
      var now = Date.now();
      if (body === lastSent && now - lastSentAt < 2500) return Promise.resolve(true);
      lastSent = body;
      lastSentAt = now;
      if (!origFetch) return Promise.resolve(false);
      return origFetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: body,
        keepalive: true,
        credentials: "omit"
      }).then(function(r){ return r && r.ok; }).catch(function(){ return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function isOurEndpoint(input){
    try {
      var url = typeof input === "string" ? input : (input && input.url) ? String(input.url) : "";
      return url.indexOf("/api/f/") !== -1;
    } catch (e) { return false; }
  }

  document.addEventListener("submit", function(ev){
    try {
      var form = ev.target;
      if (!form || !form.tagName || form.tagName.toUpperCase() !== "FORM") return;
      // Evita navegación GET (forms SPA sin action) que cancela el guardado
      if (ev.cancelable) ev.preventDefault();
      post(toObj(new FormData(form)));
    } catch (e) {}
  }, true);

  if (origFetch) {
    window.fetch = function(input, init){
      try {
        if (!isOurEndpoint(input)) {
          var body = init && init.body;
          if (typeof FormData !== "undefined" && body instanceof FormData) {
            post(toObj(body));
          }
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
  }

  window.BuffaloCRM = {
    slug: SLUG,
    endpoint: ENDPOINT,
    submit: function(data){ return post(data || {}); }
  };

  document.addEventListener("buffalo:submit", function(ev){
    try {
      var detail = ev && ev.detail;
      post(detail && typeof detail === "object" ? detail : {});
    } catch (e) {}
  });
})();
</script>`
}

export function isFullHtmlDocument(html: string): boolean {
  const s = String(html || '').trim()
  return /<!doctype\s+html/i.test(s) || /<html[\s>]/i.test(s)
}

/** Devuelve un documento HTML listo para enviar con Content-Type: text/html */
export function preparePublicFormDocument(
  rawHtml: string,
  slug: string,
  title = 'Formulario'
): string {
  const html = String(rawHtml || '').trim()
  const script = buildCaptureScript(slug)

  if (!html) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${escapeHtml(
      title
    )}</title></head><body><p>Formulario vacío.</p>${script}</body></html>`
  }

  if (isFullHtmlDocument(html)) {
    if (/<\/body\s*>/i.test(html)) {
      return html.replace(/<\/body\s*>/i, `${script}</body>`)
    }
    if (/<\/html\s*>/i.test(html)) {
      return html.replace(/<\/html\s*>/i, `${script}</html>`)
    }
    return `${html}\n${script}`
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${escapeHtml(title)}</title>
</head>
<body>
${html}
${script}
</body>
</html>`
}
