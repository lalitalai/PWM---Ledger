import { useState } from 'react'
import { Plus, Pencil, Landmark, CreditCard } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PageHeader, PersonTag, Select, Table, Badge, Progress } from '../components/ui.jsx'
import { useForm, numOrNull, nz } from '../components/forms.jsx'
import { BANK_ACCOUNT_TYPES } from '../lib/constants.js'
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
  const [f, set] = useForm({ name: row?.name || '', issuing_bank: row?.issuing_bank || '', credit_limit: row?.credit_limit ?? '', owner: row?.owner || people[0] || '', last4: row?.last4 || '', billing_day: row?.billing_day ?? '', active: row?.active ?? true })
  const save = async (e) => {
    e.preventDefault()
    const body = { name: f.name.trim(), issuing_bank: f.issuing_bank.trim(), credit_limit: numOrNull(f.credit_limit) ?? 0, owner: nz(f.owner), last4: nz(f.last4?.trim()), billing_day: numOrNull(f.billing_day), active: f.active }
    try { row ? await edit('credit_cards', row.id, body) : await add('credit_cards', body); notify(row ? 'Card updated' : 'Card added'); onClose() } catch { /* toast shown */ }
  }
  return (
    <Modal open onClose={onClose} title={row ? 'Edit credit card' : 'Add credit card'}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="card-form">Save</Btn></>}>
      <form id="card-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Card name" className="sm:col-span-2"><Input required value={f.name} onChange={set('name')} placeholder="e.g. HDFC Regalia" autoFocus /></Field>
        <Field label="Issuing bank"><Input required value={f.issuing_bank} onChange={set('issuing_bank')} placeholder="HDFC Bank" /></Field>
        <Field label="Credit limit (₹)"><Input required type="number" min="0" inputMode="numeric" value={f.credit_limit} onChange={set('credit_limit')} /></Field>
        <Field label="Card holder"><Select value={f.owner ?? ''} onChange={set('owner')}>{people.map((p) => <option key={p}>{p}</option>)}<option>Joint</option></Select></Field>
        <Field label="Last 4 digits"><Input inputMode="numeric" maxLength={4} value={f.last4} onChange={set('last4')} /></Field>
        <Field label="Statement day" hint="Day of month, optional"><Input type="number" min="1" max="31" value={f.billing_day} onChange={set('billing_day')} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[13.5px]"><input type="checkbox" checked={f.active} onChange={set('active')} className="h-4 w-4 accent-[var(--gold-fill)]" />Active</label>
      </form>
    </Modal>
  )
}

export default function Masters() {
  const { data, del, notify, today } = useData()
  const [modal, setModal] = useState(null) // {kind, row}
  const month = ym(today)
  const spent = (cardId) => data.expenses.filter((e) => e.credit_card_id === cardId && e.date.slice(0, 7) === month).reduce((s, e) => s + Number(e.amount), 0)
  const usage = (bankId) => ['expenses', 'income', 'sip_master', 'emi_master'].reduce((n, t) => n + data[t].filter((r) => r.bank_account_id === bankId).length, 0)
  const remove = async (table, id, what) => { try { await del(table, id); notify(`${what} removed`) } catch { /* toast */ } }

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

      <Card title="Credit cards" action={<Btn size="sm" variant="primary" onClick={() => setModal({ kind: 'card' })}><Plus size={14} />Add</Btn>}>
        {data.credit_cards.length === 0 ? <Empty title="No credit cards yet" hint="Once added, choose them when logging an expense paid by Credit Card." action={<Btn variant="primary" onClick={() => setModal({ kind: 'card' })}><CreditCard size={15} />Add first card</Btn>} /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.credit_cards.map((c) => {
              const used = spent(c.id)
              const u = Number(c.credit_limit) > 0 ? (used / Number(c.credit_limit)) * 100 : 0
              return (
                <div key={c.id} className={`rounded-lg border border-line p-3.5 ${c.active === false ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{c.name}{c.last4 && <span className="ml-1.5 text-[12px] text-muted">••{c.last4}</span>}</div>
                      <div className="text-[12.5px] text-soft">{c.issuing_bank}{c.billing_day ? ` · statement day ${c.billing_day}` : ''}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1"><PersonTag name={c.owner} /><Btn size="sm" variant="ghost" onClick={() => setModal({ kind: 'card', row: c })} aria-label={`Edit ${c.name}`}><Pencil size={14} /></Btn><ConfirmDelete onConfirm={() => remove('credit_cards', c.id, 'Card')} /></div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between text-[12.5px]"><span className="text-soft">Limit <b className="tnum text-ink">{inr(c.credit_limit)}</b></span><span className="tnum text-soft">{inr(used)} spent this month · {pct(u, 0)}</span></div>
                  <div className="mt-1.5"><Progress value={u} tone={u > 60 ? 'rust' : u > 30 ? 'gold' : 'sage'} height={6} /></div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {modal?.kind === 'bank' && <BankModal row={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'card' && <CardModal row={modal.row} onClose={() => setModal(null)} />}
    </>
  )
}
