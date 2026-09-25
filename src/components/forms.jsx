import { useState } from 'react'
import { useData } from '../ctx/DataContext.jsx'
import { Field, Select, Input } from './ui.jsx'
import { PAYMENT_METHODS, PAYMENT_CARD_KIND, cardKindLabel, EXPENSE_CHANNELS, VENDOR_SUGGESTIONS } from '../lib/constants.js'

export function useForm(initial) {
  const [f, setF] = useState(initial)
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  return [f, set, setF]
}
export const numOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
export const nz = (v) => (v === '' || v == null ? null : v)

export const bankLabel = (b) => `${b.name} - ${b.owner}${b.last4 ? ` ••${b.last4}` : ''}`
export const cardLabel = (c) => `${c.name}${c.last4 ? ` ••${c.last4}` : ''}`

export function PersonSelect({ value, onChange, label = 'Whose', withJoint = true, ...p }) {
  const { people } = useData()
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={onChange} {...p}>
        {people.map((n) => <option key={n} value={n}>{n}</option>)}
        {withJoint && <option value="Joint">Joint</option>}
      </Select>
    </Field>
  )
}

export function BankSelect({ value, onChange, label = 'Bank account', required, blank = 'Not specified' }) {
  const { data } = useData()
  const banks = data.bank_accounts.filter((b) => b.active !== false || b.id === value)
  return (
    <Field label={label} hint={!banks.length ? 'Add accounts under Banks & cards' : null}>
      <Select value={value ?? ''} onChange={onChange} required={required}>
        <option value="">{blank}</option>
        {banks.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
      </Select>
    </Field>
  )
}

export function CardSelect({ value, onChange, label = 'Credit card', required, kind, blank }) {
  const { data } = useData()
  const cards = data.credit_cards.filter((c) => (c.active !== false || c.id === value) && (!kind || (c.kind || 'credit') === kind))
  return (
    <Field label={label} hint={!cards.length ? `Add a ${kind ? cardKindLabel(kind).toLowerCase() : 'card'} under Banks & cards` : null}>
      <Select value={value ?? ''} onChange={onChange} required={required}>
        <option value="">{blank || 'Choose a card…'}</option>
        {cards.map((c) => <option key={c.id} value={c.id}>{cardLabel(c)} - {c.issuing_bank}</option>)}
      </Select>
    </Field>
  )
}

export function GoalSelect({ value, onChange, label = 'Goal (optional)' }) {
  const { data } = useData()
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={onChange}>
        <option value="">Not linked to a goal</option>
        {data.goals.filter((g) => g.active !== false).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </Select>
    </Field>
  )
}

export function HoldingSelect({ value, onChange, label = 'Investment', required, filter }) {
  const { derived } = useData()
  const list = derived.holdings.filter(filter || (() => true))
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={onChange} required={required}>
        <option value="">Choose…</option>
        {list.map((h) => <option key={h.id} value={h.id}>{h.name}{h.person ? ` (${h.person})` : ''}</option>)}
      </Select>
    </Field>
  )
}

/** Payment method + the dropdown that depends on it: bank accounts for Bank/UPI, the card master for Credit Card. */
export function PaymentFields({ f, set }) {
  return (
    <>
      <Field label="Paid with">
        <Select value={f.payment_method} onChange={(e) => set('payment_method')(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Select>
      </Field>
      {f.payment_method === 'bank_upi' && <BankSelect value={f.bank_account_id} onChange={set('bank_account_id')} label="From account" />}
      {f.payment_method in PAYMENT_CARD_KIND && (
        <CardSelect value={f.credit_card_id} onChange={set('credit_card_id')} label={`Which ${cardKindLabel(PAYMENT_CARD_KIND[f.payment_method]).toLowerCase()}`} kind={PAYMENT_CARD_KIND[f.payment_method]} required={PAYMENT_CARD_KIND[f.payment_method] === 'credit'} />
      )}
    </>
  )
}

/** Was it bought through an app/website or in person - and where. Both optional; vendor offers suggestions but takes any text. */
export function ChannelVendorFields({ f, set, listId = 'vendor-suggestions' }) {
  const suggestions = VENDOR_SUGGESTIONS[f.channel] || [...VENDOR_SUGGESTIONS.online, ...VENDOR_SUGGESTIONS.physical]
  return (
    <>
      <Field label="Purchase type">
        <Select value={f.channel || ''} onChange={set('channel')}>
          <option value="">Not specified</option>
          {EXPENSE_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </Field>
      <Field label="Vendor / where">
        <Input list={listId} value={f.vendor || ''} onChange={set('vendor')} placeholder={f.channel === 'online' ? 'e.g. Zepto, Amazon' : f.channel === 'physical' ? 'e.g. Office canteen' : 'optional'} />
        <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s === 'Other' ? '' : s} />)}</datalist>
      </Field>
    </>
  )
}
