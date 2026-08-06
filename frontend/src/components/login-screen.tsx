import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ROLES, type RoleId } from '@/data/domain'
import { useSession } from '@/lib/session'

const LABEL = 'mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mut'
const FIELD = 'w-full rounded-lg border border-line-2 bg-card px-3 py-2.5 text-sm'

const FEATURES = [
  'ხარვეზის დაფიქსირება ველზე — ფოტოთი, offline რეჟიმშიც',
  '358 ბინის პროგრესი ერთ ინტერაქტიულ რუკაზე',
  'ავტომატური PDF ანგარიშები და შეტყობინებები',
]

const STATS = [
  ['24', 'მოდული'],
  ['15', 'როლი · RBAC'],
  ['3', 'Web · iOS · Android'],
]

/** Roles that must clear a second factor before entering. */
const NEEDS_2FA: RoleId[] = ['admin', 'techdir', 'pmdir']

export function LoginScreen() {
  const { login } = useSession()
  const navigate = useNavigate()
  const [roleId, setRoleId] = useState<RoleId>('pm')
  const [step, setStep] = useState<1 | 2>(1)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const finish = () => {
    login(roleId)
    navigate({ to: '/' })
  }

  const setOtpAt = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1)
    setOtp((prev) => prev.map((d, j) => (j === i ? digit : d)))
    if (digit && i < 5) otpRefs.current[i + 1]?.focus()
  }

  return (
    <div className="flex min-h-screen flex-wrap overflow-y-auto bg-shell">
      {/* Marketing pane */}
      <div className="relative flex min-w-[min(460px,100%)] flex-[1.2] flex-col justify-between gap-10 overflow-hidden p-[clamp(28px,5vw,64px)] text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(115deg,rgba(13,17,21,.97) 30%,rgba(13,17,21,.72))',
          }}
        />
        <div className="relative z-2 flex items-center gap-2.75">
          <div className="grid h-7.5 w-7.5 place-items-center rounded-lg bg-brand font-display text-[17px] font-extrabold">
            K
          </div>
          <div className="font-display text-lg font-bold tracking-[0.2em]">KORPUS</div>
        </div>

        <div className="relative z-2 max-w-[560px] animate-rise">
          <div className="mb-3.5 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FF7A40]">
            Construction Operations Platform
          </div>
          <h1 className="mb-4.5 text-[clamp(26px,3.6vw,40px)] font-extrabold leading-[1.16]">
            მთელი სამშენებლო ობიექტი — ერთ ეკრანზე
          </h1>
          <p className="mb-7.5 max-w-[460px] text-[15px] text-[#9AA6AE]">
            პროექტების მართვა, QA/QC ინსპექტირება, დოკუმენტბრუნვა და ავტომატური ანგარიშგება — Web, iOS
            და Android.
          </p>
          <div className="flex flex-col gap-3.5">
            {FEATURES.map((f, i) => (
              <div key={f} className="flex items-baseline gap-3.5">
                <span className="font-mono text-xs text-[#FF7A40]">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[14.5px] text-[#D8DEE2]">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-2 flex flex-wrap gap-[clamp(20px,4vw,48px)] border-t border-[#262C33] pt-5.5">
          {STATS.map(([v, l]) => (
            <div key={l}>
              <div className="font-display text-2xl font-bold">{v}</div>
              <div className="text-[11.5px] text-[#8B959D]">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Form pane */}
      <div className="grid min-w-[min(400px,100%)] flex-1 place-items-center bg-page p-[clamp(20px,4vw,48px)]">
        <div className="w-[min(400px,100%)] animate-rise rounded-[14px] border border-line bg-card p-7 shadow-[0_24px_60px_rgba(20,24,28,0.10)]">
          {step === 1 ? (
            <>
              <div className="mb-1 text-[19px] font-bold">შესვლა სისტემაში</div>
              <div className="mb-5 text-[12.5px] text-mut">
                დემო რეჟიმი — აირჩიეთ როლი და ნახეთ, რას ხედავს თითოეული
              </div>

              <div className="mb-3.25">
                <label className={LABEL} htmlFor="login-email">
                  ელფოსტა
                </label>
                <input id="login-email" type="email" defaultValue="n.beridze@company.ge" className={FIELD} />
              </div>
              <div className="mb-3.25">
                <label className={LABEL} htmlFor="login-password">
                  პაროლი
                </label>
                <input id="login-password" type="password" defaultValue="0000000000" className={FIELD} />
              </div>
              <div className="mb-5">
                <label className={LABEL} htmlFor="login-role">
                  როლი (დემო)
                </label>
                <select
                  id="login-role"
                  className={`${FIELD} cursor-pointer`}
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value as RoleId)}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="w-full cursor-pointer rounded-lg bg-brand py-2.75 text-sm font-bold text-white shadow-[0_4px_12px_rgba(255,77,0,0.25)] transition-colors hover:bg-brand-hover"
                onClick={() => (NEEDS_2FA.includes(roleId) ? setStep(2) : finish())}
              >
                შესვლა
              </button>
              <div className="mt-3.5 text-center text-[11.5px] text-mut-2">
                ადმინისტრატორი და დირექტორი — სავალდებულო 2FA
              </div>
            </>
          ) : (
            <>
              <div className="mb-1 text-[19px] font-bold">ორფაქტორიანი ავთენტიკაცია</div>
              <div className="mb-5 text-[12.5px] text-mut">
                შეიყვანეთ 6-ნიშნა კოდი ავთენტიკატორიდან — სავალდებულოა მაღალი უფლების როლებზე
              </div>
              <div className="mb-5 flex gap-2">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el
                    }}
                    value={d}
                    maxLength={1}
                    inputMode="numeric"
                    aria-label={`კოდის ${i + 1} ციფრი`}
                    onChange={(e) => setOtpAt(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
                    }}
                    className="w-full rounded-lg border border-line-2 py-2.75 text-center font-mono text-xl"
                  />
                ))}
              </div>
              <button
                className="w-full cursor-pointer rounded-lg bg-ink py-2.75 text-sm font-bold text-white transition-colors hover:bg-[#2A3138]"
                onClick={finish}
              >
                დადასტურება
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
