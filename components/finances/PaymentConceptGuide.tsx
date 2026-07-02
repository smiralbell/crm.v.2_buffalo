import { PAYMENT_CONCEPT_EXAMPLES } from '@/lib/finance/payment-concepts'

export default function PaymentConceptGuide({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-violet-100 bg-violet-50/50 p-4 ${className}`}>
      <p className="text-sm font-semibold text-gray-900">Convención de conceptos bancarios</p>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
        Usa estos formatos en transferencias para que Finanzas clasifique automáticamente nóminas,
        developers, marketing y plataformas. Mayúsculas, sin tildes.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-violet-100">
              <th className="pb-2 pr-3 font-medium">Tipo</th>
              <th className="pb-2 pr-3 font-medium">Formato</th>
              <th className="pb-2 font-medium">Ejemplo</th>
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {PAYMENT_CONCEPT_EXAMPLES.map((row) => (
              <tr key={row.category} className="border-b border-violet-50 last:border-0">
                <td className="py-2 pr-3 font-medium whitespace-nowrap">{row.category}</td>
                <td className="py-2 pr-3 font-mono text-[11px] text-violet-900">{row.format}</td>
                <td className="py-2 font-mono text-[11px] text-gray-600">{row.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500 mt-3">
        Cargos de tarjeta (TWILIO, CURSOR, etc.) se detectan solos. Las nóminas antiguas con «NOMINA
        JUNIO» también.
      </p>
    </div>
  )
}
