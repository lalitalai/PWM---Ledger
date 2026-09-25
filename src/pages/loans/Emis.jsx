import { useMemo, useState } from 'react'
import { AlertTriangle, Calculator, Pencil, Plus } from 'lucide-react'
import { useData } from '../../ctx/DataContext.jsx'
import { Badge, Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PersonTag, Select, Table, Textarea } from '../../components/ui.jsx'
import { BankSelect, CardSelect, PersonSelect, useForm, numOrNull, nz } from '../../components/forms.jsx'
import { EMI_KINDS, LOAN_TYPES, emiKindLabel } from '../../lib/constants.js'
import { nper, pmt } from '../../lib/amortization.js'
import { inr, monthsToYM, pct } from '../../lib/format.js'
import { dateLabel, dateShort } from '../../lib/dates.js'

function EmiModal({ row, onClose }) {
  const { add, edit, today, me, people, data, notify } = useData()
  const [f, set, setF] = useForm({
    emi_kind: row?.emi_kind || 'loan', name: row?.name || '', lender: row?.lender || '', loan_type: row?.loan_type || 'Home Loan', person: row?.person || me || people[0] || 'Joint',
    principal: row?.principal ?? '', interest_rate: row?.interest_rate ?? '', tenure_months: row?.tenure_months ?? '', emi_amount: row?.emi_amount ?? '',
    outstanding_amount: row?.outstanding_amount ?? '', outstanding_as_of: row?.outstanding_as_of || today, emi_day: row?.emi_day ?? '', bank_account_id: row?.bank_account_id || '',
    credit_card_id: row?.credit_card_id || '', tax_deductible: row?.tax_deductible ?? false, active: row?.active ?? true, notes: row?.notes || '',
  })
  const isCardEmi = f.emi_kind === 'card_emi'
  const P = numOrNull(f.principal), R = numOrNull(f.interest_rate), N = numOrNull(f.tenure_months), E = numOrNull(f.emi_amount), O = numOrNull(f.outstanding_amount)
  const suggested = P && R != null && N ? Math.round(pmt(P, R, N)) : null
  const monthlyInterest = O && R != null ? (O * R) / 1200 : 0
  const remaining = O && R != null && E ? nper(O, R, E) : null
  const tooLow = E != null && O && E <= monthlyInterest

  const save = async (e) => {
    e.preventDefault()
    if (tooLow) return notify('The EMI is not even covering the monthly interest - please check the numbers', 'error')
    if (isCardEmi && !f.credit_card_id) return notify('Choose which credit card this EMI is on', 'error')
    const body = {
      emi_kind: f.emi_kind, name: f.name.trim(), lender: nz(f.lender.trim()), loan_type: isCardEmi ? 'Credit Card EMI' : f.loan_type, person: f.person, principal: P, interest_rate: R, tenure_months: N, emi_amount: E,
      outstanding_amount: O, outstanding_as_of: f.outstanding_as_of, emi_day: Number(f.emi_day), bank_account_id: isCardEmi ? null : (f.bank_account_id || null),
      credit_card_id: isCardEmi ? f.credit_card_id : null, tax_deductible: isCardEmi ? false : f.tax_deductible, active: f.active, notes: nz(f.notes.trim()),
    }
    try { row ? await edit('emi_master', row.id, body) : await add('emi_master', body); notify(row ? 'Loan updated' : (isCardEmi ? 'Card EMI added - it will post automatically' : 'Loan added - EMIs will post automatically')); onClose() } catch { /* toast */ }
  }

  return (
    <Modal open wide onClose={onClose} title={row ? 'Edit loan / EMI' : 'Add loan / EMI'} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="emi-form">Save loan</Btn></>}>
      <form id="emi-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Kind" className="sm:col-span-2">
          <Select value={f.emi_kind} onChange={(e) => { const v = e.target.value; setF((o) => ({ ...o, emi_kind: v, interest_rate: v === 'card_emi' && o.interest_rate === '' ? 0 : o.interest_rate })) }}>
            {EMI_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </Select>
        </Field>
        <Field label={isCardEmi ? 'What was bought' : 'Loan name'} className="sm:col-span-2"><Input required autoFocus={!row} value={f.name} onChange={set('name')} placeholder={isCardEmi ? 'e.g. iPhone 17 - no-cost EMI' : 'e.g. Home loan - HDFC'} /></Field>
        {isCardEmi
          ? <CardSelect value={f.credit_card_id} onChange={set('credit_card_id')} label="On which credit card" kind="credit" required />
          : <Field label="Type"><Select value={f.loan_type} onChange={set('loan_type')}>{LOAN_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>}
        <Field label="Lender" hint={isCardEmi ? 'Usually the card issuer' : null}><Input value={f.lender} onChange={set('lender')} placeholder="HDFC Bank" /></Field>
        <Field label={isCardEmi ? 'Purchase amount (₹)' : 'Total loan amount (₹)'} hint="Originally sanctioned"><Input required type="number" min="1" inputMode="numeric" value={f.principal} onChange={set('principal')} /></Field>
        <Field label="Interest rate (% a year)" hint={isCardEmi ? '0 for a no-cost EMI' : null}><Input required type="number" min="0" max="60" step="0.01" inputMode="decimal" value={f.interest_rate} onChange={set('interest_rate')} /></Field>
        <Field label="Tenure (months)"><Input required type="number" min="1" max="480" inputMode="numeric" value={f.tenure_months} onChange={set('tenure_months')} /></Field>
        <Field label="EMI amount (₹)" hint={suggested ? <button type="button" className="inline-flex items-center gap-1 font-medium text-gold underline" onClick={() => setF((o) => ({ ...o, emi_amount: suggested }))}><Calculator size={12} />Calculated EMI: {inr(suggested)} - use it</button> : 'Copy it from your statement'}>
          <Input required type="number" min="1" step="any" inputMode="decimal" value={f.emi_amount} onChange={set('emi_amount')} /></Field>
        <Field label="Outstanding principal (₹)" hint="From your latest statement"><Input required type="number" min="0" step="any" inputMode="decimal" value={f.outstanding_amount} onChange={set('outstanding_amount')} /></Field>
        <Field label="…as on" hint="EMIs after this date post automatically"><Input required type="date" max={today} value={f.outstanding_as_of} onChange={set('outstanding_as_of')} /></Field>
        <Field label="EMI date (day of month)"><Input required type="number" min="1" max="31" inputMode="numeric" value={f.emi_day} onChange={set('emi_day')} /></Field>
        <PersonSelect value={f.person} onChange={set('person')} label="Borrower" />
        {!isCardEmi && <BankSelect value={f.bank_account_id} onChange={set('bank_account_id')} label="Debited from" />}
        <div className="flex flex-col justify-end gap-2 pb-1 text-[13.5px]">
          {!isCardEmi && <label className="flex items-center gap-2"><input type="checkbox" checked={f.tax_deductible} onChange={set('tax_deductible')} className="h-4 w-4 accent-[var(--gold-fill)]" />Interest earns a tax deduction (e.g. home loan)</label>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={set('active')} className="h-4 w-4 accent-[var(--gold-fill)]" />Active</label>
        </div>
        {(remaining != null || tooLow) && (
          <div className={`rounded-lg px-3 py-2.5 text-[12.5px] sm:col-span-2 ${tooLow ? 'bg-rust-soft text-rust' : 'bg-sunken text-soft'}`}>
            {tooLow ? <><AlertTriangle size={14} className="mr-1 inline" />Monthly interest is about {inr(monthlyInterest)}, which is not less than the EMI - the loan would never close.</>
              : Number.isFinite(remaining) ? <>At this EMI the outstanding {inr(O)} clears in about <b className="text-ink">{monthsToYM(Math.ceil(remaining))}</b>; interest in the first month is about {inr(monthlyInterest)}.</> : null}
          </div>
        )}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  )
}

export default function Emis() {
  const { data, derived, people, del, notify } = useData()
  const [modal, setModal] = useState(null)
  const [fPerson, setFPerson] = useState('')
  const [fKind, setFKind] = useState('')
  const [fType, setFType] = useState('')
  const types = useMemo(() => [...new Set(data.emi_master.map((l) => l.loan_type))].sort(), [data.emi_master])
  const rows = data.emi_master.filter((l) => (!fPerson || l.person === fPerson) && (!fKind || (l.emi_kind || 'loan') === fKind) && (!fType || l.loan_type === fType))
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-soft">Every EMI is posted automatically on its date. Balances are rebuilt from the outstanding amount you enter.</p>
        <Btn variant="primary" onClick={() => setModal({})}><Plus size={16} />Add loan</Btn>
      </div>
      {data.emi_master.length > 0 && (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Select value={fPerson} onChange={(e) => setFPerson(e.target.value)} aria-label="Borrower"><option value="">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}<option value="Joint">Joint</option></Select>
          <Select value={fKind} onChange={(e) => setFKind(e.target.value)} aria-label="Kind"><option value="">All kinds</option>{EMI_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>
          <Select value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Loan type"><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</Select>
        </div>
      )}
      <Card pad={false}>
        <div className="p-2 md:p-3">
          {data.emi_master.length === 0 ? <div className="p-2"><Empty title="No loans yet" hint="Add each loan once: amount, rate, tenure, EMI, outstanding and EMI date." action={<Btn variant="primary" onClick={() => setModal({})}>Add loan</Btn>} /></div>
            : rows.length === 0 ? <div className="p-2"><Empty title="Nothing matches" hint="Change the filters above." /></div> : (
            <Table head={['Loan', 'Borrower', { label: 'Sanctioned', right: true }, { label: 'Rate', right: true }, { label: 'EMI', right: true }, { label: 'Outstanding now', right: true }, 'Day', '']}>
              {rows.map((l) => {
                const d = derived.loans.find((x) => x.loan.id === l.id)
                const isCardEmi = l.emi_kind === 'card_emi'
                const card = isCardEmi ? derived.maps.card[l.credit_card_id] : null
                return (
                  <tr key={l.id} className={l.active === false ? 'opacity-60' : ''}>
                    <td className="td min-w-[180px] font-medium">{l.name}
                      <div className="text-[12px] font-normal text-muted">
                        {isCardEmi ? <>Card EMI{card ? ` · ${card.name}` : ''}</> : l.loan_type}
                        {l.lender ? ` · ${l.lender}` : ''}{l.tax_deductible ? ' · tax benefit' : ''}{l.active === false ? ' · inactive' : ''}
                      </div>
                    </td>
                    <td className="td"><PersonTag name={l.person} /></td>
                    <td className="td tnum text-right text-soft">{inr(l.principal)}<div className="text-[11.5px] text-muted">{l.tenure_months} months</div></td>
                    <td className="td tnum text-right text-soft">{pct(l.interest_rate, 2)}</td>
                    <td className="td tnum text-right font-medium">{inr(l.emi_amount)}</td>
                    <td className="td tnum text-right">{d ? inr(d.summary.balanceToday) : '—'}{d?.closed && <div><Badge tone="sage">closed</Badge></div>}</td>
                    <td className="td tnum text-center text-soft">{l.emi_day}</td>
                    <td className="td whitespace-nowrap text-right">
                      <Btn size="sm" variant="ghost" aria-label={`Edit ${l.name}`} onClick={() => setModal({ row: l })}><Pencil size={14} /></Btn>
                      <ConfirmDelete onConfirm={async () => { try { await del('emi_master', l.id); notify('Loan and its history deleted') } catch { /* toast */ } }} />
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>
      <p className="mt-3 text-[12px] text-muted">Changing the outstanding amount or its date re-bases the schedule from that point; earlier automatic EMI records stay as history.</p>
      {modal && <EmiModal row={modal.row} onClose={() => setModal(null)} />}
    </>
  )
}
