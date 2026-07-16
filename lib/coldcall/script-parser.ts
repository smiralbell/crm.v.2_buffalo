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
"Buenas, ¿me puede poner con el responsable del despacho o el socio director? De parte de {{speaker_first}}, de Buffalo AI."

*Si pregunta de qué: "Es una llamada comercial, no le robo más de 2 minutos." La honestidad funciona mejor que inventar excusas.*

## Apertura
Hola, buenas tardes. ¿Con quién hablo?

Perfecto, {{nombre}}, encantado.

{{speaker_intro_es}}. No sé si me tienes ubicado.

## Los 15 segundos
No pasa nada. Mira, te robo únicamente 15 segundos y si no te interesa me lo dices sin ningún problema, ¿vale?

*Dar permiso para decir que no baja la guardia. Contraintuitivo pero muy efectivo.*

## Propuesta de valor
Estamos ayudando a despachos como el vuestro a gestionar todas las consultas que llegan tanto dentro como fuera del horario laboral.

Lo que nos comentan muchos despachos es que reciben un volumen importante de llamadas, pero que no todas tienen sentido para el negocio y al final los abogados acaban filtrando casos que no son viables.

Hemos desarrollado un sistema de atención al cliente con inteligencia artificial que atiende esas consultas, hace las preguntas necesarias y determina cuáles tienen sentido pasar a un abogado.

Al despacho solo le llegan los casos realmente interesantes.

## Pregunta de cierre
Hasta aquí, ¿te encaja? ¿Crees que podría tener sentido en vuestro caso?

## Si hay interés
Perfecto. Hemos preparado una demo completamente gratuita para que podáis ver en directo cómo funcionaría exactamente para vuestro despacho.

No hay ningún compromiso. Simplemente os la enseñamos, valoráis si os aporta valor y decidís si tiene encaje o no.

¿Qué te parece si buscamos 20 minutos esta semana?
`

export const DEFAULT_SCRIPT_MARKDOWN_CA = `## Recepció
"Bones, em podria posar amb el responsable del despatx o el soci director? De part {{speaker_from_ca}}, de Buffalo AI."

*Si pregunta de què: "És una trucada comercial, no li robo més de 2 minuts." L'honestedat funciona millor que inventar excuses.*

## Obertura
Hola, bona tarda. Amb qui parlo?

Perfecte, [Nom], encantat.

{{speaker_intro_ca}}. No sé si em tens ubicat.

## Els 15 segons
No passa res. Mira, et robo únicament 15 segons i si no t'interessa m'ho dius sense cap problema, d'acord?

*Donar permís per dir que no baixa la guàrdia. Contraintuïtiu però molt efectiu.*

## Proposta de valor
Estem ajudant despatxos com el vostre a gestionar totes les consultes que arriben tant dins com fora de l'horari laboral.

El que ens comenten molts despatxos és que reben un volum important de trucades, però que no totes tenen sentit per al negoci i al final els advocats acaben filtrant casos que no són viables.

Hem desenvolupat un sistema d'atenció al client amb intel·ligència artificial que s'encarrega d'atendre aquestes consultes, fer les preguntes necessàries i determinar quines té sentit passar a un advocat.

Al despatx només li arriben els casos realment interessants.

## Pregunta de tancament
Fins aquí, t'encaixa? Creus que podria tenir sentit en el vostre cas?

## Si hi ha interès
Perfecte. Hem preparat una demo completament gratuïta perquè pugueu veure en directe com funcionaria exactament per al vostre despatx.

No hi ha cap compromís. Simplement us l'ensenyem, valoreu si us aporta valor i decidiu si té encaix o no.

Què et sembla si busquem 20 minuts aquesta setmana?
`
