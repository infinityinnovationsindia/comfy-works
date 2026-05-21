'use client'

import { useEffect, useState } from 'react'
import { User, Mail, Phone, MapPin, Calendar, Award, Clock, FileText, Edit2, Save, X } from 'lucide-react'

type Profile = {
  id: string
  employee_no: string
  first_name: string
  last_name: string
  middle_name?: string
  gender: string
  date_of_birth: string
  email: string
  blood_group: string
  designation: string
  department: string
  location: string
  employment_type: string
  date_of_joining: string
  probation_end_date?: string
  shift_name?: string
  reporting_manager_name?: string
  // Contact (editable)
  local_address?: string
  local_phone?: string
  // Leave
  pl_earned: number
  pl_used: number
  pl_balance: number
  // This month attendance
  days_present: number
  days_absent: number
  red_marks: number
}

export default function ProfilePage() {
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(false)
  const [phone,    setPhone]    = useState('')
  const [address,  setAddress]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch('/api/profile')
        const json = await res.json()
        setProfile(json)
        setPhone(json.local_phone   || '')
        setAddress(json.local_address || '')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local_phone: phone, local_address: address }),
      })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  function fmtDate(d?: string) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  function tenure(joining: string) {
    const ms    = Date.now() - new Date(joining).getTime()
    const years = Math.floor(ms / (1000 * 60 * 60 * 24 * 365))
    const months = Math.floor((ms % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30))
    if (years === 0) return `${months} month${months !== 1 ? 's' : ''}`
    return `${years} yr${years !== 1 ? 's' : ''} ${months} mo`
  }

  if (loading) return <div className="flex items-center justify-center h-full py-20 text-gray-400">Loading profile...</div>
  if (!profile) return <div className="p-6 text-red-500">Failed to load profile.</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <User className="h-6 w-6 text-[#1D9E75]" />
        <h1 className="text-xl font-bold text-gray-900">My Profile</h1>
        {saved && (
          <span className="text-sm text-[#1D9E75] bg-green-50 px-3 py-1 rounded-full">✓ Saved</span>
        )}
      </div>

      {/* Header card */}
      <div className="bg-gradient-to-r from-[#1D9E75] to-[#178a63] rounded-2xl p-6 text-white mb-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold">
            {profile.first_name[0]}{profile.last_name[0]}
          </div>
          <div>
            <h2 className="text-xl font-bold">{profile.first_name} {profile.middle_name ? profile.middle_name + ' ' : ''}{profile.last_name}</h2>
            <p className="text-green-100">{profile.designation} · {profile.department}</p>
            <p className="text-green-200 text-sm mt-0.5">{profile.employee_no} · {profile.employment_type}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xs text-green-200">PL Balance</p>
            <p className="text-2xl font-bold">{profile.pl_balance.toFixed(1)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xs text-green-200">Tenure</p>
            <p className="text-lg font-bold">{tenure(profile.date_of_joining)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xs text-green-200">Red Marks</p>
            <p className="text-2xl font-bold">{profile.red_marks}</p>
            <p className="text-xs text-green-200">this month</p>
          </div>
        </div>
      </div>

      {/* Leave summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">PL Earned</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{profile.pl_earned.toFixed(1)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">PL Used</p>
          <p className="text-xl font-bold text-orange-500 mt-1">{profile.pl_used.toFixed(1)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">PL Balance</p>
          <p className={`text-xl font-bold mt-1 ${profile.pl_balance <= 0 ? 'text-red-500' : 'text-[#1D9E75]'}`}>
            {profile.pl_balance.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Employment details */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Award className="h-4 w-4 text-[#1D9E75]" />
          Employment Details
        </h3>
        <div className="grid grid-cols-2 gap-y-3 text-sm">
          {[
            ['Employee No',       profile.employee_no],
            ['Designation',       profile.designation],
            ['Department',        profile.department],
            ['Location',          profile.location],
            ['Employment Type',   profile.employment_type],
            ['Date of Joining',   fmtDate(profile.date_of_joining)],
            ['Probation End',     profile.probation_end_date ? fmtDate(profile.probation_end_date) : 'N/A'],
            ['Reporting Manager', profile.reporting_manager_name || '—'],
            ['Shift',             profile.shift_name || '—'],
            ['Blood Group',       profile.blood_group || '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="font-medium text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact — editable */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Phone className="h-4 w-4 text-[#1D9E75]" />
            Contact Information
          </h3>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-sm text-[#1D9E75] hover:underline"
            >
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Email</label>
            <p className="font-medium text-gray-900 mt-0.5">{profile.email || '—'}</p>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Phone</label>
            {editing ? (
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                placeholder="Mobile number"
              />
            ) : (
              <p className="font-medium text-gray-900 mt-0.5">{profile.local_phone || '—'}</p>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Local Address</label>
            {editing ? (
              <textarea
                rows={3}
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
                placeholder="Current local address"
              />
            ) : (
              <p className="font-medium text-gray-900 mt-0.5 whitespace-pre-line">{profile.local_address || '—'}</p>
            )}
          </div>

          {editing && (
            <button
              onClick={save}
              disabled={saving}
              className="w-full py-2.5 bg-[#1D9E75] text-white rounded-xl text-sm font-medium hover:bg-[#178a63] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
