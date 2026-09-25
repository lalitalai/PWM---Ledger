import { useState } from 'react'
import { Plus, Pencil, Landmark, CreditCard } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PageHeader, PersonTag, Select, Segmented, Table, Badge, Progress } from '../components/ui.jsx'
import { useForm, numOrNull, nz } from '../components/forms.jsx'
import { BANK_ACCOUNT_TYPES, CARD_KINDS, cardKindLabel } from '../lib/constants.js'
import { inr, pct } from '../lib/format.js'
import { ym } from '../lib/dates.js'

function BankModal({ row, onClose }) {
  const { add, edit, people, notify } = useData()
  const [f, set] = useForm({ name: row?.name || '', bank_name: row?.bank_name || '', owner: row?.owner || people[0] || 'Joint', account_type: row?.account_type || 'Savings', last4: row?.last4 || '', active: row?.active ?? true })
  const save = async (e) => {
    e.preventDefault()
    const body = { name: f.name.trim(), bank_name: f.bank_name.trim(), owner: f.owner, account_type: f.account_type, last4: nz(f.last4?.trim()), active: f.active }
    try { row ? await edit('bank_accounts', row.id, body) : await add('bank_accounts', body); notify(row ? 'Account updated' : 'Account added'); onClose() } catch { /* toast shown */ }
  }
  return (
    <Modal open onClose={onClose} title={row ? 'Edit bank account' : 'Add bank account'}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="bank-form">Save</Btn></>}>
      <form id="bank-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Nickname" className="sm:col-span-2"><Input required value={f.name} onChange={set('name')} placeholder="e.g. HDFC Salary" autoFocus /></Field>
        <Field label="Bank"><Input required value={f.bank_name} onChange={set('bank_name')} placeholder="HDFC Bank" /></Field>
        <Field label="Account holder">
          <Select value={f.owner} onChange={set('owner')}>{people.map((p) => <option key={p}>{p}</option>)}<option>Joint</option></Select>
        </Field>
        <Field label="Type"><Select value={f.account_type} onChange={set('account_type')}>{BANK_ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Last 4 digits" hint="Only the last four - never the full number"><Input inputMode="numeric" maxLength={4} value={f.last4} onChange={set('last4')} /></Field>
        <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2"><input type="checkbox" checked={f.active} onChange={set('active')} className="h-4 w-4 accent-[var(--gold-fill)]" />Active (shown in dropdowns)</label>
      </form>
    </Modal>
  )
}

function CardModal({ row, onClose }) {
  const { add, edit, people, notify } = useData()
  const [f, set] = useForm({ kind: row?.kind || 'credit', name: row?.name || '', issuing_bank: row?.issuing_bank || '', credit_limit: row?.credit_limit ?? '', owner: row?.owner || people[0] || '', last4: row?.last4 || '', billing_day: row?.billing_day ?? '', active: row?.active ?? true })
  const isCredit = f.kind === 'credit'
  const save = async (e) => {
    e.preventDefault()
    const body = { kind: f.kind, name: f.name.trim(), issuing_bank: f.issuing_bank.trim(), credit_limit: numOrNull(f.credit_limit), owner: nz(f.owner), last4: nz(f.last4?.trim()), billing_day: numOrNull(f.billing_day), active: f.active }
    try { row ? await edit('credit_cards', row.id, body) : await add('credit_cards', body); notify(row ? 'Card updated' : 'Card added'); onClose() } catch { /* toast shown */ }
  }
  return (
    <Modal open onClose={onClose} title={row ? 'Edit card' : 'Add card'}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="card-form">Save</Btn></>}>
      <form id="card-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Kind" className="sm:col-span-2"><Select value={f.kind} onChange={set('kind')}>{CARD_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></Field>
        <Field label="Card name" className="sm:col-span-2"><Input required value={f.name} onChange={set('name')} placeholder={isCredit ? 'e.g. HDFC Regalia' : `e.g. Sodexo ${cardKindLabel(f.kind)}`} autoFocus /></Field>
        <Field label={isCredit ? 'Issuing bank' : 'Issued by'}><Input required value={f.issuing_bank} onChange={set('issuing_bank')} placeholder={isCredit ? 'HDFC Bank' : 'e.g. Employer / Sodexo / Zeta'} /></Field>
        <Field label={isCredit ? 'Credit limit (₹)' : 'Monthly limit (₹)'} hint={isCredit ? null : 'Optional - leave blank if it does not have one'}><Input required={isCredit} type="number" min="0" inputMode="numeric" value={f.credit_limit} onChange={set('credit_limit')} /></Field>
        <Field label="Card holder"><Select value={f.owner ?? ''} onChange={set('owner')}>{people.map((p) => <option key={p}>{p}</option>)}<option>Joint</option></Select></Field>
        <Field label="Last 4 digits"><Input inputMode="numeric" maxLength={4} value={f.last4} onChange={set('last4')} /></Field>
        {isCredit && <Field label="Statement day" hint="Day of month, optional"><Input type="number" min="1" max="31" value={f.billing_day} onChange={set('billing_day')} /></Field>}
        <label className="flex items-center gap-2 self-end pb-2 text-[13.5px]"><input type="checkbox" checked={f.active} onChange={set('active')} className="h-4 w-4 accent-[var(--gold-fill)]" />Active</label>
      </form>
    </Modal>
  )
}

