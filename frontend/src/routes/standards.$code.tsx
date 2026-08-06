import { createFileRoute, notFound } from '@tanstack/react-router'
import { Printer } from 'lucide-react'
import { STANDARD_DOCS } from '@/data/standards-content'
import type { StandardBlock, StandardDoc } from '@/data/domain'
import { BackLink, PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/standards/$code')({
  loader: ({ params }) => {
    const doc = STANDARD_DOCS.find((d) => d.code === params.code)
    if (!doc) throw notFound()
    return doc
  },
  component: StandardPage,
})

/** Cover-page fields, in the order the source documents list them. */
const META_FIELDS: [keyof StandardDoc['meta'], string][] = [
  ['author', 'ავტორი'],
  ['approved', 'დამტკიცების თარიღი'],
  ['changed', 'ბოლო ცვლილება'],
  ['version', 'ვერსია'],
  ['ownerProcess', 'პროცესზე პასუხისმგებელი'],
  ['ownerDoc', 'დოკუმენტზე პასუხისმგებელი'],
  ['dept', 'დეპარტამენტი'],
  ['related', 'დაკავშირებული ერთეულები'],
  ['access', 'წვდომა'],
]

function StandardPage() {
  const doc = Route.useLoaderData()
  const sections = doc.sections
  // Only worth a table of contents when the document is actually divided up.
  const toc = sections.filter((s) => s.title).map((s) => s.title as string)

  return (
    <div>
      <PageHeader
        back={<BackLink to="/standards">სტანდარტები</BackLink>}
        crumb={doc.code}
        title={doc.title}
        subtitle={`${doc.kind === 'P' ? 'პროცესი' : 'სტანდარტი'} · ${doc.cat} · ${doc.pages} გვერდი`}
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> ბეჭდვა
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        {/* `min-w-0`: a grid item defaults to min-content width, which a wide
            table would push past the viewport on a phone. */}
        <Card className="min-w-0 print:border-0 print:shadow-none">
          {/* A measure of ~68 characters — long Georgian prose is unreadable at
              full container width on a desktop screen. */}
          <CardContent className="p-5 sm:p-7 *:max-w-[68ch]">
            {sections.map((section, i) => (
              <section key={i} className="mt-8 first:mt-0 max-w-none">
                {section.title && (
                  <h2
                    id={slug(section.title)}
                    className="scroll-mt-20 border-b border-line pb-2 text-base font-extrabold"
                  >
                    {section.title}
                  </h2>
                )}
                {section.blocks.map((block, j) => (
                  <Block key={j} block={block} />
                ))}
              </section>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 lg:sticky lg:top-4 print:hidden">
          {toc.length > 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-mut-2">
                  სარჩევი
                </div>
                <nav className="flex flex-col gap-1">
                  {toc.map((title) => (
                    <a
                      key={title}
                      href={`#${slug(title)}`}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-mut transition-colors hover:bg-soft hover:text-brand-dark"
                    >
                      {title}
                    </a>
                  ))}
                </nav>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-mut-2">
                დოკუმენტის მონაცემები
              </div>
              <dl className="flex flex-col gap-2.5">
                <div>
                  <dt className="text-[11px] text-mut-2">დოკუმენტის #</dt>
                  <dd className="font-mono text-xs font-bold text-brand">{doc.code}</dd>
                </div>
                {META_FIELDS.filter(([k]) => doc.meta[k]).map(([k, label]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-mut-2">{label}</dt>
                    <dd className="text-xs font-semibold leading-snug">{doc.meta[k]}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Block({ block }: { block: StandardBlock }) {
  switch (block.type) {
    case 'h3':
      return <h3 className="mt-6 mb-2 text-sm font-bold leading-snug">{block.text}</h3>

    case 'para':
      return <p className="mt-3 text-sm leading-[1.75] text-ink/90">{block.text}</p>

    case 'list':
      return (
        <ul className="mt-3 flex flex-col gap-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="relative pl-4 text-sm leading-[1.7] text-ink/90">
              <span className="absolute left-0 top-[0.6em] h-1.5 w-1.5 rounded-full bg-brand/50" />
              {item}
            </li>
          ))}
        </ul>
      )

    case 'table':
      return <DocTable rows={block.rows} />

    case 'figure':
      return (
        <img
          src={`/standards/${block.src}`}
          alt=""
          className="mt-4 w-full rounded-lg border border-line"
        />
      )

    case 'caption':
      // The photo itself did not survive the source export — the reference did.
      return <p className="mt-3 text-xs italic text-mut-2">{block.text}</p>
  }
}

/**
 * Tables come in two shapes. A two-column one is a label/value list — read as
 * rows of definitions, not as a grid — so it renders without a header. Anything
 * wider is a real data table and keeps its first row as headings.
 */
function DocTable({ rows }: { rows: string[][] }) {
  if (!rows.length) return null

  if (rows[0]!.length === 2) {
    // These documents put a column-header pair (`role | responsibility`) in the
    // middle of a definition table; two short cells above a long one is one.
    const isHeader = (row: string[], i: number) =>
      row[0]!.length <= 24 && row[1]!.length <= 24 && (rows[i + 1]?.[1]?.length ?? 0) > 24

    return (
      <dl className="mt-4 overflow-hidden rounded-lg border border-line">
        {rows.map((row, i) =>
          isHeader(row, i) ? (
            <div key={i} className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line bg-soft px-3 py-2">
              {row.map((cell, j) => (
                <span
                  key={j}
                  className={`min-w-0 text-[11px] font-bold uppercase tracking-wide text-mut-2 ${
                    j === 0 ? 'shrink-0 sm:w-[calc(0.4*(100%-1rem))]' : ''
                  }`}
                >
                  {cell}
                </span>
              ))}
            </div>
          ) : (
            <div
              key={i}
              className="grid gap-x-4 border-b border-line last:border-0 sm:grid-cols-[minmax(120px,0.4fr)_1fr]"
            >
              <dt className="bg-soft/60 px-3 py-2.5 text-xs font-bold leading-snug">{row[0]}</dt>
              <dd className="px-3 py-2.5 text-sm leading-[1.7]">{row[1]}</dd>
            </div>
          ),
        )}
      </dl>
    )
  }

  const [head, ...body] = rows
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line">
      <Table>
        <TableHeader>
          <TableRow className="bg-soft/60">
            {head!.map((cell, i) => (
              <TableHead key={i} className="whitespace-normal">
                {cell}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {body.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j} className="text-sm leading-snug">
                  {cell || <span className="text-mut-2">—</span>}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Anchor id for a section heading — Georgian text can't go in a URL fragment. */
function slug(title: string): string {
  const [num] = title.split('.')
  return `s-${num.toLowerCase()}`
}
