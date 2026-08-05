import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ROLES, type RoleId } from '@/data/domain'
import { useSession } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function LoginScreen() {
  const { login } = useSession()
  const navigate = useNavigate()
  const [roleId, setRoleId] = useState<RoleId>('pm')
  const [step, setStep] = useState<1 | 2>(1)
  const OTP = ['4', '0', '7', '2', '9', '1']

  const finish = () => {
    login(roleId)
    navigate({ to: roleId === 'owner' ? '/apartments/$aptNo' : '/', params: { aptNo: '1204' } })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg font-extrabold text-white">K</div>
            <div>
              <div className="text-lg font-extrabold">ნუცუბიძე 2ა</div>
              <div className="text-xs text-mut">ხარისხის კონტროლის პლატფორმა</div>
            </div>
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-mut-3">როლი (დემო)</label>
                <Select value={roleId} onValueChange={(v) => setRoleId(v as RoleId)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-mut">
                  {ROLES.find((r) => r.id === roleId)?.scope}
                </p>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  if (roleId === 'admin' || roleId === 'techdir') setStep(2)
                  else finish()
                }}
              >
                შესვლა
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-bold">ორფაქტორიანი დადასტურება</div>
                <p className="mt-1 text-xs text-mut">
                  ადმინისტრატორისა და ტექ. დირექტორისთვის 2FA სავალდებულოა. კოდი გაგზავნილია მოწყობილობაზე.
                </p>
              </div>
              <div className="flex justify-between gap-2">
                {OTP.map((d, i) => (
                  <div
                    key={i}
                    className="flex h-12 w-10 items-center justify-center rounded-lg border border-line-2 bg-soft text-lg font-extrabold"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <Button className="w-full" size="lg" onClick={finish}>
                დადასტურება
              </Button>
              <button
                className="w-full text-center text-xs font-semibold text-mut-3 hover:text-ink cursor-pointer"
                onClick={() => setStep(1)}
              >
                ← უკან
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
