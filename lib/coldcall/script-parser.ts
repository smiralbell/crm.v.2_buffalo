export interface ScriptBox {
  title: string
  text: string
}

export function parseScriptMarkdown(md: string): ScriptBox[] {
  if (!md?.trim()) return []

  const boxes: ScriptBox[] = []
  let currentTitle = ''
  let currentLines: string[] = []

  const flush = () => {
    const text = currentLines.join('\n').trim()
    if (currentTitle || text) {
      boxes.push({ title: currentTitle || 'Sección', text })
    }
    currentTitle = ''
    currentLines = []
  }

  for (const line of md.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      flush()
      currentTitle = heading[1].trim()
    } else {
      currentLines.push(line)
    }
  }
  flush()

  return boxes.filter((b) => b.title || b.text)
}

export const DEFAULT_SCRIPT_MARKDOWN_ES = `## Recepción
"Buenas, ¿me puede poner con el responsable del despacho o el socio director? De parte de Sergi, de Buffalo AI."

*Si pregunta de qué: "Es una llamada comercial, no le robo más de 2 minutos."*

## Apertura
Hola, buenas tardes. ¿Con quién hablo?

Perfecto, [Nombre], encantado.

Soy Sergi Masoliver, de Buffalo AI. No sé si me tienes ubicado.

## Los 15 segundos
No pasa nada. Mira, te robo únicamente 15 segundos y si no te interesa me lo dices sin ningún problema, ¿vale?

## Propuesta de valor
Trabajamos con despachos como el vuestro automatizando tareas repetitivas con IA: contestación de llamadas, gestión de citas, seguimiento de clientes...

¿Os habéis planteado algo así?

## Cierre
¿Te parece si agendamos una llamada de 20 minutos para enseñarte cómo lo hacemos con otros despachos?
`

export const DEFAULT_SCRIPT_MARKDOWN_CA = `## Recepció
"Bones, em pot passar amb el responsable del despatx o el soci director? De part de Sergi, de Buffalo AI."

*Si pregunta de què: "És una trucada comercial, no li robo més de 2 minuts."*

## Obertura
Hola, bon dia. Amb qui parlo?

Perfecte, [Nom], encantat.

Sóc Sergi Masoliver, de Buffalo AI. No sé si em tens ubicat.

## Els 15 segons
No passa res. Mira, et robo únicament 15 segons i si no t'interessa m'ho dius sense cap problema, d'acord?

## Proposta de valor
Treballem amb despatxos com el vostre automatitzant tasques repetitives amb IA: resposta de trucades, gestió de cites, seguiment de clients...

Us heu plantejat alguna cosa així?

## Tancament
Et sembla si agendem una trucada de 20 minuts per ensenyar-te com ho fem amb altres despatxos?
`
