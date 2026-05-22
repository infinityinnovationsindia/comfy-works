
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function VehiclesPage() {
  const [trips, setTrips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vehicle, setVehicle] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const month = today.slice(0,7)

  useEffect(() => {
    const params = new URLSearchParams({ month })
    if (vehicle) params.set('vehicle', vehicle)
    fetch(`/api/vehicles?${params}`).then(r=>r.json()).then(d=>{setTrips(d);setLoading(false)})
  }, [vehicle])

  const totalKM = trips.reduce((sum,t)=>sum+(t.total_km||0),0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Vehicle Logistics</h1>
          <p className="text-sm text-gray-500 mt-1">Form #61 — TATA 407 & Piaggio</p>
        </div>
        <Link href="/vehicles/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + Log Trip
        </Link>
      </div>

      <div className="flex gap-3 mb-6">
        {['','TATA_407','Piaggio'].map(v=>(
          <button key={v} onClick={()=>setVehicle(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${vehicle===v?'bg-green-700 text-white border-green-700':'bg-white text-gray-600 border-gray-200'}`}>
            {v||'All Vehicles'}
          </button>
        ))}
        <div className="ml-auto bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
          This month: <strong>{totalKM.toFixed(0)} KM</strong>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {trips.map(trip=>(
            <Link key={trip.id} href={`/vehicles/${trip.id}`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{trip.vehicle==='TATA_407'?'TATA 407':'Piaggio'}</span>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{new Date(trip.date).toLocaleDateString('en-IN')}</span>
                      {!trip.time_in && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">OUT</span>}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Out: {trip.time_out||'—'} · In: {trip.time_in||'—'} · {trip.vehicle_trip_legs?.length||0} stops
                    </div>
                    <div className="text-sm text-gray-500">
                      ODO: {trip.odometer_out} → {trip.odometer_in||'—'} = <strong>{trip.total_km||0} KM</strong>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {trips.length===0 && <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No trips this month.</div>}
        </div>
      )}
    </div>
  )
}
