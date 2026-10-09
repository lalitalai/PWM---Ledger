import { describe, it, expect } from 'vitest'
import { banksIn, defaultBankFor, guessStatementBank, matchAccountHint, guessCardForPayment } from '../src/lib/accounts.js'

const banks = [
  { id: 'icici', name: 'ICICI Savings', bank_name: 'ICICI Bank', owner: 'Lalit', last4: '3669' },
  { id: 'kotak', name: 'Kotak 811', bank_name: 'Kotak Mahindra Bank', owner: 'Lalit', last4: '8716' },
  { id: 'sbi', name: 'SBI Savings', bank_name: 'State Bank of India', owner: 'Sujata', last4: '5366' },
  { id: 'union', name: 'Union Bank', bank_name: 'Union Bank of India', owner: 'Lalit', last4: '9013' },
  { id: 'joint', name: 'HDFC Joint', bank_name: 'HDFC Bank', owner: 'Joint', last4: '1149' },
  { id: 'old', name: 'Closed IDFC', bank_name: 'IDFC FIRST Bank', owner: 'Lalit', last4: '5135', active: false },
]
const cards = [
  { id: 'regalia', kind: 'credit', name: 'HDFC Regalia', issuing_bank: 'HDFC Bank', last4: '2210' },
  { id: 'flip', kind: 'credit', name: 'Axis Flipkart', issuing_bank: 'Axis Bank', last4: '9034' },
  { id: 'meal', kind: 'meal', name: 'Sodexo', issuing_bank: 'Sodexo', last4: '4471' },
]

describe('bank names', () => {
  it('recognises full names, short names and IFSC/UPI handles', () => {
    expect(banksIn('UPI/CRED Club/UTIB/661008359056')).toEqual(['axis'])
    expect(banksIn('Paid by Kotak Mahindra Bank 8716')).toEqual(['kotak'])
    expect(banksIn('State Bank of India')).toEqual(['sbi'])
    expect(banksIn('Union Bank of India')).toContain('union')
  })
})

describe('which account a transaction came from', () => {
  it('a new expense defaults to the spender\'s own account, then a joint one', () => {
    expect(defaultBankFor('Sujata', banks)).toBe('sbi')
    expect(defaultBankFor('Someone', banks)).toBe('joint')
  })

  it('reads the account number off a bank statement header, masked or not', () => {
    expect(guessStatementBank('Statement of Transactions in Saving Account no. 058101533669 in INR', banks)).toBe('icici')
    expect(guessStatementBank('Account No. 1114548716  Kotak Mahindra Bank', banks)).toBe('kotak')
    expect(guessStatementBank('Account Number  : 32019785366', banks)).toBe('sbi')
    expect(guessStatementBank('A/c XXXXXXXX9013', banks)).toBe('union')
  })

  it('falls back to the bank name only when you have exactly one account there, and never guesses between two', () => {
    expect(guessStatementBank('Welcome to State Bank of India', banks)).toBe('sbi')
    expect(guessStatementBank('Your statement', banks)).toBe('')
    const twoIcici = [...banks, { id: 'icici2', bank_name: 'ICICI Bank', owner: 'Sujata', last4: '7777' }]
    expect(guessStatementBank('ICICI Bank statement', twoIcici)).toBe('')
  })

  it('matches a UPI-app row\'s own account hint (Google Pay prints 4 digits, Paytm only 2)', () => {
    expect(matchAccountHint({ bank: 'Kotak Mahindra Bank', last: '8716' }, banks)).toBe('kotak')
    expect(matchAccountHint({ bank: 'ICICI Bank', last: '69' }, banks)).toBe('icici')
    expect(matchAccountHint({ bank: 'Verified ICICI Bank', last: null }, banks)).toBe('icici')
    expect(matchAccountHint({ bank: 'IDFC FIRST', last: '35' }, banks)).toBe('') // that account is closed
    expect(matchAccountHint(null, banks)).toBe('')
  })
})

describe('which card a bill payment pays off', () => {
  it('uses the card\'s last 4 digits when the narration has them', () => {
    expect(guessCardForPayment('BILLDESK HDFC CREDIT CARD 4xxx2210', cards)).toBe('regalia')
  })
  it('uses the issuer named in a direct payment, but not the bank the money came from', () => {
    expect(guessCardForPayment('IMB/Axis Bank credit card payment', cards)).toBe('flip')
    expect(guessCardForPayment('HDFC CC payment from HDFC', cards, { fromBank: { bank_name: 'HDFC Bank' } })).toBe('')
  })
  it('does not read CRED\'s own collecting bank (UTIB/Axis) as the card issuer', () => {
    expect(guessCardForPayment('UPI/CRED Club/UTIB/663920534263/payment', cards)).toBe('')
  })
  it('with only one credit card, that is the card', () => {
    expect(guessCardForPayment('UPI/CRED Club/UTIB/663920534263/payment', [cards[0], cards[2]])).toBe('regalia')
  })
})
