import React from 'react'
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

/**
 * Informe de un flujo de Retención con el estilo del kit de documentos Buffalo
 * (colores, portada, secciones numeradas, tarjetas y bloques destacados).
 * El kit usa Inter y Space Grotesk en woff2, que el generador de PDF no admite:
 * aquí se usa Helvetica con los mismos tamaños y colores.
 */

const C = {
  text: '#17211e',
  muted: '#56655f',
  heading: '#0d211b',
  accent: '#00a084',
  accentDark: '#00715d',
  surface: '#eef7f4',
  border: '#dcece5',
  rowAlt: '#f6fbf9',
}

const s = StyleSheet.create({
  page: { paddingTop: 78, paddingBottom: 60, paddingHorizontal: 58, fontFamily: 'Helvetica', fontSize: 10.5, color: C.text, lineHeight: 1.45 },
  header: {
    position: 'absolute', top: 26, left: 58, right: 58, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLogo: { height: 16 },
  headerText: { fontSize: 8, color: C.muted },
  footer: {
    position: 'absolute', bottom: 26, left: 58, right: 58, flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 8, color: C.muted, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6,
  },
  coverLogo: { height: 54, width: 54, marginBottom: 26, objectFit: 'contain' },
  eyebrow: { fontSize: 8.5, color: C.accent, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  h1: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: C.heading, lineHeight: 1.15 },
  rule: { width: 46, height: 3, backgroundColor: C.accent, marginTop: 14, marginBottom: 14 },
  subtitle: { fontSize: 12, color: C.muted, marginBottom: 22 },
  meta: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginBottom: 30 },
  metaCol: { flex: 1, paddingRight: 10 },
  metaLabel: { fontSize: 7.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  metaValue: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.heading },
  h2: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  num: { backgroundColor: C.accent, color: '#ffffff', fontSize: 8.5, fontFamily: 'Helvetica-Bold', paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, marginRight: 8 },
  h2Text: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.heading },
  highlight: { backgroundColor: C.surface, borderLeftWidth: 3, borderLeftColor: C.accent, padding: 12, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cardWrap: { width: '50%', padding: 5 },
  card: { borderWidth: 1, borderColor: C.border, borderTopWidth: 3, borderTopColor: C.accent, borderRadius: 5, padding: 10 },
  cardTinted: { backgroundColor: C.surface, borderRadius: 5, padding: 10 },
  cardLabel: { fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  cardValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.heading },
  listItem: { flexDirection: 'row', marginBottom: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 5, marginRight: 8 },
  listText: { flex: 1 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5 },
  rowAlt: { backgroundColor: C.rowAlt },
  cellKey: { width: '38%', color: C.muted, paddingRight: 8 },
  cellVal: { flex: 1, color: C.text },
  small: { fontSize: 8.5, color: C.muted, marginTop: 6 },
})

function humanize(key: string): string {
  const t = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function fmtValue(v: unknown): string {
  if (v == null) return 'Sin dato'
  if (typeof v === 'number') return v.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

type Section = { title: string; body: JSX.Element }

function isScalar(v: unknown): boolean {
  return v == null || ['string', 'number', 'boolean'].includes(typeof v)
}

function Cards({ data }: { data: Record<string, unknown> }) {
  return (
    <View style={s.grid}>
      {Object.entries(data).map(([k, v], i) => (
        <View key={k} style={s.cardWrap} wrap={false}>
          <View style={i % 2 === 0 ? s.card : s.cardTinted}>
            <Text style={s.cardLabel}>{humanize(k)}</Text>
            <Text style={s.cardValue}>{fmtValue(v)}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function List({ items }: { items: unknown[] }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={s.listItem} wrap={false}>
          <View style={s.dot} />
          <Text style={s.listText}>{fmtValue(it)}</Text>
        </View>
      ))}
    </View>
  )
}

function KeyTable({ data }: { data: Record<string, unknown> }) {
  return (
    <View>
      {Object.entries(data).map(([k, v], i) => (
        <View key={k} style={i % 2 ? [s.row, s.rowAlt] : s.row} wrap={false}>
          <Text style={s.cellKey}>{humanize(k)}</Text>
          <Text style={s.cellVal}>{fmtValue(v)}</Text>
        </View>
      ))}
    </View>
  )
}

/** Convierte el JSON de salida del flujo en secciones del documento. */
export function sectionsFromOutput(output: unknown): { sections: Section[]; sources: string[] } {
  const sections: Section[] = []
  let sources: string[] = []
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    sections.push({ title: 'Resultado', body: <Text>{fmtValue(output)}</Text> })
    return { sections, sources }
  }
  for (const [key, value] of Object.entries(output as Record<string, unknown>)) {
    const k = key.toLowerCase()
    if (k === 'fuentes' || k === 'sources') {
      sources = Array.isArray(value) ? value.map(fmtValue) : [fmtValue(value)]
      continue
    }
    if (k === 'resumen' || k === 'summary') {
      sections.push({ title: 'Resumen', body: <View style={s.highlight}><Text>{fmtValue(value)}</Text></View> })
    } else if (Array.isArray(value)) {
      sections.push({ title: humanize(key), body: <List items={value} /> })
    } else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const allScalar = Object.values(obj).every(isScalar)
      const numeric = Object.values(obj).filter((v) => typeof v === 'number').length
      sections.push({
        title: k === 'metricas' || k === 'metrics' ? 'Cifras clave' : humanize(key),
        body: allScalar && numeric >= Object.keys(obj).length / 2 ? <Cards data={obj} /> : <KeyTable data={obj} />,
      })
    } else {
      sections.push({ title: humanize(key), body: <Text>{fmtValue(value)}</Text> })
    }
  }
  return { sections, sources }
}

export function FlowReportPDF({
  title,
  proyectoName,
  flujoName,
  date,
  output,
  logoHeader,
  logoCover,
}: {
  title: string
  proyectoName: string
  flujoName: string
  date: string
  output: unknown
  logoHeader?: string
  logoCover?: string
}) {
  const { sections, sources } = sectionsFromOutput(output)
  return (
    <Document title={`${title} · ${proyectoName}`} author="Buffalo AI">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {logoHeader ? <Image src={logoHeader} style={s.headerLogo} /> : <Text style={s.headerText}>Buffalo AI</Text>}
          <Text style={s.headerText}>{`${title} · ${proyectoName} × Buffalo AI`}</Text>
        </View>

        {logoCover && <Image src={logoCover} style={s.coverLogo} />}
        <Text style={s.eyebrow}>Informe automático · Retención</Text>
        <Text style={s.h1}>{title}</Text>
        <View style={s.rule} />
        <Text style={s.subtitle}>{`Generado por el flujo «${flujoName}».`}</Text>
        <View style={s.meta}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Cliente</Text>
            <Text style={s.metaValue}>{proyectoName}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Flujo</Text>
            <Text style={s.metaValue}>{flujoName}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Fecha</Text>
            <Text style={s.metaValue}>{date}</Text>
          </View>
        </View>

        {sections.map((sec, i) => (
          <View key={i}>
            <View style={s.h2} wrap={false} minPresenceAhead={60}>
              <Text style={s.num}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={s.h2Text}>{sec.title}</Text>
            </View>
            {sec.body}
          </View>
        ))}

        {sources.length > 0 && <Text style={s.small}>{`Fuentes: ${sources.join(' · ')}`}</Text>}

        <View style={s.footer} fixed>
          <Text>buffaloia.com</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
