import { useState, useRef, useEffect } from "react";
import {
  fetchListings, createListing, updateListingStatus, renewListing, deleteListing,
  uploadPhoto, replaceListingPhotos,
  uploadPaymentScreenshot, recordPayment,
  createAlert, fetchAlerts, markAlertsRead as dbMarkAlertsRead,
} from "./db";

// ── CONSTANTS ────────────────────────────────────────────────────
const ACCENT       = "#9333EA";   // violet vif — couleur principale
const ACCENT_LIGHT = "#F5F0FF";
const PINK          = "#EC4899";  // rose dynamique — accents/CTA
const GREEN        = "#059669";
const RED          = "#DC2626";
const ORANGE       = "#F59E0B";
const PURPLE       = "#7C3AED";   // réservé à l'espace Admin
const DARK         = "#1E1033";
const MID          = "#6B5B7A";
const LIGHT        = "#FBF8FF";
const BORDER       = "#E9DFFA";

const FRAIS_ADHESION      = 2000;
const FRAIS_CONTACT       = 2000;
const FRAIS_MODIF_PHOTOS  = 500;
const FRAIS_RENOUVELLEMENT= 1000;
const ADMIN_CODE          = "ADMIN123";
const JOURS_ANNONCE       = 45;
const JOURS_OCCUPATION    = 7;

function maskPhone(num) {
  // Ex: 0140224627 -> 01 40 ●● ●● 27
  const digits = num.replace(/\D/g,"");
  if (digits.length < 6) return "●●●●●●";
  const start = digits.slice(0,4);
  const end = digits.slice(-2);
  return `${start.slice(0,2)} ${start.slice(2,4)} ●● ●● ${end}`;
}

// ── MARCHANDS (jamais affichés en clair côté public) ────────────
const MARCHANDS = {
  mtn: {
    type:   "ussd",
    nom:    "KIDNAF ET FILS",
    reseau: "MTN MoMo Marchand",
    ussd:   "*880*76337#",
    logo:   "🟡",
    couleur:"#FFCC00",
    instructions: (montant, ref) => [
      `1️⃣  Composez le code USSD : *880*76337#`,
      `2️⃣  Entrez le montant : ${montant.toLocaleString()} FCFA`,
      `3️⃣  Référence / motif  : ${ref}`,
      `4️⃣  Validez et prenez une capture d'écran`,
      `5️⃣  Uploadez la capture ci-dessous pour confirmer`,
    ]
  },
  celtiis: {
    type:    "number",
    nom:     "VALENTINOSHOP",
    reseau:  "Celtiis Marchand",
    numero:  "0140224627",   // jamais affiché en clair — masqué par défaut
    logo:    "🔵",
    couleur: "#0052CC",
    instructions: (montant, ref) => [
      `1️⃣  Ouvrez votre app Celtiis Money`,
      `2️⃣  Envoyez à : ${maskPhone("0140224627")} (révélez le numéro ci-dessous)`,
      `3️⃣  Montant : ${montant.toLocaleString()} FCFA`,
      `4️⃣  Référence / motif  : ${ref}`,
      `5️⃣  Validez et prenez une capture d'écran`,
      `6️⃣  Uploadez la capture ci-dessous pour confirmer`,
    ]
  }
};

const TYPES       = ["Appartement","Maison","Studio","Villa","Loft","Chambre"];
const VILLES_BENIN= ["Cotonou","Porto-Novo","Parakou","Abomey-Calavi","Bohicon","Kandi","Lokossa","Natitingou","Ouidah","Djougou"];

function genRef()     { return "NID-"+Math.random().toString(36).substring(2,8).toUpperCase(); }
function genId()      { return Date.now()+Math.floor(Math.random()*99999); }
function daysAgo(ts)  { return Math.floor((Date.now()-ts)/86400000); }
function daysLeft(ts,total) { return Math.max(0, total - daysAgo(ts)); }

// ── STYLES ────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;background:#F1F5F9;color:#0F172A;}
.app{min-height:100vh;display:flex;flex-direction:column;}

