import { useMemo, useState } from 'react'
import { Plus, Pencil, Copy } from 'lucide-react'
import { useData } from '../ctx/DataContext.jsx'
import { Btn, Card, ConfirmDelete, Empty, Field, Input, Modal, PageHeader, PersonTag, Select, Stat, StatStrip, Table } from '../components/ui.jsx'
import { ChartCard, TimeChart, HBars, slot } from '../components/charts.jsx'
import { BankSelect, PersonSelect, useForm, numOrNull } from '../components/forms.jsx'
import { INCOME_SOURCES } from '../lib/constants.js'
import { inr, inrCompact } from '../lib/format.js'
import { dateShort, dateInMonth, lastMonths, monthLabel, monthShort, shiftMonth, ym } from '../lib/dates.js'

function IncomeModal({ row, onClose }) {
  const { add, edit, today, me, people, data, notify } = useData()
  const [f, set, setF] = useForm({ date: row?.date || today, person: row?.person || me || people[0] || '', source: row?.source || 'Salary', amount: row?.amount ?? '', bank_account_id: row?.bank_account_id || '', note: row?.note || '' })
  const sources = useMemo(() => [...new Set([...INCOME_SOURCES, ...data.income.map((i) => i.source)])], [data.income])
  // pre-fill the person's usual account
  const onPerson = (e) => {
    const p = e.target.value
    const b = data.bank_accounts.find((x) => x.owner === p && x.active !== false)
    setF((o) => ({ ...o, person: p, bank_account_id: o.bank_account_id || b?.id || '' }))
  }
  const save = async (e) => {
    e.preventDefault()
    const amount = numOrNull(f.amount)
    if (amount == null) return notify('Enter the amount', 'error')
    const body = { date: f.date, person: f.person, source: f.source.trim(), amount, bank_account_id: f.bank_account_id || null, note: f.note.trim() || null }
    try { row ? await edit('income', row.id, body) : await add('income', body); notify(row ? 'Income updated' : `Logged ${inr(amount)} ${f.source}`); onClose() } catch { /* toast */ }
  }
  return (
    <Modal open onClose={onClose} title={row ? 'Edit income' : 'Log income'} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="income-form">Save</Btn></>}>
      <form id="income-form" onSubmit={save} className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Amount (₹)"><Input required autoFocus type="number" min="0" step="0.01" inputMode="decimal" value={f.amount} onChange={set('amount')} className="text-[18px] font-semibold" /></Field>
        <Field label="Date received"><Input required type="date" value={f.date} onChange={set('date')} /></Field>
        <PersonSelect label="Received by" value={f.person} onChange={onPerson} withJoint />
        <Field label="Source"><Input required list="income-sources" value={f.source} onChange={set('source')} /><datalist id="income-sources">{sources.map((s) => <option key={s} value={s} />)}</datalist></Field>
        <BankSelect value={f.bank_account_id} onChange={set('bank_account_id')} label="Credited to" />
        <Field label="Note"><Input value={f.note} onChange={set('note')} placeholder="optional" /></Field>
      </form>
    </Modal>
  )
}

