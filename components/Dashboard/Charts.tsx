import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

interface LeadsByStatusData {
  estado: string
  cantidad: number
}

interface LeadsByMonthData {
  mes: string
  cantidad: number
}

interface ChartsProps {
  leadsByStatus: LeadsByStatusData[]
  leadsByMonth: LeadsByMonthData[]
}

export default function Charts({ leadsByStatus, leadsByMonth }: ChartsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={leadsByStatus} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <XAxis 
                dataKey="estado" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                labelStyle={{ color: '#374151', fontWeight: 600 }}
              />
              <Bar 
                dataKey="cantidad" 
                fill="#10b981"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={leadsByMonth} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <XAxis 
                dataKey="mes" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                labelStyle={{ color: '#374151', fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="cantidad"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

