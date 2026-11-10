import { useAuth } from '@/components/AuthContext'
import { canSeeClientPrices } from '@/lib/price-visibility'

/** true si el usuario actual puede ver precios de clientes (admin / comercial). */
export function useCanSeePrices(): boolean {
  const { user } = useAuth()
  return canSeeClientPrices(user?.role)
}