export default function Income() {
  const { data, derived, today, people, addMany, del, notify } = useData()
  const [modal, setModal] = useState(null)
  const [month, setMonth] = useState(ym(today))
  const [fPerson, setFPerson] = useState('')
  const [fSource, setFSource] = useState('')
  const months = lastMonths(ym(today), 12)
  const persons = [...people, 'Joint']

  const series = months.map((m) => {
    const row = { label: monthShort(m), month: m }
    for (const p of persons) row[p] = Math.round(data.income.filter((i) => i.date.slice(0, 7) === m && i.person === p).reduce((s, i) => s + Number(i.amount), 0))
    return row
  })
  const activePersons = persons.filter((p) => series.some((s) => s[p] > 0))
  const inMonthAll = data.income.filter((i) => i.date.slice(0, 7) === month).sort((a, b) => (a.date < b.date ? 1 : -1))
  const inMonth = inMonthAll.filter((i) => (!fPerson || i.person === fPerson) && (!fSource || i.source === fSource))
  const monthTotal = inMonthAll.reduce((s, i) => s + Number(i.amount), 0)
  const sourcesInMonth = [...new Set(inMonthAll.map((i) => i.source))].sort()
  const bySource = (() => { const m = new Map(); data.income.filter((i) => months.includes(i.date.slice(0, 7))).forEach((i) => m.set(i.source, (m.get(i.source) || 0) + Number(i.amount))); return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value) })()
  const twelve = derived.cashflow.reduce((s, c) => s + c.income, 0)
  const withIncome = derived.cashflow.filter((c) => c.income > 0).length || 1

  // "Same as last month" - the salary is the same every month, so let one tap repeat it
  const prevMonth = shiftMonth(month, -1)
  const template = data.income.filter((i) => i.date.slice(0, 7) === prevMonth && i.source === 'Salary')
  const missing = template.filter((t) => !inMonth.some((i) => i.source === 'Salary' && i.person === t.person))
  const repeat = async () => {
    const rows = missing.map((t) => ({ date: dateInMonth(month, Number(t.date.slice(8, 10))) > today ? today : dateInMonth(month, Number(t.date.slice(8, 10))), person: t.person, source: 'Salary', amount: t.amount, bank_account_id: t.bank_account_id, note: null }))
    try { await addMany('income', rows); notify(`Copied ${rows.length} salary entr${rows.length > 1 ? 'ies' : 'y'} from ${monthLabel(prevMonth)}`) } catch { /* toast */ }
  }

  return (
    <>
      <PageHeader title="Income" subtitle="Salary and every other inflow, by person and account." actions={<Btn variant="primary" onClick={() => setModal({})}><Plus size={16} />Log income</Btn>} />
      <StatStrip cols={3}>
        <Stat big label={monthLabel(month)} value={inr(monthTotal)} sub={`${inMonth.length} entries`} tone="pos" />
        <Stat label="Last 12 months" value={inrCompact(twelve)} sub="all sources" />
        <Stat label="Monthly average" value={inrCompact(twelve / withIncome)} sub={`across ${withIncome} months with income`} />
      </StatStrip>

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard title="Income by month" table={{ head: ['Month', ...activePersons, 'Total'], rows: series.map((s) => [monthLabel(s.month), ...activePersons.map((p) => inr(s[p])), inr(activePersons.reduce((t, p) => t + s[p], 0))]) }}>
          <TimeChart type="bar" data={series} series={(activePersons.length ? activePersons : people).map((p, i) => ({ key: p, label: p, color: slot(persons.indexOf(p)) }))} height={210} />
        </ChartCard>
        <Card title="By source · 12 months"><HBars items={bySource} colorOf={(_, i) => slot(i)} showShare empty="No income logged yet." /></Card>
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Select className="!w-auto" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">{[...months].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select>
            <Select className="!w-auto" value={fPerson} onChange={(e) => setFPerson(e.target.value)} aria-label="Person"><option value="">Everyone</option>{persons.map((p) => <option key={p}>{p}</option>)}</Select>
            <Select className="!w-auto" value={fSource} onChange={(e) => setFSource(e.target.value)} aria-label="Source"><option value="">All sources</option>{sourcesInMonth.map((s) => <option key={s}>{s}</option>)}</Select>
          </div>
          {missing.length > 0 && <Btn size="sm" onClick={repeat}><Copy size={14} />Repeat {monthLabel(prevMonth)} salary ({missing.map((m) => m.person).join(', ')})</Btn>}
        </div>
        <div className="p-2 md:p-3">
          {inMonthAll.length === 0 ? <div className="p-2"><Empty title={`No income in ${monthLabel(month)}`} action={<Btn variant="primary" onClick={() => setModal({})}>Log income</Btn>} /></div>
            : inMonth.length === 0 ? <div className="p-2"><Empty title="Nothing matches" hint="Change the filters above." /></div> : (
            <Table head={['Date', 'Person', 'Source', 'Credited to', { label: 'Amount', right: true }, '']}>
              {inMonth.map((i) => (
                <tr key={i.id}>
                  <td className="td text-soft">{dateShort(i.date)}</td>
                  <td className="td"><PersonTag name={i.person} /></td>
                  <td className="td">{i.source}{i.note && <span className="ml-1.5 text-[12px] text-muted">{i.note}</span>}</td>
                  <td className="td text-soft">{derived.maps.bank[i.bank_account_id]?.name || '—'}</td>
                  <td className="td tnum text-right font-medium text-sage">{inr(i.amount)}</td>
                  <td className="td whitespace-nowrap text-right"><Btn size="sm" variant="ghost" aria-label="Edit income" onClick={() => setModal({ row: i })}><Pencil size={14} /></Btn><ConfirmDelete onConfirm={async () => { try { await del('income', i.id); notify('Income deleted') } catch { /* toast */ } }} /></td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
      {modal && <IncomeModal row={modal.row} onClose={() => setModal(null)} />}
    </>
  )
}