export default function Masters() {
  const { data, del, notify, today } = useData()
  const [modal, setModal] = useState(null) // {kind, row}
  const [cardFilter, setCardFilter] = useState('all')
  const month = ym(today)
  const usage = (bankId) => ['expenses', 'income', 'sip_master', 'emi_master'].reduce((n, t) => n + data[t].filter((r) => r.bank_account_id === bankId).length, 0)
  const remove = async (table, id, what) => { try { await del(table, id); notify(`${what} removed`) } catch { /* toast */ } }

  // Purchases made on the card (not counting a "Credit Card Payment" settlement itself).
  const spentThisMonth = (cardId) => data.expenses.filter((e) => e.credit_card_id === cardId && e.category !== 'Credit Card Payment' && e.date.slice(0, 7) === month).reduce((s, e) => s + Number(e.amount), 0)
  // Credit cards carry a balance forward: all-time purchases minus all-time settlements = what is owed right now.
  const outstanding = (cardId) => {
    const purchased = data.expenses.filter((e) => e.credit_card_id === cardId && e.category !== 'Credit Card Payment').reduce((s, e) => s + Number(e.amount), 0)
    const settled = data.expenses.filter((e) => e.settles_card_id === cardId).reduce((s, e) => s + Number(e.amount), 0)
    return Math.max(purchased - settled, 0)
  }
  const cardEmis = (cardId) => data.emi_master.filter((e) => e.credit_card_id === cardId && e.active !== false)
  const cardEmiOutstanding = (cardId) => cardEmis(cardId).reduce((s, e) => s + Math.max(Number(e.outstanding_amount) || 0, 0), 0)

  const cardsShown = data.credit_cards.filter((c) => cardFilter === 'all' || (c.kind || 'credit') === cardFilter)
  const kindCounts = Object.fromEntries(CARD_KINDS.map((k) => [k.id, data.credit_cards.filter((c) => (c.kind || 'credit') === k.id).length]))

  return (
    <>
      <PageHeader title="Banks & cards" subtitle="These masters feed the payment dropdowns across the app." />

      <Card title="Bank accounts" className="mb-5" action={<Btn size="sm" variant="primary" onClick={() => setModal({ kind: 'bank' })}><Plus size={14} />Add</Btn>} pad>
        {data.bank_accounts.length === 0 ? <Empty title="No bank accounts yet" hint="Add Lalit's, Sujata's and your joint accounts. They appear in the dropdown whenever you pay by Bank Transfer / UPI." action={<Btn variant="primary" onClick={() => setModal({ kind: 'bank' })}><Landmark size={15} />Add first account</Btn>} /> : (
          <Table head={['Account', 'Bank', 'Holder', 'Type', { label: 'Used in', right: true }, '']}>
            {data.bank_accounts.map((b) => (
              <tr key={b.id} className={b.active === false ? 'opacity-60' : ''}>
                <td className="td font-medium">{b.name}{b.last4 && <span className="ml-1.5 text-[12px] text-muted">••{b.last4}</span>}{b.active === false && <Badge className="ml-2">inactive</Badge>}</td>
                <td className="td text-soft">{b.bank_name}</td>
                <td className="td"><PersonTag name={b.owner} /></td>
                <td className="td text-soft">{b.account_type}</td>
                <td className="td tnum text-right text-soft">{usage(b.id)} entries</td>
                <td className="td whitespace-nowrap text-right">
                  <Btn size="sm" variant="ghost" onClick={() => setModal({ kind: 'bank', row: b })} aria-label={`Edit ${b.name}`}><Pencil size={14} /></Btn>
                  <ConfirmDelete label="Delete" onConfirm={() => remove('bank_accounts', b.id, 'Account')} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Cards" action={<Btn size="sm" variant="primary" onClick={() => setModal({ kind: 'card' })}><Plus size={14} />Add</Btn>}>
        {data.credit_cards.length === 0 ? <Empty title="No cards yet" hint="Add credit cards, and meal / fuel / telecom cards if you use them - each becomes an option when logging an expense." action={<Btn variant="primary" onClick={() => setModal({ kind: 'card' })}><CreditCard size={15} />Add first card</Btn>} /> : (
          <>
            <Segmented className="mb-3.5" value={cardFilter} onChange={setCardFilter}
              options={[{ value: 'all', label: `All (${data.credit_cards.length})` }, ...CARD_KINDS.filter((k) => kindCounts[k.id] > 0).map((k) => ({ value: k.id, label: `${k.label} (${kindCounts[k.id]})` }))]} />
            <div className="grid gap-3 md:grid-cols-2">
              {cardsShown.map((c) => {
                const kind = c.kind || 'credit'
                const isCredit = kind === 'credit'
                const used = spentThisMonth(c.id)
                const owe = isCredit ? outstanding(c.id) : 0
                const emis = cardEmis(c.id)
                const emiOwed = cardEmiOutstanding(c.id)
                const limit = Number(c.credit_limit) || 0
                const committed = used + emiOwed
                const u = limit > 0 ? (committed / limit) * 100 : 0
                return (
                  <div key={c.id} className={`rounded-lg border border-line p-3.5 ${c.active === false ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{c.name}{c.last4 && <span className="ml-1.5 text-[12px] text-muted">••{c.last4}</span>}</div>
                        <div className="text-[12.5px] text-soft">{!isCredit && <Badge tone="gold" className="mr-1.5">{cardKindLabel(kind)}</Badge>}{c.issuing_bank}{c.billing_day ? ` · statement day ${c.billing_day}` : ''}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1"><PersonTag name={c.owner} /><Btn size="sm" variant="ghost" onClick={() => setModal({ kind: 'card', row: c })} aria-label={`Edit ${c.name}`}><Pencil size={14} /></Btn><ConfirmDelete onConfirm={() => remove('credit_cards', c.id, 'Card')} /></div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between text-[12.5px]">
                      <span className="text-soft">{limit > 0 ? <>Limit <b className="tnum text-ink">{inr(limit)}</b></> : 'No limit set'}</span>
                      <span className="tnum text-soft">{inr(used)} spent this month{limit > 0 && ` · ${pct(u, 0)}`}</span>
                    </div>
                    {limit > 0 && <div className="mt-1.5"><Progress value={u} tone={u > 60 ? 'rust' : u > 30 ? 'gold' : 'sage'} height={6} /></div>}
                    {isCredit && (owe > 0 || emis.length > 0) && (
                      <div className="mt-3 border-t border-line pt-2.5 text-[12.5px]">
                        {owe > 0 && <div className="flex justify-between"><span className="text-soft">Outstanding to pay</span><span className="tnum font-medium text-rust">{inr(owe)}</span></div>}
                        {emis.length > 0 && (
                          <div className="mt-1.5">
                            <div className="text-soft">{emis.length} no-cost EMI{emis.length > 1 ? 's' : ''} on this card · {inr(emiOwed)} outstanding</div>
                            <ul className="mt-1 space-y-0.5">{emis.map((e) => <li key={e.id} className="flex justify-between text-[12px] text-muted"><span className="truncate">{e.name}</span><span className="tnum shrink-0">{inr(e.emi_amount)}/mo</span></li>)}</ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {modal?.kind === 'bank' && <BankModal row={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'card' && <CardModal row={modal.row} onClose={() => setModal(null)} />}
    </>
  )
}
