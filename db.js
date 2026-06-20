import { supabase } from './supabaseClient'

// ── ANNONCES ──────────────────────────────────────────────────
export async function fetchListings() {
  const { data, error } = await supabase
    .from('listings')
    .select('*, listing_photos(url, position)')
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return [] }
  return data.map(l => ({
    ...l,
    photos: (l.listing_photos || []).sort((a,b)=>a.position-b.position).map(p=>p.url),
  }))
}

export async function createListing(listing) {
  const { data, error } = await supabase
    .from('listings')
    .insert([{
      title: listing.title,
      type: listing.type,
      price: listing.price,
      ville: listing.ville,
      quartier: listing.quartier,
      phone: listing.phone,
      rooms: listing.rooms,
      surface: listing.surface,
      description: listing.description,
      ai_generated: listing.aiGenerated,
      status: 'available',
    }])
    .select()
    .single()
  if (error) { console.error(error); return null }
  return data
}

export async function updateListingStatus(id, status, occupiedAt = null) {
  const { error } = await supabase
    .from('listings')
    .update({ status, occupied_at: occupiedAt })
    .eq('id', id)
  if (error) console.error(error)
}

export async function renewListing(id) {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'available', renewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error(error)
}

export async function deleteListing(id) {
  const { error } = await supabase.from('listings').delete().eq('id', id)
  if (error) console.error(error)
}

// ── PHOTOS ────────────────────────────────────────────────────
export async function uploadPhoto(file, listingId) {
  const fileName = `${listingId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('listing-photos')
    .upload(fileName, file)
  if (uploadError) { console.error(uploadError); return null }

  const { data: urlData } = supabase.storage
    .from('listing-photos')
    .getPublicUrl(fileName)

  const { error: dbError } = await supabase
    .from('listing_photos')
    .insert([{ listing_id: listingId, url: urlData.publicUrl }])
  if (dbError) console.error(dbError)

  return urlData.publicUrl
}

export async function replaceListingPhotos(listingId, files) {
  // Supprime les anciennes photos
  await supabase.from('listing_photos').delete().eq('listing_id', listingId)
  // Upload les nouvelles
  const urls = []
  for (const file of files) {
    const url = await uploadPhoto(file, listingId)
    if (url) urls.push(url)
  }
  return urls
}

// ── PAIEMENTS ─────────────────────────────────────────────────
export async function uploadPaymentScreenshot(file, reference) {
  const fileName = `${reference}-${Date.now()}-${file.name}`
  const { error } = await supabase.storage
    .from('payment-screenshots')
    .upload(fileName, file)
  if (error) { console.error(error); return null }

  const { data } = supabase.storage
    .from('payment-screenshots')
    .getPublicUrl(fileName)
  return data.publicUrl
}

export async function recordPayment({ listingId, type, amount, reseau, reference, screenshotUrl, buyerPhone }) {
  const { data, error } = await supabase
    .from('payments')
    .insert([{
      listing_id: listingId,
      type,
      amount,
      reseau,
      reference,
      screenshot_url: screenshotUrl,
      buyer_phone: buyerPhone || null,
      status: 'confirmed', // déblocage immédiat comme demandé
    }])
    .select()
    .single()
  if (error) { console.error(error); return null }
  return data
}

export async function fetchPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, listings(title)')
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return [] }
  return data
}

// ── ALERTES ───────────────────────────────────────────────────
export async function createAlert(listingId, type, message) {
  const { error } = await supabase
    .from('alerts')
    .insert([{ listing_id: listingId, type, message }])
  if (error) console.error(error)
}

export async function fetchAlerts() {
  const { data, error } = await supabase
    .from('alerts')
    .select('*, listings(title, ville, quartier)')
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return [] }
  return data
}

export async function markAlertsRead() {
  const { error } = await supabase
    .from('alerts')
    .update({ read: true })
    .eq('read', false)
  if (error) console.error(error)
}
