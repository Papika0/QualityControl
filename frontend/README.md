# QualityControl Frontend

Web აპლიკაცია ნუცუბიძე 2ა ხარისხის კონტროლის პლატფორმისთვის — აწყობილია
სპეციფიკაციის **§1.2 Frontend (Web)** სტეკზე, დამტკიცებული ინტერაქტიული
პროტოტიპის ეკრანების მიხედვით.

## სტეკი (სპეც. §1.2)

| ფენა | არჩევანი | სად ჩანს კოდში |
| --- | --- | --- |
| Framework | **React 19 + Vite** | `vite.config.ts`, `src/main.tsx` |
| Routing | **TanStack Router** (file-based, typed search params) | `src/routes/` — QA ფილტრები (`/qa?st=…&cat=…`), დავალებების ფილტრები (`/tasks?who=…&floor=…`), სტანდარტების ძებნა (`/standards?q=…`) URL-ში ტიპიზებულად ცხოვრობს |
| Server state | **TanStack Query** | `src/api/queries.ts` — `queryOptions` ფაბრიკები; `src/api/client.ts` აწყობილია ისე, რომ Eden Treaty client-ით ჩანაცვლება მხოლოდ ამ ფაილს შეეხოს |
| UI | **Tailwind CSS 4 + shadcn/ui-სტილის კომპონენტები** | `src/components/ui/` — button, card, dialog, select, tabs, table, badge… კომპონენტები პროექტშია დაკოპირებული, არა dependency |
| ცხრილები | **TanStack Table + TanStack Virtual** | `src/routes/qa.tsx` — sorting + ვირტუალიზებული რიგები (5000 ჩანაწერზეც გაიხსნება) |
| გრაფიკები | **Recharts** | `src/routes/index.tsx` — გეგმა-vs-ფაქტი ხაზი, სტატუსების donut |
| Gantt | **Frappe Gantt** | `src/routes/schedule.tsx` — პაკეტები დამოკიდებულებებით |

## ეკრანები

- **Login** — როლის არჩევა; admin/techdir-ისთვის 2FA ნაბიჯი
- **Dashboard** (`/`) — KPI ბარათები, პროგრესის გრაფიკი, ხარვეზების donut, ტოპ კატეგორიები, ვადაგადაცილებულები, დატვირთვა/აქტივობა
- **პროექტის რუკა** (`/map`) — სართულების ზოლი + ბინების ბადე (პროგრესი, ხარვეზები, გაყიდვის სტატუსი)
- **ბინის ბარათი** (`/apartments/:no`) — ტაბები: ზოგადი, სამუშაოები (16 ეტაპი), QA, ფოტოები, დოკუმენტები, ისტორია
- **QA/QC ხარვეზები** (`/qa`) — ვირტუალიზებული ცხრილი, chip-ფილტრები URL-ში, ხარვეზის მოდალი timeline-ით, ახალი ხარვეზის ფორმა ავტო-რეკომენდაციით
- **დავალებები** (`/tasks`) — kanban (ახალი → მიმდინარე → შემოწმებაზე → დასრულებული), ფილტრები, checklist + კომენტარები
- **გეგმა-გრაფიკი** (`/schedule`) — Frappe Gantt: დღე/კვირა/თვე
- **სტანდარტები** (`/standards`) — ძებნა + კატეგორიები
- **ნახაზები / არქივი / ფინანსები / Audit Log / ადმინისტრირება / მობილური**

როლები ცვლის ინტერფეისს: sub ხედავს მხოლოდ საკუთარ სამუშაოებს, owner — მხოლოდ
თავის ბინას; ფინანსები/ადმინკა role-gate-ითაა დაცული (`beforeLoad` redirect).

## გაშვება

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run preview
```

## შემდეგი ნაბიჯები

- Elysia backend + Eden Treaty — `src/api/client.ts`-ის mock-ის ჩანაცვლება
- რეალური auth (session/JWT) `src/lib/session.tsx`-ში
- Optimistic updates mutation-ებზე (სტატუსის ცვლილება, კომენტარები)
