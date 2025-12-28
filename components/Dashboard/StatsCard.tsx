import { Card, CardContent } from '@/components/ui/card'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
}

export default function StatsCard({ title, value, description }: StatsCardProps) {
  return (
    <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-gray-500 mb-2">{title}</p>
        <div className="text-3xl font-semibold text-gray-900 mb-1">{value}</div>
        {description && (
          <p className="text-xs text-gray-400 mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

