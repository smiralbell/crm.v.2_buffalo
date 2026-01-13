import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import formidable from 'formidable'
import { parse } from 'csv-parse/sync'
import { createHash } from 'crypto'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

// Deshabilitar el body parser por defecto de Next.js para manejar multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
}

interface CSVRow {
  concepto?: string
  fecha?: string
  importe?: string
  saldo?: string
}

/**
 * Normaliza una descripción para el hash
 */
function normalizeDescription(description: string): string {
  return description
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ') // Reemplazar múltiples espacios por uno solo
}

/**
 * Convierte fecha de dd/mm/yyyy a yyyy-mm-dd
 */
function parseDate(dateStr: string): string {
  if (!dateStr || dateStr.trim().length === 0) {
    throw new Error('La fecha está vacía')
  }

  // Limpiar la fecha
  dateStr = dateStr.trim()
  
  // Intentar parsear con formato dd/mm/yyyy
  const parts = dateStr.split('/')
  if (parts.length !== 3) {
    // Intentar con formato dd-mm-yyyy
    const parts2 = dateStr.split('-')
    if (parts2.length === 3) {
      const day = parts2[0].padStart(2, '0')
      const month = parts2[1].padStart(2, '0')
      const year = parts2[2]
      return `${year}-${month}-${day}`
    }
    throw new Error(`Formato de fecha inválido: "${dateStr}". Se espera formato dd/mm/yyyy o dd-mm-yyyy`)
  }
  
  const day = parts[0].padStart(2, '0')
  const month = parts[1].padStart(2, '0')
  const year = parts[2].trim()
  
  // Validar que el año tenga 4 dígitos
  if (year.length !== 4) {
    throw new Error(`Año inválido en fecha: "${dateStr}". El año debe tener 4 dígitos`)
  }
  
  return `${year}-${month}-${day}`
}

/**
 * Parsea el período del formato "01/01/2026 - 13/01/2026" o variaciones
 */
function parsePeriod(periodStr: string): { start: string; end: string } {
  if (!periodStr || periodStr.trim().length === 0) {
    throw new Error('El período está vacío')
  }

  // Intentar diferentes separadores
  let parts: string[] = []
  
  // Probar con " - " (espacio guion espacio)
  if (periodStr.includes(' - ')) {
    parts = periodStr.split(' - ')
  }
  // Probar con "-" (solo guion)
  else if (periodStr.includes('-')) {
    parts = periodStr.split('-').map(p => p.trim())
  }
  // Probar con " a " (espacio a espacio)
  else if (periodStr.includes(' a ')) {
    parts = periodStr.split(' a ')
  }
  // Probar con " al " (espacio al espacio)
  else if (periodStr.includes(' al ')) {
    parts = periodStr.split(' al ')
  }

  if (parts.length !== 2) {
    // Intentar extraer fechas con regex
    const datePattern = /\d{1,2}\/\d{1,2}\/\d{4}/g
    const dates = periodStr.match(datePattern)
    
    if (dates && dates.length >= 2) {
      return {
        start: parseDate(dates[0]),
        end: parseDate(dates[1]),
      }
    }
    
    throw new Error(`Formato de período inválido: "${periodStr}". Se espera formato "dd/mm/yyyy - dd/mm/yyyy"`)
  }

  try {
    return {
      start: parseDate(parts[0].trim()),
      end: parseDate(parts[1].trim()),
    }
  } catch (error: any) {
    throw new Error(`Error al parsear el período "${periodStr}": ${error.message}`)
  }
}

/**
 * Genera hash SHA256 para una transacción
 */
