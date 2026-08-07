// The assistant's brief and its tool catalogue.
//
// Both live server-side for the same reason the Resend key does: the browser is
// not a place to keep something the answer's correctness depends on. The client
// half of the pair is `src/api/ai-tools.ts`, which holds one executor per name
// listed here — nothing in this file can read the database, and nothing there
// can reach the model.
//
// The vocabulary below is duplicated from `src/data/domain.ts` as prose rather
// than imported: `tsconfig.node.json` compiles this file with Node types and no
// `@` alias, and importing browser-side domain data into a serverless bundle to
// recover eight string literals would cost more than it saves. The literals are
// stable — they are what the UI renders — and `TOOL_NAMES` below is the piece
// that actually has to stay in sync, which the client enforces by typing its
// executor map on the same union.

/** Tool names, in the order the catalogue lists them. */
export const TOOL_NAMES = [
  'get_my_work',
  'get_project_overview',
  'get_floor_status',
  'get_apartment',
  'search_defects',
  'get_defect',
  'list_tasks',
  'get_task',
  'search_standards',
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export interface ChatContext {
  role: string
  roleName: string
  /** Supervisor's name, or '' for the roles that act as the role itself. */
  personName: string
  projectId: string
  projectName: string
  /** `TODAY` from domain.ts — the app's clock is frozen, so this is not now. */
  today: string
}

/**
 * What each role can see, in one line each. The model needs this to answer
 * "why can't I see X" honestly rather than inventing a reason, and to avoid
 * promising a report it will never get the rows for.
 */
const ROLE_BRIEF: Record<string, string> = {
  admin: 'ხედავს ყველაფერს, ორივე ნაკადს.',
  techdir: 'ხედავს მთელ ტექნიკურ ნაკადს და ძირითადი ნაკადის ყველა დავალებას გარდა უფროსის მოთხოვნებისა. ადასტურებს ტექნიკურ დავალებებს და დებს ტექნიკურ დადასტურებას.',
  pmdir: 'ხედავს ძირითად ნაკადს, უფროსის მოთხოვნების ჩათვლით. ტექნიკური ნაკადი მისთვის უხილავია.',
  pfm: 'ხედავს ძირითად ნაკადს, უფროსის მოთხოვნების ჩათვლით. ტექნიკური ნაკადი მისთვის უხილავია.',
  pm: 'ხედავს ძირითად ნაკადს სრულად. აქვეყნებს მოთხოვნებს და ადასტურებს ძირითადი ნაკადის გადასვლებს.',
  qa: 'ხედავს მხოლოდ საკუთარ, მასზე მიბმულ ძირითადი ნაკადის დავალებებს. უფროსის მოთხოვნები და ტექნიკური ნაკადი მისთვის საერთოდ არ არსებობს.',
  techsup: 'ხედავს საკუთარ ტექნიკურ დავალებებს და ძირითადი ნაკადის მიმდინარეობას. დებს ტექნიკურ დადასტურებას.',
}

export function buildSystemPrompt(ctx: ChatContext): string {
  const who = ctx.personName
    ? `${ctx.personName} — ${ctx.roleName}`
    : `${ctx.roleName} (კონკრეტული პიროვნება მიბმული არ არის — „ჩემი" ნიშნავს ამ როლის საქმეს)`

  return `შენ ხარ სამშენებლო ხარისხის კონტროლის პლატფორმის ასისტენტი.

## ვინ გელაპარაკება
${who}
პროექტი: ${ctx.projectName} (${ctx.projectId})
დღეს არის: ${ctx.today}
როლის ხედვა: ${ROLE_BRIEF[ctx.role] ?? 'შეზღუდული ხედვა.'}

## როგორ პასუხობ
- პასუხობ ქართულად, მოკლედ და ზუსტად: 2-4 წინადადება ან მოკლე სია. ეს ჩატი ცნობარია და არა ანგარიში.
- **არასდროს ასახელებ რიცხვს, სტატუსს ან სახელს, რომელიც ინსტრუმენტის პასუხში არ დაგიბრუნდა.** თუ არ იცი — გამოიძახე ინსტრუმენტი. თუ ინსტრუმენტმა ვერ იპოვა — თქვი რომ ვერ მოიძებნა.
- ბმულებს იყენებ **მხოლოდ** ისეთს, რომელიც ინსტრუმენტის პასუხში \`link\` ველად მოვიდა. ბმულს არ იგონებ და არ ცვლი — გამოგონილი ბმული ტექსტად დარენდერდება და მომხმარებელს გაუფუჭებს პასუხს.
- ბმულს წერ **მხოლოდ** markdown-ად: [ბინა 1204](/apartments/1204). შიშველი მისამართი (/map?floor=12) დაუშვებელია — მიეცი სახელი და ჩასვი ფრჩხილებში.
- წერ **მხოლოდ ქართული ანბანით**. ლათინური მხოლოდ ტერმინსა და კოდში (MEP, rev. C, T-2101). სხვა დამწერლობის (კირილიცა, ჩინური, არაბული…) ერთი ასოც არ უნდა მოხვდეს პასუხში — თუ სიტყვა არ გახსენდება, დაწერე აღწერილობით.
- როცა ინსტრუმენტმა ცარიელი სია დააბრუნა, ეს **ნიშნავს რომ ამ მომხმარებელს ეს მონაცემი არ ეხება ან ვერ ხედავს**. ასე პირდაპირ თქვი. ნუ ვარაუდობ რომ მონაცემი არსებობს „სადღაც".

## დომენის ლექსიკონი
**ხარვეზის სტატუსი** (მხოლოდ ეს ოთხი): ღია → მიმდინარე → შემოწმებაზე → დახურული. „ღია ხარვეზი" ნიშნავს ყველაფერს გარდა „დახურულისა".
**ხარვეზს აქვს ვადა** (\`due\`). ვადაგადაცილებულია, თუ ვადა ${ctx.today}-ზე ადრეა და სტატუსი დახურული არ არის.
**ეტაპის სტატუსი**: Not Started → In Progress → Completed, გვერდით Delayed. ბინას 16 ეტაპი აქვს.
**QA-ბარიერი**: ეტაპი ვერ გახდება Completed, სანამ ბინას აქვს ღია ხარვეზი იმ კატეგორიიდან, რომელზეც ეს ეტაპი აგებს პასუხს. Handover-ს ნებისმიერი ღია ხარვეზი ბლოკავს.
**დავალების სვეტები** (მხოლოდ ეს ხუთი): უფროსის მოთხოვნა → ახალი → მიმდინარე → შემოწმებაზე → დასრულებული.
**დავალების ნაკადი**: „ძირითადი" (main) — საიტის სამუშაო; „ტექნიკური" (tech) — ტექნიკური დირექტორისა და ტექნიკური ზედამხედველის ჯაჭვი.
**დავალების ბარიერი**: მიმდინარე→შემოწმებაზე და შემოწმებაზე→დასრულებული საჭიროებს ზედამხედველის „მზადაა"-ს და შემდეგ დამდასტურებელს. ძირითად ნაკადზე შემოწმებაზე→დასრულებული დამატებით საჭიროებს ტექნიკურ დადასტურებას.
**⚠ დავალებას ვადა არ აქვს.** \`due\` ველი დავალებას არ გააჩნია. თუ დავალების ვადაზე გკითხავენ — თქვი რომ სისტემა დავალებას ვადას არ უწესებს, და უპასუხე იმით, რომელ სვეტშია და რა აკლია წინ წასასვლელად. ვადა მხოლოდ **ხარვეზს** აქვს.
**ბინის ნომერი** = სართული + ორნიშნა ინდექსი. მაგ. მე-12 სართული → 1201, 1202, … სართული 1204-ის ნომრიდან პირდაპირ არ იკითხება — გამოიყენე ინსტრუმენტის დაბრუნებული \`floor\`.
**პრიორიტეტი**: მაღალი (high), საშუალო (med), დაბალი (low).

## „რა არის ჩემი დღევანდელი მიზანი?"
გამოიძახე \`get_my_work\`. ის აბრუნებს სამ ჯგუფს:
- \`yourMove\` — სადაც **ეს მომხმარებელი** არის შემდეგი ნაბიჯი. \`doNext\` არის ზუსტად ის ღილაკი, რომელსაც აპლიკაციაში დაინახავს.
- \`waitingOnOthers\` — ხედავს, მაგრამ სხვას ელოდება. \`blocked\` ამბობს რატომ.
- \`yourRequests\` — მისი დაკვეთილი სამუშაო და სად მივიდა (მენეჯმენტისთვის).

პასუხი ააგე ასე: ჯერ რა უნდა გააკეთოს დღეს (ბმულებით), მერე — რა დგას და რატომ. ნუ ჩამოთვლი ყველაფერს; 3-5 ყველაზე მნიშვნელოვანი საკმარისია. თუ სამივე ჯგუფი ცარიელია, თქვი პირდაპირ რომ ღია საქმე არ აქვს.`
}

const TOOL_SPECS: { name: ToolName; description: string; parameters: object }[] = [
  {
    name: 'get_my_work',
    description:
      'რა უნდა გააკეთოს ამ მომხმარებელმა ახლა: დავალებები სადაც ის არის შემდეგი ნაბიჯი, ცალკე დაბლოკილები მიზეზით, პლუს მისი ღია ხარვეზები. ეს არის პასუხი კითხვაზე „რა არის ჩემი მიზანი დღეს" / „რა უნდა გავაკეთო". არგუმენტები არ სჭირდება.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_project_overview',
    description:
      'მთელი პროექტის ჭრილი: საშუალო პროგრესი, დასრულებული ბინები, ღია/ვადაგადაცილებული/მაღალპრიორიტეტიანი ხარვეზები, დაგვიანებული ბინები, ყველაზე პრობლემური სართულები და ხილული დავალებების რაოდენობა სვეტების მიხედვით.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_floor_status',
    description:
      'ერთი სართულის მდგომარეობა: ბინების რაოდენობა, საშუალო პროგრესი, ღია ხარვეზები, დაგვიანებული ბინები, თითოეული ბინის მწკრივი და ამ სართულზე მიმართული ხილული დავალებები.',
    parameters: {
      type: 'object',
      properties: {
        floor: { type: 'integer', description: 'სართულის ნომერი. -1 ნიშნავს პარკინგს.' },
      },
      required: ['floor'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_apartment',
    description:
      'ერთი ბინის სრული სურათი: პროგრესი, ფართი, ოთახები, 16 ეტაპის სტატუსი, ღია ხარვეზები, რა ბლოკავს შემდეგ ეტაპს (QA-ბარიერი) და ამ ბინაზე მიმართული ხილული დავალებები.',
    parameters: {
      type: 'object',
      properties: { no: { type: 'string', description: 'ბინის ნომერი, მაგ. "1204".' } },
      required: ['no'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_defects',
    description:
      'ხარვეზების ძებნა ფილტრებით. ყველა ფილტრი არასავალდებულოა; ერთდროულად მოქმედებს. აბრუნებს მწკრივებს ბმულებით და საერთო რაოდენობას.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['ღია', 'მიმდინარე', 'შემოწმებაზე', 'დახურული'],
          description: 'ზუსტი სტატუსი. ყველა ღიასთვის ეს ველი გამოტოვე და გამოიყენე open=true.',
        },
        open: { type: 'boolean', description: 'true — ყველა დაუხურავი ხარვეზი.' },
        priority: { type: 'string', enum: ['high', 'med', 'low'] },
        cat: { type: 'string', description: 'პრობლემის კატეგორია, ზუსტი დასახელება.' },
        apt: { type: 'string', description: 'ბინის ნომერი.' },
        floor: { type: 'integer', description: 'სართული.' },
        who: { type: 'string', description: 'პასუხისმგებელი ზედამხედველის სახელი.' },
        sub: { type: 'string', description: 'ქვეკონტრაქტორი.' },
        overdue: { type: 'boolean', description: 'true — მხოლოდ ვადაგადაცილებული.' },
        limit: { type: 'integer', description: 'მაქსიმუმ 25.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_defect',
    description: 'ერთი ხარვეზი სრულად: აღწერა, პასუხისმგებელი, ვადა, სტატუსების ისტორია და კომენტარები.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ხარვეზის id, მაგ. "QA-1204-017".' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_tasks',
    description:
      'დავალებების სია — მხოლოდ ის, რასაც ეს მომხმარებელი ხედავს. დავალებას ვადა არ აქვს; თითოეული მწკრივი აჩვენებს სვეტს, ნაკადს, ლოკაციას, შემსრულებელს და ჩეკლისტის პროგრესს.',
    parameters: {
      type: 'object',
      properties: {
        column: {
          type: 'string',
          enum: ['req', 'new', 'prog', 'check', 'done'],
          description: 'req=უფროსის მოთხოვნა, new=ახალი, prog=მიმდინარე, check=შემოწმებაზე, done=დასრულებული.',
        },
        track: { type: 'string', enum: ['main', 'tech'] },
        who: { type: 'string', description: 'შემსრულებლის სახელი.' },
        floor: { type: 'integer', description: 'სართული, რომელსაც დავალება ეხება.' },
        apt: { type: 'string', description: 'ბინა, რომელსაც დავალება ეხება.' },
        mine: { type: 'boolean', description: 'true — მხოლოდ ამ მომხმარებელზე მიბმული.' },
        limit: { type: 'integer', description: 'მაქსიმუმ 25.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_task',
    description:
      'ერთი დავალება სრულად: აღწერა, ჩეკლისტი პუნქტებად, მზადყოფნისა და ტექნიკური დადასტურების შტამპები, ქვე-დავალებები, ისტორია და რა არის შემდეგი ნაბიჯი. თუ მომხმარებელი ამ დავალებას ვერ ხედავს, აბრუნებს found=false.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'დავალების id, მაგ. "T-2105".' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_standards',
    description:
      'ტექნიკური სტანდარტებისა და პროცესების სრულ ტექსტში ძებნა (28 დოკუმენტი). გამოიყენე, როცა კითხვა ეხება ნორმას, დაშვებას, ტოლერანსს, მასალას ან პროცედურას.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'საძებნი ტექსტი ქართულად.' },
        limit: { type: 'integer', description: 'მაქსიმუმ 10.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
]

/** The tool catalogue, in the shape Chat Completions expects. */
const ALL_TOOLS = TOOL_SPECS.map((t) => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}))

/**
 * The catalogue this role gets. Every role reads the same domain, and the rows
 * a role must not see are withheld by the executors themselves (which run in
 * the browser against `visibleTasks`), not by hiding the tool — a hidden tool
 * would only make the model guess instead of asking. The hook stays because a
 * future write tool will need it.
 */
export function roleTools(_role: string) {
  return ALL_TOOLS
}
