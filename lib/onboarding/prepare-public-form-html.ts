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
  // Captura submit nativo + FormData vía fetch (p.ej. Web3Forms) y guarda copia en el CRM.
  return `<script data-buffalo-form-capture="1">
(function(){
  var SLUG = ${escapeJsString(slug)};
  var ENDPOINT = "/api/f/" + encodeURIComponent(SLUG);
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
  function post(payload){
    try {
      if (!payload || typeof payload !== "object") return;
      var keys = Object.keys(payload);
      if (!keys.length) return;
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit"
      }).catch(function(){});
    } catch (e) {}
  }
  document.addEventListener("submit", function(ev){
    try {
      var form = ev.target;
      if (!form || !form.tagName || form.tagName.toUpperCase() !== "FORM") return;
      post(toObj(new FormData(form)));
    } catch (e) {}
  }, true);
  if (typeof window.fetch === "function") {
    var orig = window.fetch;
    window.fetch = function(input, init){
      try {
        var body = init && init.body;
        if (typeof FormData !== "undefined" && body instanceof FormData) {
          post(toObj(body));
        } else if (body && typeof body === "string") {
          try {
            var parsed = JSON.parse(body);
            if (parsed && typeof parsed === "object") post(parsed);
          } catch (e2) {}
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }
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