/* NAV */
.nav{background:linear-gradient(90deg,#1E1033 0%,#4C1D95 60%,#9333EA 100%);padding:0 1.5rem;height:62px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;box-shadow:0 2px 12px rgba(147,51,234,.25);}
.nav-logo{font-family:'DM Serif Display',serif;font-size:1.5rem;color:white;letter-spacing:-.5px;}
.nav-logo span{color:#F472B6;}
.nav-logo small{font-family:'Inter',sans-serif;font-size:.65rem;font-weight:600;color:#F472B6;background:rgba(244,114,182,.18);padding:2px 6px;border-radius:20px;margin-left:4px;vertical-align:middle;}
.nav-tabs{display:flex;gap:.2rem;}
.nav-tab{padding:.38rem .85rem;border-radius:8px;font-size:.8rem;font-weight:600;border:none;cursor:pointer;background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);transition:all .15s;}
.nav-tab:hover{background:rgba(255,255,255,.15);color:white;}
.nav-tab.active{background:white;color:#0F172A;}
.nav-tab.admin-tab.active{background:#7C3AED;color:white;}
.nav-right{display:flex;align-items:center;gap:.65rem;}
.alert-bell{position:relative;cursor:pointer;font-size:1.25rem;color:white;}
.alert-dot{position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#EF4444;border-radius:50%;border:2px solid #0F172A;display:flex;align-items:center;justify-content:center;font-size:.55rem;color:white;font-weight:700;}
.nav-pub-btn{background:linear-gradient(135deg,#EC4899,#9333EA);color:white;border:none;padding:.4rem 1rem;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;transition:opacity .15s;}
.nav-pub-btn:hover{opacity:.88;}

/* HERO */
.hero{background:linear-gradient(135deg,#1E1033 0%,#5B21B6 55%,#EC4899 100%);color:white;padding:3rem 2rem 2.5rem;text-align:center;position:relative;overflow:hidden;}
.hero h1{font-family:'DM Serif Display',serif;font-size:clamp(1.8rem,4.5vw,3rem);line-height:1.12;margin-bottom:.65rem;position:relative;}
.hero h1 em{color:#FBCFE8;font-style:italic;}
.hero-sub{color:#E9D5FF;font-size:.95rem;max-width:500px;margin:0 auto 1.5rem;position:relative;}
.hero-badges{display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;position:relative;}
.hero-badge{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:white;padding:.3rem .8rem;border-radius:20px;font-size:.75rem;font-weight:600;backdrop-filter:blur(4px);}

/* STATS */
.stats{background:white;border-bottom:1px solid ${BORDER};display:flex;justify-content:center;gap:0;flex-wrap:wrap;box-shadow:0 1px 4px rgba(0,0,0,.06);}
.stat{text-align:center;padding:.85rem 1.75rem;border-right:1px solid ${BORDER};}
.stat:last-child{border-right:none;}
.stat-n{font-family:'DM Serif Display',serif;font-size:1.45rem;color:${ACCENT};}
.stat-n.green{color:${GREEN};} .stat-n.red{color:${RED};} .stat-n.orange{color:${ORANGE};}
.stat-l{font-size:.67rem;color:${MID};text-transform:uppercase;letter-spacing:.05em;}

/* SEARCH */
.search-bar{background:white;border-bottom:1px solid ${BORDER};padding:.8rem 1.5rem;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;}
.search-input{flex:1;min-width:150px;border:1.5px solid ${BORDER};border-radius:8px;padding:.48rem .8rem;font-size:.86rem;font-family:'Inter',sans-serif;outline:none;color:${DARK};}
.search-input:focus{border-color:${ACCENT};}
.search-select{border:1.5px solid ${BORDER};border-radius:8px;padding:.48rem .7rem;font-size:.82rem;font-family:'Inter',sans-serif;outline:none;color:${DARK};background:white;}
.search-select:focus{border-color:${ACCENT};}

/* MAIN */
.main{display:flex;flex:1;min-height:0;}
.listings{flex:1;padding:1.5rem;overflow-y:auto;}
.listings-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.6rem;}
.listings-title{font-family:'DM Serif Display',serif;font-size:1.15rem;}
.filter-tabs{display:flex;gap:.32rem;flex-wrap:wrap;}
.tab{padding:.27rem .68rem;border-radius:20px;font-size:.74rem;font-weight:600;border:1.5px solid ${BORDER};background:white;cursor:pointer;color:${MID};transition:all .15s;}
.tab.active{background:${ACCENT};color:white;border-color:${ACCENT};}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:1rem;}

/* CARD */
.card{background:white;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};transition:box-shadow .2s,transform .2s;position:relative;}
.card:hover{box-shadow:0 8px 28px rgba(0,0,0,.12);transform:translateY(-3px);}
.card.occupied{border-color:#FCA5A5;}
.card.expiring-publish{border-color:${ORANGE};border-width:2px;}
.card-ribbon{position:absolute;top:0;left:0;color:white;font-size:.64rem;font-weight:700;padding:4px 10px 4px 8px;border-radius:0 0 10px 0;z-index:2;letter-spacing:.04em;}
.card-ribbon.available{background:${GREEN};}
.card-ribbon.occupied{background:${RED};}
.card-ribbon.expiring-pub{background:${ORANGE};}
.card-ribbon.expired-pub{background:#94A3B8;}
.card-imgs{position:relative;height:190px;background:#E2E8F0;overflow:hidden;}
.card-imgs img{width:100%;height:100%;object-fit:cover;transition:transform .3s;}
.card:hover .card-imgs img{transform:scale(1.04);}
.card-imgs-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.8rem;background:linear-gradient(135deg,#F1F5F9,#E2E8F0);}
.card-imgs-count{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.65);color:white;font-size:.68rem;padding:2px 8px;border-radius:20px;}
.card-type-badge{position:absolute;top:32px;left:9px;background:${ACCENT};color:white;font-size:.64rem;font-weight:700;padding:3px 9px;border-radius:20px;text-transform:uppercase;}
.card-ai-badge{position:absolute;top:9px;right:9px;background:linear-gradient(135deg,#EC4899,#9333EA);color:white;font-size:.62rem;font-weight:700;padding:3px 8px;border-radius:20px;}

/* VALIDITY BAR */
.validity-bar-wrap{margin:.6rem 0 .3rem;}
.validity-bar-label{display:flex;justify-content:space-between;font-size:.68rem;color:${MID};margin-bottom:.22rem;}
.validity-bar-label strong{font-weight:700;}
.validity-bar-label.warn{color:${ORANGE};}
.validity-bar-label.ok{color:${GREEN};}
.validity-track{height:5px;background:#E2E8F0;border-radius:3px;overflow:hidden;}
.validity-fill{height:100%;border-radius:3px;transition:width .4s;}
.validity-fill.ok{background:${GREEN};}
.validity-fill.warn{background:${ORANGE};}
.validity-fill.danger{background:${RED};}

/* RENEW BADGE */
.renew-notice{background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:8px;padding:.5rem .7rem;font-size:.75rem;color:#92400E;margin:.45rem 0;display:flex;align-items:center;gap:.45rem;}
.renew-btn{margin-top:.5rem;width:100%;background:${ORANGE};color:white;border:none;border-radius:8px;padding:.5rem;font-size:.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.4rem;transition:opacity .15s;}
.renew-btn:hover{opacity:.88;}

.card-body{padding:.88rem;}
.card-price{font-family:'DM Serif Display',serif;font-size:1.22rem;color:${ACCENT};}
.card-price span{font-family:'Inter',sans-serif;font-size:.73rem;color:${MID};font-weight:400;}
.card-title{font-weight:700;font-size:.89rem;margin:.16rem 0 .1rem;line-height:1.3;}
.card-loc{font-size:.74rem;color:${MID};display:flex;align-items:center;gap:.25rem;margin-bottom:.42rem;}
.card-desc{font-size:.77rem;color:${MID};line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.card-pills{display:flex;gap:.3rem;margin-top:.5rem;flex-wrap:wrap;}
.pill{background:${LIGHT};border:1px solid ${BORDER};border-radius:20px;font-size:.67rem;padding:2px 7px;color:${MID};}

/* STATUS BAR */
.status-bar{display:flex;align-items:center;justify-content:space-between;margin-top:.6rem;padding-top:.6rem;border-top:1px solid ${BORDER};}
.status-badge{display:inline-flex;align-items:center;gap:.3rem;padding:.27rem .68rem;border-radius:20px;font-size:.71rem;font-weight:700;}
.status-badge.available{background:#D1FAE5;color:#065F46;}
.status-badge.occupied{background:#FEE2E2;color:#991B1B;}
.status-badge.expiring{background:#FEF3C7;color:#92400E;}
.toggle-btn{font-size:.69rem;font-weight:700;padding:.26rem .65rem;border-radius:20px;border:1.5px solid;cursor:pointer;transition:all .15s;background:white;}
.toggle-btn.to-occupied{border-color:${RED};color:${RED};}
.toggle-btn.to-occupied:hover{background:${RED};color:white;}
.toggle-btn.to-available{border-color:${GREEN};color:${GREEN};}
.toggle-btn.to-available:hover{background:${GREEN};color:white;}

/* ACTION BUTTONS */
.card-actions{display:flex;gap:.38rem;margin-top:.52rem;flex-wrap:wrap;}
.action-btn{flex:1;min-width:0;padding:.4rem .45rem;border-radius:8px;border:none;font-size:.71rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.28rem;transition:all .15s;}
.action-btn.contact{background:${ORANGE};color:white;}
.action-btn.contact:hover{opacity:.88;}
.action-btn.share{background:#1877F2;color:white;}
.action-btn.share:hover{opacity:.88;}
.action-btn.edit-photos{background:${PURPLE};color:white;}
.action-btn.edit-photos:hover{opacity:.88;}
.contact-revealed{margin-top:.52rem;background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:8px;padding:.48rem .72rem;font-size:.8rem;color:#166534;font-weight:700;display:flex;align-items:center;gap:.4rem;}

/* SHARE MODAL */
.share-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:600;display:flex;align-items:flex-end;justify-content:center;}
.share-modal{background:white;border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:1.5rem 1.5rem 2rem;animation:slide-up .25s ease;}
@keyframes slide-up{from{transform:translateY(100%);}to{transform:translateY(0);}}
.share-handle{width:40px;height:4px;background:${BORDER};border-radius:2px;margin:0 auto .85rem;}
.share-title{font-family:'DM Serif Display',serif;font-size:1.1rem;text-align:center;margin-bottom:.3rem;}
.share-sub{font-size:.77rem;color:${MID};text-align:center;margin-bottom:1rem;}
.share-link-box{background:${LIGHT};border:1.5px solid ${BORDER};border-radius:8px;padding:.55rem .8rem;display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;gap:.45rem;}
.share-link-url{font-size:.74rem;color:${MID};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}
.share-copy-btn{background:${ACCENT};color:white;border:none;border-radius:6px;padding:.28rem .65rem;font-size:.71rem;font-weight:700;cursor:pointer;white-space:nowrap;}
.share-networks{display:grid;grid-template-columns:repeat(5,1fr);gap:.55rem;margin-bottom:.9rem;}
.share-net{display:flex;flex-direction:column;align-items:center;gap:.28rem;cursor:pointer;padding:.45rem;border-radius:10px;transition:background .15s;}
.share-net:hover{background:${LIGHT};}
.share-net-icon{font-size:1.3rem;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.14);}
.share-net-label{font-size:.63rem;font-weight:600;color:${MID};}
.share-close{width:100%;background:${LIGHT};border:1.5px solid ${BORDER};border-radius:10px;padding:.62rem;font-size:.83rem;font-weight:600;cursor:pointer;color:${MID};}

/* PUBLISH */
.publish-page{flex:1;overflow-y:auto;background:${LIGHT};padding:1.5rem;}
.publish-inner{max-width:520px;margin:0 auto;background:white;border-radius:16px;border:1px solid ${BORDER};padding:1.7rem;box-shadow:0 2px 16px rgba(0,0,0,.07);}
.form-steps{display:flex;align-items:center;margin-bottom:1.4rem;}
.fstep{display:flex;align-items:center;gap:.32rem;font-size:.74rem;font-weight:700;color:${MID};}
.fstep.act{color:${ACCENT};}
.fstep-num{width:21px;height:21px;border-radius:50%;background:${BORDER};display:flex;align-items:center;justify-content:center;font-size:.67rem;font-weight:800;}
.fstep.act .fstep-num{background:${ACCENT};color:white;}
.fstep-sep{flex:1;height:2px;background:${BORDER};margin:0 .38rem;}
.form-section-title{font-family:'DM Serif Display',serif;font-size:1.2rem;margin-bottom:.95rem;color:${DARK};}
.form-group{margin-bottom:.76rem;}
.form-label{display:block;font-size:.7rem;font-weight:700;color:${MID};text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem;}
.form-label .req{color:${RED};}
.form-input,.form-select,.form-textarea{width:100%;border:1.5px solid ${BORDER};border-radius:8px;padding:.5rem .78rem;font-size:.86rem;font-family:'Inter',sans-serif;color:${DARK};background:white;transition:border-color .15s;outline:none;}
.form-input:focus,.form-select:focus,.form-textarea:focus{border-color:${ACCENT};}
.form-textarea{resize:vertical;min-height:70px;}
.form-row{display:flex;gap:.58rem;}
.form-row .form-group{flex:1;}
.phone-row{display:flex;gap:.42rem;align-items:center;}
.phone-prefix{background:${LIGHT};border:1.5px solid ${BORDER};border-radius:8px;padding:.5rem .68rem;font-size:.86rem;color:${MID};white-space:nowrap;font-weight:700;}
.upload-zone{border:2px dashed ${BORDER};border-radius:10px;padding:1.05rem;text-align:center;cursor:pointer;transition:all .2s;background:${LIGHT};}
.upload-zone:hover,.upload-zone.dragging{border-color:${ACCENT};background:${ACCENT_LIGHT};}
.upload-icon{font-size:1.6rem;margin-bottom:.28rem;}
.upload-text{font-size:.78rem;color:${MID};}
.upload-text strong{color:${ACCENT};}
.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.38rem;margin-top:.52rem;}
.preview-img{position:relative;aspect-ratio:1;}
.preview-img img{width:100%;height:100%;object-fit:cover;border-radius:6px;}
.preview-del{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.65);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:.58rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.ai-btn{width:100%;background:linear-gradient(135deg,${ACCENT},${PINK});color:white;border:none;padding:.62rem;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;margin-top:.38rem;display:flex;align-items:center;justify-content:center;gap:.42rem;transition:opacity .15s;}
.ai-btn:hover{opacity:.9;}
.ai-btn:disabled{opacity:.6;cursor:not-allowed;}
.ai-status{background:${ACCENT_LIGHT};border:1px solid #BFDBFE;border-radius:8px;padding:.52rem;font-size:.76rem;color:${ACCENT};margin-top:.36rem;}
.fee-notice{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:.62rem;font-size:.76rem;color:#92400E;margin:.52rem 0;}
.validity-notice{background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:.62rem;font-size:.76rem;color:#065F46;margin-bottom:.52rem;display:flex;align-items:center;gap:.45rem;}
.submit-btn{width:100%;background:${GREEN};color:white;border:none;padding:.8rem;border-radius:10px;font-size:.9rem;font-weight:800;cursor:pointer;margin-top:.62rem;transition:opacity .15s;display:flex;align-items:center;justify-content:center;gap:.45rem;}
.submit-btn:hover{opacity:.88;}

/* PAYMENT MODAL */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:500;display:flex;align-items:center;justify-content:center;padding:1rem;}
.modal{background:white;border-radius:18px;width:100%;max-width:410px;padding:1.65rem;box-shadow:0 24px 60px rgba(0,0,0,.28);animation:pop-in .2s ease;}
@keyframes pop-in{from{transform:scale(.92);opacity:0;}to{transform:scale(1);opacity:1;}}
.modal-icon{font-size:2.3rem;text-align:center;margin-bottom:.52rem;}
.modal-title{font-family:'DM Serif Display',serif;font-size:1.2rem;text-align:center;margin-bottom:.28rem;}
.modal-sub{font-size:.79rem;color:${MID};text-align:center;margin-bottom:.95rem;line-height:1.5;}
.modal-amount{background:${ACCENT_LIGHT};border:1.5px solid #BFDBFE;border-radius:10px;padding:.82rem;text-align:center;margin-bottom:.95rem;}
.modal-amount-label{font-size:.7rem;color:${MID};text-transform:uppercase;letter-spacing:.05em;margin-bottom:.1rem;}
.modal-amount-val{font-family:'DM Serif Display',serif;font-size:1.85rem;color:${ACCENT};}
.modal-amount-cur{font-size:.82rem;color:${MID};}
.pay-methods{display:grid;grid-template-columns:1fr 1fr;gap:.58rem;margin-bottom:.95rem;}
.pay-method{border:2px solid ${BORDER};border-radius:10px;padding:.72rem .58rem;text-align:center;cursor:pointer;transition:all .15s;}
.pay-method:hover,.pay-method.selected{border-color:${ACCENT};background:${ACCENT_LIGHT};}
.pay-method-logo{font-size:1.42rem;margin-bottom:.2rem;}
.pay-method-name{font-size:.75rem;font-weight:700;color:${DARK};}
.pay-method-num{font-size:.66rem;color:${MID};margin-top:.07rem;}
.modal-instructions{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:.68rem;font-size:.76rem;color:#92400E;line-height:1.6;margin-bottom:.82rem;}
.modal-ref{ba