function generateTransactionHash(
  accountId: string,
  date: string,
  amount: number,
  description: string
): string {
  const normalizedDesc = normalizeDescription(description)
  const data = `${accountId}|${date}|${amount.toFixed(2)}|${normalizedDesc}`
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Obtiene o crea una cuenta bancaria por IBAN
 */
async function getOrCreateAccount(iban: string, accountName: string): Promise<string> {
  // Buscar cuenta existente
  const existing = await query<{ id: string }>(
    'SELECT id FROM bank_accounts WHERE iban = $1',
    [iban]
  )

  if (existing.rows.length > 0) {
    return existing.rows[0].id
  }

  // Crear nueva cuenta
  const newId = uuidv4()
  await query(
    'INSERT INTO bank_accounts (id, name, iban) VALUES ($1, $2, $3)',
    [newId, accountName, iban]
  )

  return newId
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)
  } catch (error) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    // Parsear el archivo usando formidable
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
    })

    const [fields, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' })
    }

    // Leer el contenido del archivo CSV
    const fileContent = fs.readFileSync(file.filepath, 'utf-8')
    
    // Log en desarrollo para debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] Archivo recibido:', file.originalFilename)
      console.log('[DEBUG] Tamaño:', fileContent.length, 'caracteres')
      console.log('[DEBUG] Primeras 500 caracteres:', fileContent.substring(0, 500))
    }
    
    // Parsear CSV sin headers primero para buscar información de cuenta
    const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    
    // Buscar información de cuenta en las primeras líneas
    let accountName = ''
    let iban = ''
    let periodStr = ''
    let headerRowIndex = -1
    let transactionsStartLine = -1

    // Parsear CSV con csv-parse para manejar correctamente las comas y comillas
    const allRecords = parse(fileContent, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as any[][]

    // Estructura esperada:
    // Fila 0: Headers de cuenta (Titular, IBAN, Periodo, Saldo disponible)
    // Fila 1: Datos de cuenta (Buffalo..., ES1621..., 01/01/2026-13/01/2026, "6.817,32€")
    // Fila 2: Headers de transacciones (Concepto, Fecha, Importe, Saldo)
    // Fila 3+: Transacciones

    // Buscar información de cuenta en las primeras filas
    let accountDataRow: any[] | null = null
    
    for (let i = 0; i < Math.min(5, allRecords.length); i++) {
      const row = allRecords[i]
      if (!row || row.length === 0) continue
      
      const rowLower = row.map((v: any) => String(v || '').toLowerCase()).join(' ')
      
      // Si esta fila contiene los headers de cuenta (Titular, IBAN, Periodo)
      if (rowLower.includes('titular') && rowLower.includes('iban') && rowLower.includes('periodo')) {
        // La siguiente fila debería tener los datos de la cuenta
        if (i + 1 < allRecords.length) {
          accountDataRow = allRecords[i + 1]
          headerRowIndex = i
          
          // Extraer datos de la cuenta
          const headerRow = row
          accountDataRow.forEach((val: any, index: number) => {
            const strVal = String(val || '').trim()
            const headerKey = String(headerRow[index] || '').toLowerCase()
            
            if (headerKey.includes('iban')) {
              if (strVal.match(/^[A-Z]{2}\d{2}/i)) {
                iban = strVal.toUpperCase().replace(/\s/g, '')
              }
            } else if (headerKey.includes('periodo')) {
              if (strVal.match(/\d{1,2}\/\d{1,2}\/\d{4}[\s-]+\d{1,2}\/\d{1,2}\/\d{4}/)) {
                periodStr = strVal.trim()
              }
            } else if (headerKey.includes('titular')) {
              if (strVal && strVal.length > 3) {
                accountName = strVal.trim()
              }
            }
          })
          
          break
        }
      }
      
      // Buscar cabecera de transacciones (Concepto, Fecha, Importe, Saldo)
      // Solo si NO es la fila de headers de cuenta
      if (!rowLower.includes('titular') && !rowLower.includes('iban') && 
          rowLower.includes('concepto') && rowLower.includes('fecha') && 
          (rowLower.includes('importe') || rowLower.includes('cantidad'))) {
        transactionsStartLine = i + 1
        if (process.env.NODE_ENV === 'development') {
          console.log('[DEBUG] Headers de transacciones encontrados en fila:', i, 'Inicio de datos:', transactionsStartLine)
        }
      }
    }

    // Si no encontramos en formato estructurado, buscar en todo el contenido
    if (!iban) {
      const ibanMatch = fileContent.match(/[A-Z]{2}\d{2}[A-Z0-9\s]{4,30}/i)
      if (ibanMatch) {
        iban = ibanMatch[0].replace(/\s/g, '').toUpperCase()
      }
    }

    if (!periodStr) {
      // Buscar período con diferentes formatos (incluyendo sin espacios alrededor del guion)
      const periodPatterns = [
        /\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/,  // dd/mm/yyyy - dd/mm/yyyy (con espacios)
        /\d{1,2}\/\d{1,2}\/\d{4}-\d{1,2}\/\d{1,2}\/\d{4}/,        // dd/mm/yyyy-dd/mm/yyyy (sin espacios)
        /\d{1,2}\/\d{1,2}\/\d{4}\s+a\s+\d{1,2}\/\d{1,2}\/\d{4}/,   // dd/mm/yyyy a dd/mm/yyyy
        /\d{1,2}\/\d{1,2}\/\d{4}\s+al\s+\d{1,2}\/\d{1,2}\/\d{4}/,  // dd/mm/yyyy al dd/mm/yyyy
      ]
      
      for (const pattern of periodPatterns) {
        const match = fileContent.match(pattern)
        if (match) {
          periodStr = match[0]
          break
        }
      }
    }

    if (!iban) {
      return res.status(400).json({ error: 'No se pudo encontrar el IBAN en el archivo CSV' })
    }
    if (!periodStr) {
      return res.status(400).json({ 
        error: 'No se pudo encontrar el período en el archivo CSV. Asegúrate de que el archivo incluya el período en formato "dd/mm/yyyy - dd/mm/yyyy"' 
      })
    }
    if (!accountName) {
      accountName = `Cuenta ${iban.slice(-4)}`
    }

    // Parsear período con manejo de errores
    let period: { start: string; end: string }
    try {
      period = parsePeriod(periodStr)
    } catch (error: any) {
      return res.status(400).json({ 
        error: `Error al procesar el período: ${error.message}. Período encontrado: "${periodStr}"` 
      })
    }

    // Obtener o crear cuenta
    const accountId = await getOrCreateAccount(iban, accountName)

    // Parsear transacciones desde la línea de inicio encontrada
    let records: any[] = []
    
    if (transactionsStartLine > 0 && transactionsStartLine < allRecords.length) {
      // Usar las filas desde transactionsStartLine
      // transactionsStartLine - 1 es la fila de headers de transacciones
      // transactionsStartLine es donde empiezan los datos de transacciones
      const headerRow = allRecords[transactionsStartLine - 1]
      const dataRows = allRecords.slice(transactionsStartLine)
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] Header de transacciones:', headerRow)
        console.log('[DEBUG] Primera transacción:', dataRows[0])
      }
      
      // Crear objetos con las columnas como keys
      records = dataRows.map((row: any[]) => {
        const record: any = {}
        headerRow.forEach((header: any, index: number) => {
          const headerKey = String(header || '').trim().toLowerCase()
          record[headerKey] = row[index] || ''
        })
        return record
      })
    } else {
      // Fallback: buscar manualmente la sección de transacciones
      // Buscar la fila que contiene "Concepto, Fecha, Importe"
      for (let i = 0; i < allRecords.length; i++) {
        const row = allRecords[i]
        const rowLower = row.map((v: any) => String(v || '').toLowerCase()).join(',')
        if (rowLower.includes('concepto') && rowLower.includes('fecha') && 
            (rowLower.includes('importe') || rowLower.includes('cantidad'))) {
          const headerRow = row
          const dataRows = allRecords.slice(i + 1)
          
          records = dataRows.map((row: any[]) => {
            const record: any = {}
            headerRow.forEach((header: any, index: number) => {
              const headerKey = String(header || '').trim().toLowerCase()
              record[headerKey] = row[index] || ''
            })
            return record
          })
          break
        }
      }
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'No se encontraron transacciones en el archivo' })
    }

    // Detectar nombres de columnas (pueden variar)
    const firstRecord = records[0]
    const columnKeys = Object.keys(firstRecord)
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] Total de transacciones encontradas:', records.length)
      console.log('[DEBUG] Columnas de transacciones:', columnKeys)
      console.log('[DEBUG] Primera transacción completa:', firstRecord)
    }
    
    // Buscar columnas por nombre (case insensitive)
    let conceptoCol = ''
    let fechaCol = ''
    let importeCol = ''
    let saldoCol = ''
    
    for (const key of columnKeys) {
      const lowerKey = key.toLowerCase().trim()
      if ((lowerKey.includes('concepto') || lowerKey.includes('descripción') || 
           lowerKey.includes('descripcion') || lowerKey.includes('descrip')) && !conceptoCol) {
        conceptoCol = key
      }
      if (lowerKey.includes('fecha') && !fechaCol) {
        fechaCol = key
      }
      if ((lowerKey.includes('importe') || lowerKey.includes('cantidad') || 
           lowerKey.includes('amount') || lowerKey.includes('monto')) && !importeCol) {
        importeCol = key
      }
      if (lowerKey.includes('saldo') && !saldoCol) {
        saldoCol = key
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] Columnas detectadas - Concepto:', conceptoCol, 'Fecha:', fechaCol, 'Importe:', importeCol, 'Saldo:', saldoCol)
      if (!saldoCol) {
        console.log('[DEBUG] ADVERTENCIA: No se detectó la columna Saldo. Columnas disponibles:', columnKeys)
      }
    }

    if (!fechaCol || !importeCol) {
      return res.status(400).json({ 
        error: `No se pudieron detectar las columnas Fecha e Importe en el archivo. Columnas encontradas: ${columnKeys.join(', ')}. Asegúrate de que el CSV tenga las columnas: Concepto, Fecha, Importe, Saldo` 
      })
    }

    // Procesar transacciones
    const validTransactions = records
      .map((row: any) => ({
        concepto: conceptoCol ? (row[conceptoCol] || '') : '',
        fecha: row[fechaCol] || '',
        importe: row[importeCol] || '',
        saldo: saldoCol ? (row[saldoCol] || '') : '',
      }))
      .filter((t: CSVRow) => t.fecha && t.importe)

    if (validTransactions.length === 0) {
      return res.status(400).json({ error: 'No se encontraron transacciones válidas en el archivo' })
    }

    // Crear registro de extracto
    const statementId = uuidv4()
    const fileHash = createHash('sha256').update(fileContent).digest('hex')
    
    await query(
      `INSERT INTO bank_statements 
       (id, account_id, period_start, period_end, uploaded_at, file_hash, original_filename)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
      [statementId, accountId, period.start, period.end, fileHash, file.originalFilename || 'extracto.csv']
    )

    // Insertar transacciones y guardar las procesadas
    let inserted = 0
    let duplicates = 0
    const processedTransactions: Array<{
      date: string
      amount: number
      description: string
      balance: number | null
    }> = []

    for (const transaction of validTransactions) {
      try {
        if (!transaction.fecha || !transaction.importe) {
          continue
        }

        const date = parseDate(transaction.fecha)
        
        // Limpiar y parsear importe (puede tener formato de moneda)
        let amountStr = transaction.importe.toString().trim()
        // Remover símbolos de moneda y espacios
        amountStr = amountStr.replace(/[€$£\s]/g, '')
        // Reemplazar coma por punto si es separador decimal
        if (amountStr.includes(',') && !amountStr.includes('.')) {
          amountStr = amountStr.replace(',', '.')
        } else if (amountStr.includes(',')) {
          // Si tiene ambos, la coma probablemente es separador de miles
          amountStr = amountStr.replace(/,/g, '')
        }
        
        const amount = parseFloat(amountStr)

        if (isNaN(amount) || amount === 0) {
          continue // Saltar transacciones con importe inválido
        }

        const description = (transaction.concepto || '').trim()
        const hash = generateTransactionHash(accountId, date, amount, description)

        // Parsear saldo si está disponible (formato español: punto=miles, coma=decimal)
        let balance: number | null = null
        if (transaction.saldo) {
          try {
            let balanceStr = transaction.saldo.toString().trim()
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[DEBUG] Saldo original:', balanceStr)
            }
            
            // Remover comillas si las tiene (al inicio y final)
            balanceStr = balanceStr.replace(/^["']+|["']+$/g, '')
            // Remover símbolos de moneda y caracteres especiales (incluyendo â y otros)
            balanceStr = balanceStr.replace(/[€$£EUR\sâ]/g, '')
            // Remover guiones al final (como en "6.817,32â,-")
            balanceStr = balanceStr.replace(/[-]+$/g, '')
            
            // Formato español: punto = miles, coma = decimal
            // Ejemplo: "6.817,32" -> 6817.32
            if (balanceStr.includes('.') && balanceStr.includes(',')) {
              // Tiene ambos: punto es miles, coma es decimal
              balanceStr = balanceStr.replace(/\./g, '') // Quitar todos los puntos (miles)
              balanceStr = balanceStr.replace(',', '.') // Coma a punto (decimal)
            } 
            // Si solo tiene coma, es decimal en formato español
            else if (balanceStr.includes(',') && !balanceStr.includes('.')) {
              balanceStr = balanceStr.replace(',', '.') // Coma a punto
            }
            // Si solo tiene punto, en formato español normalmente es miles
            else if (balanceStr.includes('.') && !balanceStr.includes(',')) {
              // En formato español, si hay punto y no hay coma, el punto es separador de miles
              // Ejemplo: "6.817" -> 6817 (miles)
              // Quitar todos los puntos
              balanceStr = balanceStr.replace(/\./g, '')
            }
            
            balance = parseFloat(balanceStr)
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[DEBUG] Saldo parseado:', balance, 'de:', transaction.saldo, '->', balanceStr)
            }
            
            if (isNaN(balance)) {
              balance = null
            }
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[DEBUG] Error parseando saldo:', transaction.saldo, error)
            }
            balance = null
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[DEBUG] No hay saldo en la transacción:', transaction)
          }
        }

        // Guardar transacción procesada
        processedTransactions.push({
          date,
          amount,
          description,
          balance,
        })

        // Intentar insertar con ON CONFLICT DO NOTHING
        const result = await query(
          `INSERT INTO bank_transactions 
           (id, account_id, statement_id, date, amount, description, hash, balance, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (account_id, hash) DO NOTHING`,
          [uuidv4(), accountId, statementId, date, amount, description, hash, balance]
        )

        if (result.rowCount > 0) {
          inserted++
        } else {
          duplicates++
        }
      } catch (error: any) {
        // Continuar con la siguiente transacción si hay error en una
        if (process.env.NODE_ENV === 'development') {
          console.error('[ERROR] Error procesando transacción:', error)
        }
      }
    }

    // Limpiar archivo temporal
    try {
      fs.unlinkSync(file.filepath)
    } catch (error) {
      // Ignorar errores al eliminar archivo temporal
    }

    return res.status(200).json({
      statement_id: statementId,
      period_start: period.start,
      period_end: period.end,
      total_rows: validTransactions.length,
      inserted,
      duplicates,
      transactions: processedTransactions,
    })
  } catch (error: any) {
    // Log detallado en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error importing statement:', error)
      console.error('[ERROR] Stack:', error.stack)
    }
    
    // Devolver mensaje de error más descriptivo
    const errorMessage = error.message || 'Error al importar extracto bancario'
    
    // Si es un error de validación, devolver 400
    if (errorMessage.includes('inválido') || errorMessage.includes('no se pudo encontrar') || errorMessage.includes('vacío')) {
      return res.status(400).json({
        error: errorMessage,
      })
    }
    
    return res.status(500).json({
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.stack 
      }),
    })
  }
}

