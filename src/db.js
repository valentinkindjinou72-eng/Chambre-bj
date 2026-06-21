import { supabase } from './supabaseClient'

// ── COMPRESSION D'IMAGES ─────────────────────────────────────
// Redimensionne et compresse une image avant upload pour accélérer
// le chargement du site (photos de téléphone = souvent 4-8 Mo,
// inutile pour l'affichage web).
export async function compressImage(file, maxWidth = 1280, quality = 0.75) {
  // On ne touche pas aux fichiers déjà petits (ex: déjà compressés)
  if (file.size < 300 * 1024) return file

  return new Promise((resolve) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => resolve(file) // si échec, on garde l'original
      img.src = e.target.result
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

// ── VÉRIFICATION IA DE LA CAPTURE DE PAIEMENT ──────────────────
// Convertit un fichier en base64 (sans le préfixe data:...)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Analyse une capture d'écran de paiement avec l'IA pour vérifier :
 * 1. Le montant affiché correspond au montant attendu
 * 2. La référence donnée apparaît dans le texte de la capture
 * 3. L'image ressemble à une vraie interface Mobile Money (MTN/Celtiis)
 *
 * Retourne { valid: boolean, reason: string }
 * En cas d'erreur technique (API indisponible etc.), on ne bloque pas
 * l'utilisateur : valid passe à true avec une raison explicite, pour ne
 * pas pénaliser un vrai client à cause d'un souci technique de notre côté.
 */
export async function verifyPaymentScreenshot(file, { amount, reference, reseau }) {
  try {
    const base64 = await fileToBase64(file)
    const mediaType = file.type || 'image/jpeg'

    const prompt = `Tu vérifies une capture d'écran de paiement Mobile Money pour une plateforme immobilière béninoise.

Informations attendues :
- Réseau : ${reseau === 'mtn' ? 'MTN Mobile Money' : 'Celtiis Money'}
- Montant attendu : ${amount} FCFA
- Référence/motif attendu : ${reference}

Analyse l'image et réponds UNIQUEMENT avec un objet JSON (sans markdown, sans texte autour), au format exact :
{"valid": true ou false, "reason": "explication courte en français"}

Règles de validation :
- valid=true seulement si l'image montre clairement une confirmation de transaction Mobile Money avec un montant correspondant approximativement à ${amount} FCFA
- Si la référence "${reference}" est visible dans l'image, c'est un bon signe supplémentaire
- valid=false si l'image n'a rien à voir avec un paiement (photo random, autre contenu), ou si le montant affiché est clairement différent
- Sois raisonnable : les captures réelles peuvent avoir des formats différents selon les téléphones`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    const data = await response.json()
    const text = data?.content?.[0]?.text || ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      valid: !!parsed.valid,
      reason: parsed.reason || (parsed.valid ? 'Paiement validé par l\'IA' : 'Capture non reconnue comme un paiement valide'),
    }
  } catch (e) {
    console.error('verifyPaymentScreenshot error:', e)
    // En cas de souci technique, on laisse passer plutôt que bloquer un vrai client
    return { valid: true, reason: 'Vérification automatique indisponible — validé par défaut' }
  }
}

// ── ANNONCES ──────────────────────────────────────────────────
const PAGE_SIZE = 24 // nombre d'annonces chargées par page

export async function fetchListings(page = 0) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, error, count } = await supabase
    .from('listings')
    .select('*, listing_photos(url, position)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) { console.error(error); return { listings: [], hasMore: false, total: 0 } }

  const listings = data.map(l => ({
    ...l,
    photos: (l.listing_photos || []).sort((a,b)=>a.position-b.position).map(p=>p.url),
  }))

  const total = count || 0
  const hasMore = to + 1 < total

  return { listings, hasMore, total }
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
  // Compression avant envoi : accélère l'upload et le chargement du site
  const compressed = await compressImage(file, 1280, 0.75)
  const cleanName = safeFileName((file.name || 'photo.jpg').replace(/\.[^.]+$/, '.jpg'))
  const fileName = `${listingId}/${Date.now()}-${cleanName}`

  const { error: uploadError } = await supabase.storage
    .from('listing-photos')
    .upload(fileName, compressed, { contentType: 'image/jpeg' })

  if (uploadError) {
    console.error('uploadPhoto error:', uploadError)
    throw new Error(`Échec upload photo: ${uploadError.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('listing-photos')
    .getPublicUrl(fileName)

  const { error: dbError } = await supabase
    .from('listing_photos')
    .insert([{ listing_id: listingId, url: urlData.publicUrl }])
  if (dbError) {
    console.error('listing_photos insert error:', dbError)
    throw new Error(`Échec enregistrement photo: ${dbError.message}`)
  }

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
function safeFileName(name) {
  // Retire les accents, espaces et caractères spéciaux qui font échouer
  // l'upload sur certains téléphones (ex: "IMG 2026-06-20 23.55.jpg")
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-zA-Z0-9._-]/g, '-')                  // espaces/caractères spéciaux
    .replace(/-+/g, '-')
}

export async function uploadPaymentScreenshot(file, reference) {
  // Compression légère : garde une bonne lisibilité pour la vérification
  // tout en évitant les fichiers énormes de 5-8 Mo qui peuvent échouer
  const compressed = await compressImage(file, 1600, 0.85)
  const cleanName = safeFileName(file.name || 'capture.jpg')
  const fileName = `${reference}-${Date.now()}-${cleanName}`

  const { error } = await supabase.storage
    .from('payment-screenshots')
    .upload(fileName, compressed, { contentType: 'image/jpeg' })

  if (error) {
    console.error('uploadPaymentScreenshot error:', error)
    throw new Error(`Échec upload capture: ${error.message}`)
  }

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

  if (error) {
    console.error('recordPayment error:', error)
    throw new Error(`Échec enregistrement paiement: ${error.message}`)
  }
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
