import { Route, Routes } from 'react-router-dom'
import { PageHeader, Tabs } from '../components/ui.jsx'
import Dashboard from './invest/Dashboard.jsx'
import Holdings from './invest/Holdings.jsx'
import Sips from './invest/Sips.jsx'
import AddInvestment from './invest/AddInvestment.jsx'
import Cas from './invest/Cas.jsx'

const TABS = [
  { to: '/invest', label: 'Dashboard', end: true },
  { to: '/invest/holdings', label: 'Holdings' },
  { to: '/invest/sips', label: 'SIPs' },
  { to: '/invest/add', label: 'Add / withdraw' },
  { to: '/invest/cas', label: 'Import CAS' },
]

export default function Invest() {
  return (
    <>
      <PageHeader title="Investments" subtitle="Mutual funds, shares, gold, PPF, EPF - and the SIPs that feed them." />
      <Tabs items={TABS} />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="holdings" element={<Holdings />} />
        <Route path="sips" element={<Sips />} />
        <Route path="add" element={<AddInvestment />} />
        <Route path="cas" element={<Cas />} />
      </Routes>
    </>
  )
}
