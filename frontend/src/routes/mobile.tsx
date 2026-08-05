import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/mobile')({
  component: MobilePage,
})

const FEATURES = [
  { n: '01', t: 'Offline-first', d: 'ჩანაწერები ინახება ლოკალურად და სინქრონდება კავშირის აღდგენისას — სარდაფშიც მუშაობს.' },
  { n: '02', t: 'ფოტო + GPS + დრო', d: 'ყველა ფოტოს ავტომატურად ემატება კოორდინატები და დროის შტამპი — დავის შემთხვევაში მტკიცებულებაა.' },
  { n: '03', t: 'ავტო-რეკომენდაცია', d: 'კატეგორიის არჩევისას სისტემა თავად სვამს გამოსასწორებელ ღონისძიებას — ინსპექტორი აღარ ბეჭდავს.' },
  { n: '04', t: 'Push შეტყობინებები', d: 'შემსრულებელი მაშინვე იგებს ახალ დავალებას; PM — ვადის გადაცილებას.' },
  { n: '05', t: 'ხელმოწერა ეკრანზე', d: 'აქტების ხელმოწერა პირდაპირ ობიექტზე — ქაღალდის გარეშე.' },
]

function MobilePage() {
  return (
    <div>
      <PageHeader
        title="მობილური აპი — Field"
        subtitle="ველზე მომუშავე ინსპექტორებისა და ქვეკონტრაქტორების ინსტრუმენტი"
      />
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {FEATURES.map((f) => (
          <Card key={f.n}>
            <CardContent className="p-5">
              <div className="text-2xl font-extrabold text-brand">{f.n}</div>
              <div className="mt-1 text-sm font-bold">{f.t}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-mut-3">{f.d}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
