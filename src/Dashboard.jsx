import React, { useState, useMemo } from 'react'
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from '@react-google-maps/api'

// Static libraries array
const MAP_LIBRARIES = ['places']

// Chains to lookup
const CHAINS = ['Target', 'Marshalls', "Trader Joe's"]

const containerStyle = {
  width: '100%',
  height: '80vh',
}

// Stanford University coordinates
const STANFORD_COORDS = { lat: 37.4275, lng: -122.1697 }

// Haversine formula to calculate straight-line distance (miles)
function getDistanceMiles(a, b) {
  const toRad = x => (x * Math.PI) / 180
  const R = 3958.8 // Earth radius in miles
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinDlat = Math.sin(dLat / 2)
  const sinDlng = Math.sin(dLng / 2)
  const aa = sinDlat * sinDlat + sinDlng * sinDlng * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
  return R * c
}

export default function Dashboard() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  })

  const [addresses, setAddresses] = useState('')
  const [poiData, setPoiData] = useState([])
  const [selected, setSelected] = useState(null)

  const mapCenter = useMemo(() => ({ lat: 37.3861, lng: -122.0839 }), [])

  const handleSubmit = async () => {
    if (!window.google) return
    const geocoder = new window.google.maps.Geocoder()
    const placesService = new window.google.maps.places.PlacesService(document.createElement('div'))
    const lines = addresses.split('\n').map(l => l.trim()).filter(Boolean)

    const data = []
    for (const addr of lines) {
      try {
        const { results: resArr } = await geocoder.geocode({ address: addr })
        if (resArr?.[0]) {
          const loc = resArr[0].geometry.location
          const position = { lat: loc.lat(), lng: loc.lng() }

          // helper to fetch POIs by type and include distance
          const fetchByType = async type => {
            const results = await new Promise(resolve => {
              placesService.nearbySearch(
                { location: position, rankBy: window.google.maps.places.RankBy.DISTANCE, type },
                res => resolve(res)
              )
            })
            return (results || []).slice(0, 6).map(place => {
              const pLoc = place.geometry.location
              const p = { name: place.name, position: { lat: pLoc.lat(), lng: pLoc.lng() } }
              p.distance = getDistanceMiles(position, p.position).toFixed(2)
              return p
            })
          }

          // fetch POIs
          const [gyms, groceries, parks] = await Promise.all([
            fetchByType('gym'),
            fetchByType('grocery_or_supermarket'),
            fetchByType('park')
          ])

          // fetch chains
          const chains = []
          for (const chainName of CHAINS) {
            const res = await new Promise(resolve => {
              placesService.nearbySearch(
                { location: position, rankBy: window.google.maps.places.RankBy.DISTANCE, keyword: chainName },
                r => resolve(r)
              )
            })
            if (res[0]) {
              const place = res[0]
              const pLoc = place.geometry.location
              const p = { chain: chainName, name: place.name, position: { lat: pLoc.lat(), lng: pLoc.lng() } }
              p.distance = getDistanceMiles(position, p.position).toFixed(2)
              chains.push(p)
            }
          }

          // distance from Stanford
          const distStanford = getDistanceMiles(STANFORD_COORDS, position).toFixed(2)

          data.push({
            address: addr,
            position,
            distanceFromStanford: distStanford,
            pois: { gyms, groceries, parks, chains }
          })
        }
      } catch (e) {
        console.error('Error fetching data for', addr, e)
      }
    }
    setPoiData(data)
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-4">Apartment Dashboard</h1>
        <textarea
          rows={4}
          className="w-full border rounded p-2 mb-4"
          placeholder="Enter one address per line"
          value={addresses}
          onChange={e => setAddresses(e.target.value)}
        />
        <button
          onClick={handleSubmit}
          className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >Show Nearby POIs</button>
      </div>

      {isLoaded ? (
        <GoogleMap mapContainerStyle={containerStyle} center={mapCenter} zoom={11}>
          {poiData.map((item,i) => (
            <Marker
              key={i}
              position={item.position}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#f43f5e', fillOpacity: 1, strokeWeight: 0
              }}
              onClick={() => setSelected(item)}
            />
          ))}

          {selected && (
            <InfoWindow position={selected.position} onCloseClick={() => setSelected(null)}>
              <div
                style={{
                  maxWidth: 250,
                  maxHeight: 300,
                  overflowY: 'auto',
                  padding: '8px',
                  fontSize: '14px',
                  color: '#111',
                  lineHeight: 1.4,
                }}
              >
                <strong>{selected.address}</strong>
                <p style={{ margin: '4px 0' }}><em>Distance from Stanford:</em> {selected.distanceFromStanford} mi</p>

                {['gyms','groceries','parks'].map(cat => (
                  <div key={cat} style={{ marginBottom: '6px' }}>
                    <u style={{ textTransform: 'capitalize' }}>{cat}:</u>
                    <ul style={{ paddingLeft: '16px', margin: '2px 0' }}>
                      {selected.pois[cat].map((p, i2) => (
                        <li key={i2}>{p.name} — {p.distance} mi</li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div>
                  <u>Specific Chains:</u>
                  <ul style={{ paddingLeft: '16px', margin: '2px 0' }}>
                    {selected.pois.chains.map((c, i3) => (
                      <li key={i3}>{c.chain}: {c.name} — {c.distance} mi</li>
                    ))}
                  </ul>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      ) : <p>Loading map...</p>}
    </div>
  )
}
