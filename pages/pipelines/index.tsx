import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Workflow } from 'lucide-react'
import Link from 'next/link'

interface Pipeline {
  id: string
  name: string
  entity_type: 'client' | 'contact'
  created_at: string
  _count?: {
    cards: number
  }
}

interface PipelinesPageProps {
  pipelines: Pipeline[]
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch (error) {
    return { redirect: { destination: '/login', permanent: false } }
  }

  try {
    const pipelines = await prisma.pipelineKanban.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: {
            cards: {
              where: {
                deleted_at: null,
              },
            },
          },
        },
      },
    })

    return {
      props: {
        pipelines: pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          entity_type: p.entity_type,
          created_at: p.created_at.toISOString(),
          _count: {
            cards: p._count.cards,
          },
        })),
      },
    }
  } catch (error) {
    console.error('Error fetching pipelines:', error)
    return {
      props: {
        pipelines: [],
      },
    }
  }
}

export default function PipelinesPage({ pipelines }: PipelinesPageProps) {
  const router = useRouter()

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pipelines</h1>
            <p className="text-gray-600 mt-1">Gestiona tus pipelines Kanban</p>
          </div>
          <Link href="/pipelines/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Pipeline
            </Button>
          </Link>
        </div>

        {pipelines.length === 0 ? (
          <Card className="border border-gray-200">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Workflow className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">No hay pipelines creados</p>
                <Link href="/pipelines/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Crear primer pipeline
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pipelines.map((pipeline) => (
              <Link key={pipeline.id} href={`/pipelines/${pipeline.id}`}>
                <Card className="border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{pipeline.name}</h3>
                      <Workflow className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">
                        Tipo: <span className="font-medium">{pipeline.entity_type === 'contact' ? 'Contactos' : 'Clientes'}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Tarjetas: <span className="font-medium">{pipeline._count?.cards || 0}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}

