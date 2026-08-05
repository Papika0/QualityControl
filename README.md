# QualityControl — ნუცუბიძე 2ა პლატფორმა

სამშენებლო ხარისხის კონტროლის (QA/QC) პლატფორმა: პროექტის რუკა, ხარვეზების აღრიცხვა,
დავალებები, გეგმა-გრაფიკი, სტანდარტები, დოკუმენტბრუნვა, ფინანსები და Audit Log —
როლებზე მორგებული წვდომით (ადმინი, ტექ. დირექტორი, PM, QA, ქვეკონტრაქტორი, ბინის მფლობელი).

## სტრუქტურა

| დირექტორია | აღწერა |
| --- | --- |
| [`frontend/`](frontend/) | Web აპლიკაცია — React 19 + Vite (სპეციფიკაციის §1.2) |

## Frontend Stack (სპეც. §1.2)

| ფენა | არჩევანი | რატომ |
| --- | --- | --- |
| Framework | React 19 + Vite | SPA საკმარისია — internal tool, SEO არ გვჭირდება. Next.js-ის სირთულე უსარგებლოა |
| Routing | TanStack Router | ტიპიზებული routes, search params ტიპებით (ფილტრებისთვის კრიტიკულია) |
| Server state | TanStack Query | cache, refetch, optimistic updates — Eden Treaty-სთან იდეალურად ჯდება |
| UI | Tailwind CSS + shadcn/ui | კომპონენტები კოპირდება პროექტში, არა dependency |
| ცხრილები | TanStack Table | ვირტუალიზაცია, sorting, filtering — 5000 ხარვეზის სია უნდა გაიხსნას |
| გრაფიკები | Recharts | Dashboard-ისთვის საკმარისი |
| Gantt | Frappe Gantt | Gantt-ის ნულიდან დაწერა 3 კვირაა. არ ღირს |

## გაშვება

```bash
cd frontend
npm install
npm run dev
```
