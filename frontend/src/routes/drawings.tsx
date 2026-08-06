import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { drawingsQuery } from '@/api/queries'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/drawings')({
  component: DrawingsPage,
})

function DrawingsPage() {
  const { data: docs } = useSuspenseQuery(drawingsQuery())

  return (
    <div>
      <PageHeader
        title="ნახაზების რეესტრი"
        subtitle="ატვირთვისას ახალი რევიზია ავტომატურად აგზავნის შეტყობინებას ვიზირების ჯაჭვზე"
        actions={
          <Button>
            <Upload className="h-4 w-4" /> ატვირთვა
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>კოდი</TableHead>
                <TableHead>დასახელება</TableHead>
                <TableHead>ფორმატი</TableHead>
                <TableHead>რევიზია</TableHead>
                <TableHead>სტატუსი</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.code} className="cursor-pointer">
                  <TableCell className="font-bold">{d.code}</TableCell>
                  <TableCell className="font-semibold">{d.name}</TableCell>
                  <TableCell className="text-mut">{d.meta}</TableCell>
                  <TableCell className="text-mut">{d.rev}</TableCell>
                  <TableCell><StatusBadge status={d.st} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
