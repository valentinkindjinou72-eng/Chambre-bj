import { useState, useRef, useEffect } from "react";
import {
  fetchListings, createListing, updateListingStatus, renewListing, deleteListing,
  uploadPhoto, replaceListingPhotos,
  uploadPaymentScreenshot, recordPayment, verifyPaymentScreenshot,
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
.modal-ref{background:${LIGHT};border:1.5px solid ${BORDER};border-radius:8px;padding:.48rem .75rem;font-size:.77rem;display:flex;justify-content:space-between;align-items:center;margin-bottom:.82rem;}
.modal-ref-label{color:${MID};font-size:.68rem;}
.modal-ref-val{font-weight:700;font-family:monospace;font-size:.88rem;color:${DARK};letter-spacing:.05em;}
.modal-confirm-btn{width:100%;background:${GREEN};color:white;border:none;padding:.78rem;border-radius:10px;font-size:.88rem;font-weight:800;cursor:pointer;transition:opacity .15s;}
.modal-confirm-btn:hover{opacity:.88;}
.modal-confirm-btn:disabled{opacity:.6;cursor:not-allowed;}
.modal-cancel{width:100%;background:none;color:${MID};border:none;padding:.42rem;font-size:.79rem;cursor:pointer;margin-top:.36rem;text-decoration:underline;}

/* ALERT PANEL */
.alert-panel{position:fixed;top:66px;right:1rem;width:330px;background:white;border:1px solid ${BORDER};border-radius:14px;box-shadow:0 10px 36px rgba(0,0,0,.18);z-index:400;overflow:hidden;animation:pop-in .2s ease;}
.alert-panel-header{background:${DARK};color:white;padding:.75rem 1rem;display:flex;align-items:center;justify-content:space-between;}
.alert-panel-title{font-weight:700;font-size:.86rem;}
.alert-close{background:none;border:none;color:white;cursor:pointer;font-size:.95rem;}
.alert-list{max-height:340px;overflow-y:auto;}
.alert-item{padding:.7rem .88rem;border-bottom:1px solid ${BORDER};display:flex;gap:.62rem;align-items:flex-start;}
.alert-item:last-child{border-bottom:none;}
.alert-icon{font-size:1.15rem;flex-shrink:0;margin-top:.05rem;}
.alert-msg{font-size:.79rem;font-weight:600;color:${DARK};margin-bottom:.08rem;}
.alert-sub{font-size:.71rem;color:${MID};}
.alert-action{font-size:.69rem;color:${ACCENT};font-weight:700;cursor:pointer;margin-top:.18rem;text-decoration:underline;}
.alert-empty{padding:1.5rem;text-align:center;color:${MID};font-size:.82rem;}

/* ADMIN */
.admin-panel{flex:1;padding:1.5rem;overflow-y:auto;background:#F8FAFC;}
.admin-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.05rem;flex-wrap:wrap;gap:.55rem;}
.admin-title{font-family:'DM Serif Display',serif;font-size:1.22rem;}
.admin-logout{background:${PURPLE};color:white;border:none;padding:.36rem .88rem;border-radius:8px;font-size:.79rem;font-weight:700;cursor:pointer;}
.admin-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1.05rem;}
.admin-stat{background:white;border-radius:10px;border:1px solid ${BORDER};padding:.78rem;text-align:center;}
.admin-stat-n{font-family:'DM Serif Display',serif;font-size:1.45rem;}
.admin-stat-l{font-size:.66rem;color:${MID};text-transform:uppercase;letter-spacing:.04em;}
.admin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:.88rem;}
.admin-card{background:white;border-radius:12px;border:1px solid ${BORDER};padding:.88rem;position:relative;}
.admin-card.occ-card{border-color:#FCA5A5;background:#FFF8F8;}
.admin-card.exp-occ-card{border-color:#FDE68A;background:#FFFDF0;}
.admin-card.expiring-pub-card{border-color:${ORANGE};border-width:2px;}
.admin-card-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:.42rem;}
.admin-card-title{font-weight:700;font-size:.84rem;line-height:1.3;}
.admin-card-loc{font-size:.72rem;color:${MID};margin-top:.08rem;}
.admin-card-meta{font-size:.72rem;color:${MID};margin-bottom:.52rem;display:flex;flex-wrap:wrap;gap:.45rem;}
.admin-btns{display:flex;gap:.35rem;flex-wrap:wrap;}
.admin-btn{padding:.26rem .6rem;border-radius:20px;border:1.5px solid;font-size:.69rem;font-weight:700;cursor:pointer;background:white;transition:all .15s;}
.admin-btn.avail{border-color:${GREEN};color:${GREEN};}
.admin-btn.avail:hover{background:${GREEN};color:white;}
.admin-btn.occ{border-color:${RED};color:${RED};}
.admin-btn.occ:hover{background:${RED};color:white;}
.admin-btn.del{border-color:${DARK};color:${DARK};}
.admin-btn.del:hover{background:${DARK};color:white;}
.admin-btn.renew{border-color:${ORANGE};color:${ORANGE};}
.admin-btn.renew:hover{background:${ORANGE};color:white;}
.admin-tag{font-size:.69rem;padding:.17rem .52rem;border-radius:20px;margin:.32rem .25rem 0 0;display:inline-block;}
.admin-tag.orange{color:#92400E;background:#FEF3C7;}
.admin-tag.red{color:#991B1B;background:#FEE2E2;}
.admin-tag.blue{color:#1e40af;background:#DBEAFE;}
.admin-login{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:3rem 1rem;}
.admin-login-box{background:white;border-radius:16px;padding:2rem;max-width:320px;width:100%;border:1px solid ${BORDER};box-shadow:0 4px 20px rgba(0,0,0,.08);}
.admin-login-title{font-family:'DM Serif Display',serif;font-size:1.32rem;text-align:center;margin-bottom:.38rem;}
.admin-login-sub{font-size:.79rem;color:${MID};text-align:center;margin-bottom:1.25rem;}
.admin-login-input{width:100%;border:1.5px solid ${BORDER};border-radius:8px;padding:.58rem .82rem;font-size:.88rem;font-family:'Inter',sans-serif;outline:none;margin-bottom:.88rem;}
.admin-login-input:focus{border-color:${PURPLE};}
.admin-login-btn{width:100%;background:${PURPLE};color:white;border:none;padding:.72rem;border-radius:8px;font-size:.88rem;font-weight:700;cursor:pointer;}
.admin-login-err{color:${RED};font-size:.76rem;text-align:center;margin-top:.42rem;}
.admin-demo{font-size:.71rem;color:${MID};text-align:center;margin-top:.62rem;}
.edit-photos-notice{background:#F3E8FF;border:1.5px solid #C4B5FD;border-radius:8px;padding:.72rem;font-size:.79rem;color:#4C1D95;margin-bottom:.95rem;}

/* UTILS */
.spin{display:inline-block;animation:spin 1s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
.toast{position:fixed;bottom:1.5rem;right:1.5rem;color:white;padding:.72rem 1.05rem;border-radius:10px;font-size:.83rem;font-weight:600;box-shadow:0 4px 18px rgba(0,0,0,.22);z-index:999;animation:slide-in .3s ease;max-width:300px;}
.toast.green{background:${GREEN};} .toast.red{background:${RED};} .toast.orange{background:${ORANGE};} .toast.purple{background:${PURPLE};}
@keyframes slide-in{from{transform:translateY(16px);opacity:0;}to{transform:translateY(0);opacity:1;}}
.empty-state{text-align:center;padding:3rem 2rem;color:${MID};}
.empty-icon{font-size:2.7rem;margin-bottom:.75rem;}
.empty-state h3{font-family:'DM Serif Display',serif;font-size:1.12rem;color:${DARK};margin-bottom:.32rem;}
@media(max-width:768px){.main{flex-direction:column;}.admin-stats{grid-template-columns:1fr 1fr;}.stats{gap:0;}.stat{padding:.7rem 1rem;}.hero{padding:2rem 1rem 1.75rem;}}
`;

// ── Payment Modal ─────────────────────────────────────────────────
function PaymentModal({ title, subtitle, amount, onConfirm, onCancel, loading, children }) {
  const [sel, setSel]           = useState(null);
  const [ref]                   = useState(genRef);
  const [screenshot, setScreenshot] = useState(null);   // base64 preview
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [revealNum, setRevealNum] = useState(false);
  const [copied, setCopied]     = useState(false);
  const ssRef = useRef();

  const marchand = sel ? MARCHANDS[sel] : null;

  const handleScreenshot = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setScreenshotFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target.result);
    reader.readAsDataURL(f);
  };

  const copyNumero = () => {
    if (!marchand?.numero) return;
    navigator.clipboard?.writeText(marchand.numero).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false), 2000);
  };

  const canConfirm = sel && screenshot && !loading;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxHeight:"90vh",overflowY:"auto"}}>
        <div className="modal-icon">💳</div>
        <div className="modal-title">{title}</div>
        <div className="modal-sub">{subtitle}</div>
        {children}

        {/* AMOUNT */}
        <div className="modal-amount">
          <div className="modal-amount-label">Montant à payer</div>
          <div className="modal-amount-val">{amount.toLocaleString()} <span className="modal-amount-cur">FCFA</span></div>
        </div>

        {/* STEP 1 — Choisir réseau */}
        <div style={{marginBottom:".9rem"}}>
          <div style={{fontSize:".72rem",fontWeight:700,color:MID,textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>
            Choisissez votre réseau
          </div>
          <div className="pay-methods">
            {Object.entries(MARCHANDS).map(([key, m]) => (
              <div key={key}
                className={`pay-method${sel===key?" selected":""}`}
                onClick={()=>{setSel(key);setRevealNum(false);}}>
                <div className="pay-method-logo">{m.logo}</div>
                <div className="pay-method-name">{m.reseau}</div>
                <div className="pay-method-num" style={{fontWeight:700,color:DARK,fontSize:".72rem",marginTop:".25rem"}}>{m.nom}</div>
              </div>
            ))}
          </div>
        </div>

        {/* STEP 2 — Instructions de paiement */}
        {marchand && (
          <div style={{marginBottom:".9rem"}}>
            <div style={{fontSize:".72rem",fontWeight:700,color:MID,textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>
              Instructions de paiement
            </div>
            <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:"10px",padding:".85rem",marginBottom:".65rem"}}>

              {marchand.type === "ussd" ? (
                /* ── USSD CODE BOX (MTN) ── */
                <div style={{background:marchand.couleur,borderRadius:"8px",padding:".6rem .9rem",marginBottom:".7rem",textAlign:"center"}}>
                  <div style={{fontSize:".68rem",color:"rgba(0,0,0,.6)",fontWeight:600,marginBottom:".15rem"}}>Code USSD à composer</div>
                  <div style={{fontSize:"1.4rem",fontWeight:800,color:"#000",letterSpacing:".05em",fontFamily:"monospace"}}>{marchand.ussd}</div>
                  <div style={{fontSize:".7rem",color:"rgba(0,0,0,.65)",marginTop:".1rem"}}>{marchand.nom}</div>
                </div>
              ) : (
                /* ── MASKED NUMBER BOX with reveal/copy (Celtiis) ── */
                <div style={{background:marchand.couleur,borderRadius:"8px",padding:".6rem .9rem",marginBottom:".7rem",textAlign:"center"}}>
                  <div style={{fontSize:".68rem",color:"rgba(255,255,255,.75)",fontWeight:600,marginBottom:".15rem"}}>Numéro de dépôt Celtiis Money</div>
                  <div style={{fontSize:"1.25rem",fontWeight:800,color:"#fff",letterSpacing:".05em",fontFamily:"monospace"}}>
                    {revealNum ? marchand.numero : maskPhone(marchand.numero)}
                  </div>
                  <div style={{fontSize:".7rem",color:"rgba(255,255,255,.8)",marginTop:".1rem"}}>{marchand.nom}</div>
                  <div style={{display:"flex",gap:".4rem",justifyContent:"center",marginTop:".55rem"}}>
                    <button onClick={()=>setRevealNum(v=>!v)}
                      style={{background:"rgba(255,255,255,.18)",color:"#fff",border:"1px solid rgba(255,255,255,.4)",borderRadius:"20px",padding:".25rem .7rem",fontSize:".7rem",fontWeight:700,cursor:"pointer"}}>
                      {revealNum ? "🙈 Masquer" : "👁 Révéler"}
                    </button>
                    {revealNum && (
                      <button onClick={copyNumero}
                        style={{background:"rgba(255,255,255,.18)",color:"#fff",border:"1px solid rgba(255,255,255,.4)",borderRadius:"20px",padding:".25rem .7rem",fontSize:".7rem",fontWeight:700,cursor:"pointer"}}>
                        {copied ? "✅ Copié" : "📋 Copier"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Steps */}
              <div style={{display:"flex",flexDirection:"column",gap:".32rem"}}>
                {marchand.instructions(amount, ref).map((line, i) => (
                  <div key={i} style={{fontSize:".78rem",color:"#92400E",lineHeight:1.4}}>{line}</div>
                ))}
              </div>
            </div>
            {/* Reference */}
            <div className="modal-ref" style={{marginBottom:".65rem"}}>
              <div>
                <div className="modal-ref-label">Votre référence de paiement</div>
                <div className="modal-ref-val">{ref}</div>
              </div>
              <button style={{background:"none",border:"none",cursor:"pointer",fontSize:"1.1rem"}}
                onClick={()=>navigator.clipboard?.writeText(ref).catch(()=>{})}
                title="Copier">📋</button>
            </div>
          </div>
        )}

        {/* STEP 3 — Upload capture d'écran */}
        {marchand && (
          <div style={{marginBottom:".85rem"}}>
            <div style={{fontSize:".72rem",fontWeight:700,color:MID,textTransform:"uppercase",letterSpacing:".05em",marginBottom:".45rem"}}>
              📎 Capture d'écran du paiement <span style={{color:RED}}>*</span>
            </div>
            {screenshot ? (
              <div style={{position:"relative",borderRadius:"10px",overflow:"hidden",border:`2px solid ${GREEN}`,marginBottom:".35rem"}}>
                <img src={screenshot} alt="capture" style={{width:"100%",maxHeight:"160px",objectFit:"cover",display:"block"}}/>
                <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.35)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{background:GREEN,color:"white",borderRadius:"20px",padding:".3rem .9rem",fontSize:".78rem",fontWeight:700}}>✅ Capture reçue</div>
                </div>
                <button onClick={()=>{setScreenshot(null);setScreenshotFile(null);}}
                  style={{position:"absolute",top:"6px",right:"6px",background:"rgba(0,0,0,.65)",color:"white",border:"none",borderRadius:"50%",width:"22px",height:"22px",cursor:"pointer",fontSize:".65rem",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
              </div>
            ) : (
              <div onClick={()=>ssRef.current.click()}
                style={{border:`2px dashed ${BORDER}`,borderRadius:"10px",padding:"1.1rem",textAlign:"center",cursor:"pointer",background:LIGHT,transition:"all .2s"}}
                onMouseOver={e=>e.currentTarget.style.borderColor=ACCENT}
                onMouseOut={e=>e.currentTarget.style.borderColor=BORDER}>
                <div style={{fontSize:"1.8rem",marginBottom:".3rem"}}>📸</div>
                <div style={{fontSize:".78rem",color:MID}}><strong style={{color:ACCENT}}>Cliquez</strong> pour uploader votre capture d'écran</div>
                <div style={{fontSize:".7rem",color:MID,marginTop:".2rem"}}>JPG, PNG · Max 5 Mo</div>
              </div>
            )}
            <input ref={ssRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleScreenshot}/>
            {!screenshot && (
              <div style={{fontSize:".72rem",color:RED,marginTop:".3rem"}}>⚠️ La capture d'écran est obligatoire pour valider le paiement</div>
            )}
          </div>
        )}

        <button className="modal-confirm-btn" disabled={!canConfirm} onClick={()=>onConfirm(ref, sel, screenshotFile)}>
          {loading ? "⏳ Validation en cours..." : screenshot ? "✅ Confirmer le paiement" : "📸 Uploadez d'abord votre capture"}
        </button>
        <button className="modal-cancel" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// ── Share Modal ───────────────────────────────────────────────────
function ShareModal({ listing, onClose }) {
  const [copied, setCopied] = useState(false);
  const url = `https://chambre.bj/annonce/${listing.id}`;
  const text = encodeURIComponent(`🏠 ${listing.title} — ${listing.price.toLocaleString()} FCFA/mois à ${listing.quartier?listing.quartier+", ":""}${listing.ville}\n${url}`);
  const nets = [
    { label:"Facebook", cls:"#1877F2", icon:"📘", link:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label:"TikTok",   cls:"#000",    icon:"🎵", link:`https://www.tiktok.com/share?url=${encodeURIComponent(url)}` },
    { label:"WhatsApp", cls:"#25D366", icon:"💬", link:`https://wa.me/?text=${text}` },
    { label:"X/Twitter",cls:"#000",    icon:"🐦", link:`https://twitter.com/intent/tweet?text=${text}` },
    { label:"SMS",      cls:"#F59E0B", icon:"📱", link:`sms:?body=${text}` },
  ];
  const copy=()=>{navigator.clipboard?.writeText(url).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e=>e.stopPropagation()}>
        <div className="share-handle"/>
        <div className="share-title">Partager cette annonce</div>
        <div className="share-sub">🏠 {listing.title} — {listing.price.toLocaleString()} FCFA/mois</div>
        <div className="share-link-box">
          <div className="share-link-url">{url}</div>
          <button className="share-copy-btn" onClick={copy}>{copied?"✅ Copié !":"Copier"}</button>
        </div>
        <div className="share-networks">
          {nets.map(n=>(
            <div key={n.label} className="share-net" onClick={()=>window.open(n.link,"_blank")}>
              <div className="share-net-icon" style={{background:n.cls,color:"white",fontSize:"1.3rem"}}>{n.icon}</div>
              <div className="share-net-label">{n.label}</div>
            </div>
          ))}
        </div>
        <button className="share-close" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

// ── ValidityBar component ────────────────────────────────────────
function ValidityBar({ publishedAt, renewedAt }) {
  const base    = renewedAt || publishedAt;
  const elapsed = daysAgo(base);
  const left    = daysLeft(base, JOURS_ANNONCE);
  const pct     = Math.max(0, Math.min(100, (elapsed / JOURS_ANNONCE) * 100));
  const cls     = left > 10 ? "ok" : left > 5 ? "warn" : "danger";
  return (
    <div className="validity-bar-wrap">
      <div className={`validity-bar-label ${left<=10?"warn":"ok"}`}>
        <span>⏱ Validité annonce</span>
        <strong>{left > 0 ? `${left} jour${left>1?"s":""} restant${left>1?"s":""}` : "Expirée"}</strong>
      </div>
      <div className="validity-track"><div className="validity-fill" style={{width:`${100-pct}%`}} /></div>
    </div>
  );
}

// ── SAMPLE DATA ──────────────────────────────────────────────────
const SAMPLE = [
  { id:1, title:"Appartement climatisé résidence haut standing", type:"Appartement", price:150000, ville:"Cotonou", quartier:"Cadjehoun", phone:"67000001", rooms:3, surface:85, photos:[], aiGenerated:false, status:"available", occupiedAt:null, publishedAt:Date.now()-2*86400000, renewedAt:null, alerts:[] },
  { id:2, title:"Maison 4 pièces avec jardin", type:"Maison", price:200000, ville:"Porto-Novo", quartier:"Houinmè", phone:"95000002", rooms:4, surface:120, photos:[], aiGenerated:false, status:"occupied", occupiedAt:Date.now()-6*86400000, publishedAt:Date.now()-10*86400000, renewedAt:null, alerts:[] },
  { id:3, title:"Studio meublé centre-ville", type:"Studio", price:80000, ville:"Cotonou", quartier:"Gbègamey", phone:"97000003", rooms:1, surface:30, photos:[], aiGenerated:false, status:"available", occupiedAt:null, publishedAt:Date.now()-40*86400000, renewedAt:null, alerts:[] },
];

// ── APP ──────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]             = useState("listings");
  const [listings, setListings]     = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [form, setForm]             = useState({title:"",type:"Appartement",price:"",ville:"Cotonou",quartier:"",phone:"",rooms:"",surface:"",description:""});
  const [photos, setPhotos]         = useState([]);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiStatus, setAiStatus]     = useState("");
  const [filterType, setFilterType] = useState("Tous");
  const [filterVille, setFilterVille]   = useState("Toutes");
  const [filterQuartier, setFilterQuartier] = useState("");
  const [filterStatus, setFilterStatus] = useState("Tous");
  const [search, setSearch]         = useState("");
  const [toast, setToast]           = useState({msg:"",type:"green"});
  const [dragging, setDragging]     = useState(false);
  const [showPayModal, setShowPayModal]   = useState(false);
  const [payLoading, setPayLoading]       = useState(false);
  const [pendingListing, setPendingListing] = useState(null);
  const [showContactModal, setShowContactModal] = useState(null);
  const [revealedContacts, setRevealedContacts] = useState({});
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [adminLogged, setAdminLogged] = useState(false);
  const [adminPass, setAdminPass]     = useState("");
  const [adminErr, setAdminErr]       = useState("");
  const [shareModal, setShareModal]   = useState(null);
  const [editPhotosModal, setEditPhotosModal] = useState(null);
  const [editPhotos, setEditPhotos]   = useState([]);
  const [editDragging, setEditDragging] = useState(false);
  const [renewModal, setRenewModal]   = useState(null); // listing id
  const [page, setPage]               = useState(0);
  const [hasMore, setHasMore]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileRef     = useRef();
  const editFileRef = useRef();

  // ── Helpers ──────────────────────────────────────────────────
  const showToast=(msg,type="green")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:"green"}),3500);};
  const markRead=()=>{
    setListings(prev=>prev.map(l=>({...l,alerts:l.alerts.map(a=>({...a,read:true}))})));
    dbMarkAlertsRead();
  };

  const mapRow = (r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    price: r.price,
    ville: r.ville,
    quartier: r.quartier,
    phone: r.phone,
    rooms: r.rooms,
    surface: r.surface,
    description: r.description,
    aiGenerated: r.ai_generated,
    status: r.status,
    occupiedAt: r.occupied_at ? new Date(r.occupied_at).getTime() : null,
    publishedAt: new Date(r.published_at).getTime(),
    renewedAt: r.renewed_at ? new Date(r.renewed_at).getTime() : null,
    photos: r.photos || [],
    alerts: [],
  });

  // ── Chargement initial depuis Supabase (page 0 seulement) ─────
  useEffect(()=>{
    (async () => {
      setLoadingListings(true);
      const { listings: rows, hasMore: more } = await fetchListings(0);
      setListings(rows.map(mapRow));
      setHasMore(more);
      setPage(0);
      setLoadingListings(false);
    })();
  }, []);

  // ── Charger la page suivante (bouton "Voir plus") ─────────────
  const loadMore = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    const { listings: rows, hasMore: more } = await fetchListings(nextPage);
    setListings(prev => [...prev, ...rows.map(mapRow)]);
    setHasMore(more);
    setPage(nextPage);
    setLoadingMore(false);
  };

  // ── Auto-expire logic (tick every 5s in demo) ────────────────
  useEffect(()=>{
    const tick=setInterval(()=>{
      setListings(prev=>prev.map(l=>{
        let updated={...l};
        const base=l.renewedAt||l.publishedAt;
        const dPub=daysAgo(base);
        const left=daysLeft(base,JOURS_ANNONCE);

        // 1. Annonce disponible expirée après 45 jours
        if(l.status==="available"&&dPub>=JOURS_ANNONCE&&!l.alerts.find(a=>a.type==="pub-expired")){
          updated={...updated,status:"pub-expired",alerts:[...updated.alerts,{id:genId(),type:"pub-expired",msg:`⏰ Annonce expirée après ${JOURS_ANNONCE} jours. Renouvelez pour ${FRAIS_RENOUVELLEMENT.toLocaleString()} FCFA.`,at:Date.now(),read:false}]};
          updateListingStatus(l.id, "pub-expired");
          createAlert(l.id, "pub-expired", `Annonce expirée après ${JOURS_ANNONCE} jours.`);
        }
        // 2. Alerte J-7 avant expiration publication
        if(l.status==="available"&&left<=7&&left>0&&!l.alerts.find(a=>a.type==="pub-warning")){
          updated={...updated,alerts:[...updated.alerts,{id:genId(),type:"pub-warning",msg:`⚠️ Votre annonce expire dans ${left} jour${left>1?"s":""} ! Renouvelez pour ${FRAIS_RENOUVELLEMENT.toLocaleString()} FCFA.`,at:Date.now(),read:false}]};
        }
        // 3. Bien occupé → retrait après 7 jours
        if(l.status==="occupied"&&l.occupiedAt){
          const dOcc=daysAgo(l.occupiedAt);
          if(dOcc>=JOURS_OCCUPATION){
            updated={...updated,status:"expired",alerts:[...updated.alerts,{id:genId(),type:"occ-expired",msg:`Annonce retirée après ${JOURS_OCCUPATION} jours en statut Occupé.`,at:Date.now(),read:false}]};
            updateListingStatus(l.id, "expired");
            createAlert(l.id, "occ-expired", `Annonce retirée après ${JOURS_OCCUPATION} jours en statut Occupé.`);
          } else if(dOcc>=5&&!updated.alerts.find(a=>a.type==="occ-warning")){
            updated={...updated,alerts:[...updated.alerts,{id:genId(),type:"occ-warning",msg:`⚠️ Retrait automatique dans ${JOURS_OCCUPATION-dOcc} jour${JOURS_OCCUPATION-dOcc>1?"s":""} (occupé).`,at:Date.now(),read:false}]};
          }
        }
        return updated;
      }));
    },5000);
    return()=>clearInterval(tick);
  },[]);

  const allAlerts=listings.flatMap(l=>l.alerts.map(a=>({...a,listing:l})));
  const unread=allAlerts.filter(a=>!a.read).length;

  // ── File handling ─────────────────────────────────────────────
  const handleFiles=(files,setter,cur)=>{
    const np=Array.from(files).slice(0,6-cur.length).map(f=>({file:f,url:URL.createObjectURL(f),base64:null}));
    np.forEach(p=>{const r=new FileReader();r.onload=e=>setter(prev=>{const u=[...prev];const i=u.findIndex(x=>x.url===p.url);if(i!==-1)u[i].base64=e.target.result.split(",")[1];return u;});r.readAsDataURL(p.file);});
    setter(prev=>[...prev,...np]);
  };

  // ── AI ────────────────────────────────────────────────────────
  const analyzeWithAI=async()=>{
    if(!photos.length){setAiStatus("⚠️ Ajoutez au moins une photo.");return;}
    setAiLoading(true);setAiStatus("🔍 Analyse en cours...");
    try{
      const imgs=photos.filter(p=>p.base64).slice(0,3).map(p=>({type:"image",source:{type:"base64",media_type:p.file.type||"image/jpeg",data:p.base64}}));
      const ctx=`Type:${form.type}, Ville:${form.ville}, Quartier:${form.quartier||"?"}, Pièces:${form.rooms||"?"}, Surface:${form.surface||"?"}m²`;
      const prompt=`Expert immobilier au Bénin. Génère une description de location attractive en français (3-4 phrases).\nContexte: ${ctx}\nRéponds UNIQUEMENT avec la description.`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:imgs.length?[...imgs,{type:"text",text:prompt}]:[{type:"text",text:prompt}]}]})});
      const data=await res.json();
      const desc=data.content?.[0]?.text||"";
      if(desc){setForm(f=>({...f,description:desc}));setAiStatus("✅ Description générée !");}
      else setAiStatus("❌ Erreur. Réessayez.");
    }catch{setAiStatus("❌ Erreur de connexion.");}
    setAiLoading(false);
  };

  // ── Publish ───────────────────────────────────────────────────
  const handlePublish=()=>{
    if(!form.title||!form.price||!form.ville||!form.phone){setAiStatus("⚠️ Remplissez : titre, loyer, ville, téléphone.");return;}
    setPendingListing({...form,price:Number(form.price),rooms:Number(form.rooms),surface:Number(form.surface),aiGenerated:aiStatus.includes("✅")});
    setShowPayModal(true);
  };
  const handlePayConfirm=async (ref, reseau, screenshotFile)=>{
    setPayLoading(true);
    try{
      // 0. Vérification IA de la capture de paiement
      if(screenshotFile){
        const check = await verifyPaymentScreenshot(screenshotFile, { amount: FRAIS_ADHESION, reference: ref, reseau });
        if(!check.valid){
          showToast(`❌ Paiement non validé : ${check.reason}`,"red");
          setPayLoading(false);
          return;
        }
      }

      // 1. Créer l'annonce dans Supabase
      const created = await createListing(pendingListing);
      if(!created) throw new Error("Échec création annonce");

      // 2. Uploader les photos liées
      const uploadedUrls = [];
      for(const p of photos){
        const url = await uploadPhoto(p.file, created.id);
        if(url) uploadedUrls.push(url);
      }

      // 3. Enregistrer le paiement
      let screenshotUrl = null;
      if(screenshotFile) screenshotUrl = await uploadPaymentScreenshot(screenshotFile, ref);
      await recordPayment({ listingId: created.id, type:"adhesion", amount:FRAIS_ADHESION, reseau, reference:ref, screenshotUrl });

      // 4. Mettre à jour l'état local
      const newListing = {
        id: created.id, title: created.title, type: created.type, price: created.price,
        ville: created.ville, quartier: created.quartier, phone: created.phone,
        rooms: created.rooms, surface: created.surface, description: created.description,
        aiGenerated: created.ai_generated, status:"available", occupiedAt:null,
        publishedAt: new Date(created.published_at).getTime(), renewedAt:null,
        photos: uploadedUrls, alerts:[],
      };
      setListings(prev=>[newListing,...prev]);
      setForm({title:"",type:"Appartement",price:"",ville:"Cotonou",quartier:"",phone:"",rooms:"",surface:"",description:""});
      setPhotos([]);setAiStatus("");setPendingListing(null);
      setShowPayModal(false);setView("listings");
      showToast(`✅ Annonce publiée ! Valable ${JOURS_ANNONCE} jours. Réf: ${ref}`);
    }catch(e){
      console.error(e);
      showToast(`❌ ${e.message || "Erreur lors de la publication."}`,"red");
    }
    setPayLoading(false);
  };

  // ── Renouvellement ────────────────────────────────────────────
  const handleRenewConfirm=async (ref, reseau, screenshotFile)=>{
    setPayLoading(true);
    try{
      // 0. Vérification IA de la capture de paiement
      if(screenshotFile){
        const check = await verifyPaymentScreenshot(screenshotFile, { amount: FRAIS_RENOUVELLEMENT, reference: ref, reseau });
        if(!check.valid){
          showToast(`❌ Paiement non validé : ${check.reason}`,"red");
          setPayLoading(false);
          return;
        }
      }

      await renewListing(renewModal);
      let screenshotUrl = null;
      if(screenshotFile) screenshotUrl = await uploadPaymentScreenshot(screenshotFile, ref);
      await recordPayment({ listingId: renewModal, type:"renouvellement", amount:FRAIS_RENOUVELLEMENT, reseau, reference:ref, screenshotUrl });
      await createAlert(renewModal, "renewed", `Annonce renouvelée pour ${JOURS_ANNONCE} jours.`);

      setListings(prev=>prev.map(l=>{
        if(l.id!==renewModal) return l;
        return{...l,status:"available",renewedAt:Date.now(),alerts:[...l.alerts,{id:genId(),type:"renewed",msg:`🔄 Annonce renouvelée pour ${JOURS_ANNONCE} jours. Réf: ${ref}`,at:Date.now(),read:false}]};
      }));
      setRenewModal(null);
      showToast(`🔄 Annonce renouvelée pour ${JOURS_ANNONCE} jours !`,"green");
    }catch(e){
      console.error(e);
      showToast(`❌ ${e.message || "Erreur lors du renouvellement."}`,"red");
    }
    setPayLoading(false);
  };

  // ── Status toggle ─────────────────────────────────────────────
  const toggleStatus=async (id,s)=>{
    const occupiedAt = s==="occupied" ? new Date().toISOString() : null;
    await updateListingStatus(id, s, occupiedAt);
    const msg = s==="occupied"?`🔴 Bien occupé. Retrait auto dans ${JOURS_OCCUPATION} jours.`:"🟢 Bien remis disponible.";
    await createAlert(id, s==="occupied"?"now-occupied":"now-available", msg);
    setListings(prev=>prev.map(l=>{
      if(l.id!==id)return l;
      const alert={id:genId(),type:s==="occupied"?"now-occupied":"now-available",msg,at:Date.now(),read:false};
      return{...l,status:s,occupiedAt:s==="occupied"?Date.now():null,alerts:[...l.alerts,alert]};
    }));
    showToast(s==="occupied"?"🔴 Marqué Occupé":"🟢 Remis Disponible",s==="occupied"?"red":"green");
  };

  // ── Edit photos ───────────────────────────────────────────────
  const handleEditPhotosConfirm=async (ref, reseau, screenshotFile)=>{
    setPayLoading(true);
    try{
      // 0. Vérification IA de la capture de paiement
      if(screenshotFile){
        const check = await verifyPaymentScreenshot(screenshotFile, { amount: FRAIS_MODIF_PHOTOS, reference: ref, reseau });
        if(!check.valid){
          showToast(`❌ Paiement non validé : ${check.reason}`,"red");
          setPayLoading(false);
          return;
        }
      }

      const files = editPhotos.map(p=>p.file);
      const newUrls = await replaceListingPhotos(editPhotosModal, files);
      let screenshotUrl = null;
      if(screenshotFile) screenshotUrl = await uploadPaymentScreenshot(screenshotFile, ref);
      await recordPayment({ listingId: editPhotosModal, type:"modif_photos", amount:FRAIS_MODIF_PHOTOS, reseau, reference:ref, screenshotUrl });

      setListings(prev=>prev.map(l=>l.id===editPhotosModal?{...l,photos:newUrls}:l));
      setEditPhotosModal(null);setEditPhotos([]);
      showToast("📸 Photos mises à jour ! Réf: "+ref,"purple");
    }catch(e){
      console.error(e);
      showToast(`❌ ${e.message || "Erreur lors de la mise à jour des photos."}`,"red");
    }
    setPayLoading(false);
  };

  // ── Admin remove ──────────────────────────────────────────────
  const adminRemove=async (id)=>{
    await deleteListing(id);
    setListings(prev=>prev.filter(l=>l.id!==id));
    showToast("🗑️ Annonce supprimée","orange");
  };

  // ── Filters ───────────────────────────────────────────────────
  const visible=listings.filter(l=>l.status!=="expired");
  const filtered=visible.filter(l=>{
    if(filterType!=="Tous"&&l.type!==filterType)return false;
    if(filterVille!=="Toutes"&&l.ville!==filterVille)return false;
    if(filterQuartier&&!(l.quartier||"").toLowerCase().includes(filterQuartier.toLowerCase()))return false;
    if(filterStatus==="Disponible"&&l.status!=="available")return false;
    if(filterStatus==="Occupé"&&l.status!=="occupied")return false;
    if(search&&!`${l.title} ${l.ville} ${l.quartier}`.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
  const types=["Tous",...TYPES];
  const quartiersDisponibles=[...new Set(visible.filter(l=>filterVille==="Toutes"||l.ville===filterVille).map(l=>l.quartier).filter(Boolean))].sort();

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div className="app">
      <style>{CSS}</style>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-logo">Chambre<span>.</span>bj <small>BÉNIN</small></div>
        <div className="nav-tabs">
          <button className={`nav-tab${view==="listings"?" active":""}`} onClick={()=>setView("listings")}>🏠 Annonces</button>
          <button className={`nav-tab${view==="publish"?" active":""}`} onClick={()=>setView("publish")}>＋ Publier</button>
          <button className={`nav-tab admin-tab${view==="admin"?" active":""}`} onClick={()=>setView("admin")}>⚙️ Admin</button>
        </div>
        <div className="nav-right">
          <div className="alert-bell" onClick={()=>{setShowAlertPanel(v=>!v);markRead();}}>
            🔔{unread>0&&<div className="alert-dot">{unread}</div>}
          </div>
          <button className="nav-pub-btn" onClick={()=>setView("publish")}>+ Publier</button>
        </div>
      </nav>

      {/* ALERT PANEL */}
      {showAlertPanel&&(
        <div className="alert-panel">
          <div className="alert-panel-header">
            <span className="alert-panel-title">🔔 Alertes ({allAlerts.length})</span>
            <button className="alert-close" onClick={()=>setShowAlertPanel(false)}>✕</button>
          </div>
          <div className="alert-list">
            {allAlerts.length===0
              ?<div className="alert-empty">Aucune alerte</div>
              :[...allAlerts].reverse().map(a=>(
                <div key={a.id} className="alert-item">
                  <div className="alert-icon">
                    {a.type==="pub-expired"?"⏰":a.type==="pub-warning"?"⚠️":a.type==="renewed"?"🔄":a.type==="occ-expired"?"🗑️":a.type==="occ-warning"?"⚠️":a.type==="now-occupied"?"🔴":"🟢"}
                  </div>
                  <div>
                    <div className="alert-msg">{a.listing.title}</div>
                    <div className="alert-sub">{a.msg}</div>
                    <div className="alert-sub">{a.listing.quartier?`${a.listing.quartier}, `:""}{a.listing.ville}</div>
                    {(a.type==="pub-expired"||a.type==="pub-warning")&&(
                      <div className="alert-action" onClick={()=>{setRenewModal(a.listing.id);setShowAlertPanel(false);}}>
                        → Renouveler pour {FRAIS_RENOUVELLEMENT.toLocaleString()} FCFA
                      </div>
                    )}
                    {a.type==="occ-warning"&&(
                      <div className="alert-action" onClick={()=>{toggleStatus(a.listing.id,"available");setShowAlertPanel(false);}}>
                        → Remettre disponible
                      </div>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* HERO */}
      {view==="listings"&&(
        <>
          <div className="hero">
            <h1>Location immobilière au <em>Bénin</em></h1>
            <p className="hero-sub">Trouvez votre logement idéal · Descriptions générées par IA</p>
            <div className="hero-badges">
              <span className="hero-badge">🤖 Descriptions IA</span>
              <span className="hero-badge">⏱ Validité 45 jours</span>
              <span className="hero-badge">🔄 Renouvellement 1 000 FCFA</span>
              <span className="hero-badge">📲 Partage réseaux sociaux</span>
              <span className="hero-badge">🔔 Alertes temps réel</span>
            </div>
          </div>
          <div className="stats">
            <div className="stat"><div className="stat-n">{visible.length}</div><div className="stat-l">Total</div></div>
            <div className="stat"><div className="stat-n green">{visible.filter(l=>l.status==="available").length}</div><div className="stat-l">Disponibles</div></div>
            <div className="stat"><div className="stat-n red">{visible.filter(l=>l.status==="occupied").length}</div><div className="stat-l">Occupés</div></div>
            <div className="stat"><div className="stat-n orange">{visible.filter(l=>l.status==="pub-expired").length}</div><div className="stat-l">À renouveler</div></div>
            <div className="stat"><div className="stat-n" style={{color:MID}}>{[...new Set(visible.map(l=>l.ville))].length}</div><div className="stat-l">Villes</div></div>
          </div>
          <div className="search-bar">
            <input className="search-input" placeholder="🔍 Rechercher titre, quartier, ville..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="search-select" value={filterVille} onChange={e=>{setFilterVille(e.target.value);setFilterQuartier("");}}>
              <option value="Toutes">📍 Toutes les villes</option>
              {VILLES_BENIN.map(v=><option key={v}>{v}</option>)}
            </select>
            <select className="search-select" value={filterQuartier} onChange={e=>setFilterQuartier(e.target.value)}>
              <option value="">🏘 Tous les quartiers</option>
              {quartiersDisponibles.map(q=><option key={q} value={q}>{q}</option>)}
            </select>
            <select className="search-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="Tous">Tous statuts</option>
              <option value="Disponible">🟢 Disponible</option>
              <option value="Occupé">🔴 Occupé</option>
            </select>
            {(filterVille!=="Toutes"||filterQuartier||filterStatus!=="Tous"||search) && (
              <button className="search-select" style={{cursor:"pointer",color:RED,fontWeight:700,border:`1.5px solid ${RED}`}}
                onClick={()=>{setFilterVille("Toutes");setFilterQuartier("");setFilterStatus("Tous");setSearch("");}}>
                ✕ Réinitialiser
              </button>
            )}
          </div>
        </>
      )}

      <div className="main">

        {/* ── LISTINGS ── */}
        {view==="listings"&&(
          <main className="listings">
            <div className="listings-header">
              <div className="listings-title">Annonces · {filtered.length} résultat{filtered.length>1?"s":""}</div>
              <div className="filter-tabs">
                {types.map(t=><button key={t} className={`tab${filterType===t?" active":""}`} onClick={()=>setFilterType(t)}>{t}</button>)}
              </div>
            </div>
            {filtered.length===0
              ?<div className="empty-state"><div className="empty-icon">🏠</div><h3>Aucun bien trouvé</h3><p>Modifiez vos filtres ou publiez une annonce.</p></div>
              :<div className="grid">
                {filtered.map(l=>{
                  const base=l.renewedAt||l.publishedAt;
                  const left=daysLeft(base,JOURS_ANNONCE);
                  const dOcc=l.occupiedAt?daysAgo(l.occupiedAt):0;
                  const occExpiring=l.status==="occupied"&&dOcc>=5;
                  const pubExpiring=l.status==="available"&&left<=7;
                  const isPubExpired=l.status==="pub-expired";
                  return(
                    <div key={l.id} className={`card${l.status==="occupied"?" occupied":""}${pubExpiring?" expiring-publish":""}`}>
                      {/* RIBBON */}
                      <div className={`card-ribbon ${isPubExpired?"expired-pub":pubExpiring?"expiring-pub":l.status==="available"?"available":"occupied"}`}>
                        {isPubExpired?"⏰ EXPIRÉ":pubExpiring?`⚠️ ${left}J RESTANT${left>1?"S":""}`:l.status==="available"?"🟢 DISPONIBLE":"🔴 OCCUPÉ"}
                      </div>
                      <div className="card-imgs">
                        {l.photos.length>0?<img src={l.photos[0]} alt={l.title}/>:<div className="card-imgs-placeholder">🏡</div>}
                        <div className="card-type-badge">{l.type}</div>
                        {l.aiGenerated&&<div className="card-ai-badge">✨ IA</div>}
                        {l.photos.length>1&&<div className="card-imgs-count">📷 {l.photos.length}</div>}
                      </div>
                      <div className="card-body">
                        <div className="card-price">{l.price.toLocaleString()} <span>FCFA / mois</span></div>
                        <div className="card-title">{l.title}</div>
                        <div className="card-loc">📍 {l.quartier?`${l.quartier}, `:""}{l.ville}</div>
                        {l.description&&<div className="card-desc">{l.description}</div>}
                        <div className="card-pills">
                          {l.rooms?<span className="pill">🛏 {l.rooms} pièces</span>:null}
                          {l.surface?<span className="pill">📐 {l.surface} m²</span>:null}
                        </div>

                        {/* VALIDITY BAR (available only) */}
                        {(l.status==="available"||isPubExpired)&&(
                          <ValidityBar publishedAt={l.publishedAt} renewedAt={l.renewedAt}/>
                        )}

                        {/* RENEW NOTICE */}
                        {isPubExpired&&(
                          <>
                            <div className="renew-notice">⏰ Cette annonce a expiré après {JOURS_ANNONCE} jours. Renouvelez-la pour la remettre en ligne.</div>
                            <button className="renew-btn" onClick={()=>setRenewModal(l.id)}>
                              🔄 Renouveler · {FRAIS_RENOUVELLEMENT.toLocaleString()} FCFA
                            </button>
                          </>
                        )}

                        {/* EXPIRING RENEW SHORTCUT */}
                        {pubExpiring&&!isPubExpired&&(
                          <div style={{fontSize:".72rem",color:ORANGE,marginTop:".3rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span>⚠️ Expire dans {left} jour{left>1?"s":""}</span>
                            <span style={{cursor:"pointer",fontWeight:700,textDecoration:"underline"}} onClick={()=>setRenewModal(l.id)}>Renouveler</span>
                          </div>
                        )}

                        {/* STATUS TOGGLE */}
                        {!isPubExpired&&(
                          <div className="status-bar">
                            <div>
                              <span className={`status-badge${l.status==="available"?" available":occExpiring?" expiring":" occupied"}`}>
                                {l.status==="available"?"🟢 Disponible":occExpiring?`⚠️ Occupé J+${dOcc}`:"🔴 Occupé"}
                              </span>
                              {occExpiring&&<div style={{fontSize:".66rem",color:"#92400E",marginTop:".18rem"}}>Retrait dans {JOURS_OCCUPATION-dOcc}j</div>}
                            </div>
                            {l.status==="available"
                              ?<button className="toggle-btn to-occupied" onClick={()=>toggleStatus(l.id,"occupied")}>Marquer Occupé</button>
                              :<button className="toggle-btn to-available" onClick={()=>toggleStatus(l.id,"available")}>Remettre Disponible</button>
                            }
                          </div>
                        )}

                        {/* ACTIONS */}
                        <div className="card-actions">
                          <button className="action-btn share" onClick={()=>setShareModal(l)}>📤 Partager</button>
                          <button className="action-btn edit-photos" onClick={()=>{setEditPhotosModal(l.id);setEditPhotos([]);}}>📸 Photos</button>
                        </div>

                        {/* CONTACT */}
                        {revealedContacts[l.id]
                          ?<div className="contact-revealed">📞 +229 {revealedContacts[l.id]}</div>
                          :<button className="action-btn contact" style={{marginTop:".5rem",width:"100%"}} onClick={()=>setShowContactModal(l.id)}>
                            🔒 Voir le contact
                          </button>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            }
            {hasMore && filterType==="Tous" && filterVille==="Toutes" && !filterQuartier && filterStatus==="Tous" && !search && (
              <div style={{textAlign:"center",marginTop:"1.5rem"}}>
                <button className="submit-btn" style={{maxWidth:"260px",margin:"0 auto"}} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <><span className="spin">⚙️</span> Chargement...</> : "Voir plus d'annonces"}
                </button>
              </div>
            )}
          </main>
        )}

        {/* ── PUBLISH ── */}
        {view==="publish"&&(
          <div className="publish-page">
            <div className="publish-inner">
              <div className="form-steps">
                <div className="fstep act"><div className="fstep-num">1</div> Infos</div>
                <div className="fstep-sep"/>
                <div className="fstep act"><div className="fstep-num">2</div> Photos</div>
                <div className="fstep-sep"/>
                <div className="fstep"><div className="fstep-num">3</div> Paiement</div>
              </div>
              <div className="validity-notice">📅 Votre annonce sera valable <strong>{JOURS_ANNONCE} jours</strong> après publication. Renouvellement à {FRAIS_RENOUVELLEMENT.toLocaleString()} FCFA.</div>
              <div className="form-section-title">Publier une annonce</div>
              <div className="form-group">
                <label className="form-label">Titre <span className="req">*</span></label>
                <input className="form-input" placeholder="Ex: Bel appartement climatisé à Cotonou" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Loyer FCFA/mois <span className="req">*</span></label>
                  <input className="form-input" type="number" placeholder="150000" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Ville <span className="req">*</span></label>
                  <select className="form-select" value={form.ville} onChange={e=>setForm(f=>({...f,ville:e.target.value}))}>
                    {VILLES_BENIN.map(v=><option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Quartier</label>
                  <input className="form-input" placeholder="Cadjehoun, Fidjrossè..." value={form.quartier} onChange={e=>setForm(f=>({...f,quartier:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone <span className="req">*</span></label>
                <div className="phone-row">
                  <div className="phone-prefix">🇧🇯 +229</div>
                  <input className="form-input" type="tel" placeholder="67 00 00 00" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Pièces</label>
                  <input className="form-input" type="number" placeholder="3" value={form.rooms} onChange={e=>setForm(f=>({...f,rooms:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Surface (m²)</label>
                  <input className="form-input" type="number" placeholder="80" value={form.surface} onChange={e=>setForm(f=>({...f,surface:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Photos</label>
                <div className={`upload-zone${dragging?" dragging":""}`}
                  onClick={()=>fileRef.current.click()}
                  onDragOver={e=>{e.preventDefault();setDragging(true);}}
                  onDragLeave={()=>setDragging(false)}
                  onDrop={e=>{e.preventDefault();setDragging(false);handleFiles(e.dataTransfer.files,setPhotos,photos);}}>
                  <div className="upload-icon">📸</div>
                  <div className="upload-text"><strong>Cliquez</strong> ou glissez vos photos · Max 6</div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files,setPhotos,photos)}/>
                {photos.length>0&&(
                  <div className="preview-grid">
                    {photos.map(p=>(
                      <div key={p.url} className="preview-img">
                        <img src={p.url} alt="preview"/>
                        <button className="preview-del" onClick={()=>setPhotos(prev=>prev.filter(x=>x.url!==p.url))}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="ai-btn" onClick={analyzeWithAI} disabled={aiLoading}>
                {aiLoading?<><span className="spin">⚙️</span> Analyse IA...</>:"✨ Générer description avec l'IA"}
              </button>
              {aiStatus&&<div className="ai-status">{aiStatus}</div>}
              <div className="form-group" style={{marginTop:".68rem"}}>
                <label className="form-label">Description</label>
                <textarea className="form-textarea" placeholder="Description ou générez-la avec l'IA..." value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={4}/>
              </div>
              <div className="fee-notice">💡 <strong>Frais d'adhésion :</strong> {FRAIS_ADHESION.toLocaleString()} FCFA · Valable {JOURS_ANNONCE} jours · MTN ou Celtiis Bénin</div>
              <button className="submit-btn" onClick={handlePublish}>
                💳 Payer & Publier · {FRAIS_ADHESION.toLocaleString()} FCFA
              </button>
            </div>
          </div>
        )}

        {/* ── ADMIN ── */}
        {view==="admin"&&(
          adminLogged?(
            <div className="admin-panel">
              <div className="admin-header">
                <div className="admin-title">⚙️ Panneau Administrateur</div>
                <button className="admin-logout" onClick={()=>setAdminLogged(false)}>Déconnexion</button>
              </div>
              <div className="admin-stats">
                <div className="admin-stat"><div className="admin-stat-n" style={{color:ACCENT}}>{listings.length}</div><div className="admin-stat-l">Total</div></div>
                <div className="admin-stat"><div className="admin-stat-n" style={{color:GREEN}}>{listings.filter(l=>l.status==="available").length}</div><div className="admin-stat-l">Disponibles</div></div>
                <div className="admin-stat"><div className="admin-stat-n" style={{color:RED}}>{listings.filter(l=>l.status==="occupied").length}</div><div className="admin-stat-l">Occupés</div></div>
                <div className="admin-stat"><div className="admin-stat-n" style={{color:ORANGE}}>{listings.filter(l=>l.status==="pub-expired").length}</div><div className="admin-stat-l">À renouveler</div></div>
              </div>
              <div className="admin-grid">
                {listings.map(l=>{
                  const base=l.renewedAt||l.publishedAt;
                  const left=daysLeft(base,JOURS_ANNONCE);
                  const dOcc=l.occupiedAt?daysAgo(l.occupiedAt):0;
                  const occExp=l.status==="occupied"&&dOcc>=5;
                  const pubExp=l.status==="pub-expired";
                  const pubWarn=l.status==="available"&&left<=7;
                  return(
                    <div key={l.id} className={`admin-card${l.status==="occupied"?" occ-card":""}${occExp?" exp-occ-card":""}${pubWarn?" expiring-pub-card":""}`}>
                      <div className="admin-card-head">
                        <div>
                          <div className="admin-card-title">{l.title}</div>
                          <div className="admin-card-loc">📍 {l.quartier?`${l.quartier}, `:""}{l.ville}</div>
                        </div>
                        <span className={`status-badge${l.status==="available"?" available":l.status==="occupied"?occExp?" expiring":" occupied":" occupied"}`} style={{fontSize:".65rem",whiteSpace:"nowrap",flexShrink:0}}>
                          {pubExp?"⏰ Expiré":pubWarn?`⚠️ ${left}j`:l.status==="available"?"🟢 Dispo":occExp?`⚠️ J+${dOcc}`:"🔴 Occupé"}
                        </span>
                      </div>
                      <div className="admin-card-meta">
                        <span>💰 {l.price.toLocaleString()} FCFA</span>
                        <span>📞 +229 {l.phone}</span>
                        {l.rooms&&<span>🛏 {l.rooms}p</span>}
                        {l.surface&&<span>📐 {l.surface}m²</span>}
                      </div>
                      {!pubExp&&(l.status==="available"||pubWarn)&&(
                        <div style={{marginBottom:".45rem"}}>
                          <div style={{fontSize:".68rem",display:"flex",justifyContent:"space-between",color:pubWarn?ORANGE:GREEN,marginBottom:".2rem"}}>
                            <span>⏱ Validité</span><strong>{left} jour{left>1?"s":""} restant{left>1?"s":""}</strong>
                          </div>
                          <div style={{height:"4px",background:"#E2E8F0",borderRadius:"2px",overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${Math.max(0,(left/JOURS_ANNONCE)*100)}%`,background:pubWarn?ORANGE:GREEN,borderRadius:"2px"}}/>
                          </div>
                        </div>
                      )}
                      {pubExp&&<div className="admin-tag orange">⏰ Annonce expirée — En attente de renouvellement</div>}
                      {occExp&&<div className="admin-tag orange">⚠️ Occupé depuis {dOcc}j — Retrait dans {JOURS_OCCUPATION-dOcc}j</div>}
                      {l.alerts.length>0&&<div className="admin-tag blue">🔔 {l.alerts.slice(-1)[0].msg.substring(0,55)}…</div>}
                      <div style={{height:".42rem"}}/>
                      <div className="admin-btns">
                        {l.status!=="available"&&<button className="admin-btn avail" onClick={()=>toggleStatus(l.id,"available")}>✅ Dispo</button>}
                        {l.status!=="occupied"&&!pubExp&&<button className="admin-btn occ" onClick={()=>toggleStatus(l.id,"occupied")}>🔴 Occupé</button>}
                        {(pubExp||pubWarn)&&<button className="admin-btn renew" onClick={()=>setRenewModal(l.id)}>🔄 Renouveler</button>}
                        <button className="admin-btn" style={{borderColor:PURPLE,color:PURPLE}} onClick={()=>setShareModal(l)}>📤 Partager</button>
                        <button className="admin-btn del" onClick={()=>adminRemove(l.id)}>🗑️ Suppr.</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ):(
            <div className="admin-login">
              <div className="admin-login-box">
                <div style={{fontSize:"2rem",textAlign:"center",marginBottom:".45rem"}}>🔐</div>
                <div className="admin-login-title">Espace Admin</div>
                <div className="admin-login-sub">Entrez le code d'accès pour gérer toutes les publications</div>
                <input className="admin-login-input" type="password" placeholder="Code administrateur..." value={adminPass}
                  onChange={e=>setAdminPass(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"){if(adminPass===ADMIN_CODE){setAdminLogged(true);setAdminErr("");}else setAdminErr("Code incorrect.");}}}/>
                <button className="admin-login-btn" onClick={()=>{if(adminPass===ADMIN_CODE){setAdminLogged(true);setAdminErr("");}else setAdminErr("Code incorrect.");}}>Accéder →</button>
                {adminErr&&<div className="admin-login-err">{adminErr}</div>}
                <div className="admin-demo">Code démo : <strong>ADMIN123</strong></div>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Publication */}
      {showPayModal&&(
        <PaymentModal title="Frais d'adhésion propriétaire" subtitle={`Publication valable ${JOURS_ANNONCE} jours sur Chambre.bj`} amount={FRAIS_ADHESION} loading={payLoading} onConfirm={handlePayConfirm} onCancel={()=>setShowPayModal(false)}/>
      )}

      {/* Renouvellement */}
      {renewModal&&(
        <PaymentModal
          title="Renouveler l'annonce"
          subtitle={`Votre annonce sera remise en ligne pour ${JOURS_ANNONCE} jours supplémentaires`}
          amount={FRAIS_RENOUVELLEMENT}
          loading={payLoading}
          onConfirm={handleRenewConfirm}
          onCancel={()=>setRenewModal(null)}>
          <div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:"8px",padding:".62rem",fontSize:".78rem",color:"#065F46",marginBottom:".95rem",display:"flex",alignItems:"center",gap:".4rem"}}>
            🔄 <span>Après paiement, votre annonce redevient <strong>active pour {JOURS_ANNONCE} jours</strong></span>
          </div>
        </PaymentModal>
      )}

      {/* Contact */}
      {showContactModal&&(
        <PaymentModal title="Accès au contact" subtitle="Débloquez le numéro de téléphone du propriétaire" amount={FRAIS_CONTACT} loading={payLoading}
          onConfirm={async (ref, reseau, screenshotFile)=>{
            setPayLoading(true);
            try{
              // 0. Vérification IA de la capture de paiement
              if(screenshotFile){
                const check = await verifyPaymentScreenshot(screenshotFile, { amount: FRAIS_CONTACT, reference: ref, reseau });
                if(!check.valid){
                  showToast(`❌ Paiement non validé : ${check.reason}`,"red");
                  setPayLoading(false);
                  return;
                }
              }

              let screenshotUrl = null;
              if(screenshotFile) screenshotUrl = await uploadPaymentScreenshot(screenshotFile, ref);
              await recordPayment({ listingId: showContactModal, type:"contact", amount:FRAIS_CONTACT, reseau, reference:ref, screenshotUrl });
              const l=listings.find(x=>x.id===showContactModal);
              setRevealedContacts(p=>({...p,[showContactModal]:l?.phone||"N/A"}));
              setShowContactModal(null);
              showToast("📞 Numéro débloqué !");
            }catch(e){
              console.error(e);
              showToast(`❌ ${e.message || "Erreur. Réessayez."}`,"red");
            }
            setPayLoading(false);
          }}
          onCancel={()=>setShowContactModal(null)}/>
      )}

      {/* Edit photos */}
      {editPhotosModal&&(
        <PaymentModal title="Modifier les photos" subtitle="Payez 500 FCFA puis sélectionnez vos nouvelles photos" amount={FRAIS_MODIF_PHOTOS} loading={payLoading}
          onConfirm={handleEditPhotosConfirm} onCancel={()=>{setEditPhotosModal(null);setEditPhotos([]);}}>
          <div className="edit-photos-notice">📸 Sélectionnez vos nouvelles photos avant de confirmer le paiement.</div>
          <div style={{marginBottom:"1rem"}}>
            <div className={`upload-zone${editDragging?" dragging":""}`}
              onClick={()=>editFileRef.current.click()}
              onDragOver={e=>{e.preventDefault();setEditDragging(true);}}
              onDragLeave={()=>setEditDragging(false)}
              onDrop={e=>{e.preventDefault();setEditDragging(false);handleFiles(e.dataTransfer.files,setEditPhotos,editPhotos);}}>
              <div className="upload-icon">📷</div>
              <div className="upload-text"><strong>Cliquez</strong> pour choisir les nouvelles photos</div>
            </div>
            <input ref={editFileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files,setEditPhotos,editPhotos)}/>
            {editPhotos.length>0&&(
              <div className="preview-grid" style={{marginTop:".48rem"}}>
                {editPhotos.map(p=>(
                  <div key={p.url} className="preview-img">
                    <img src={p.url} alt="new"/>
                    <button className="preview-del" onClick={()=>setEditPhotos(prev=>prev.filter(x=>x.url!==p.url))}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PaymentModal>
      )}

      {/* Share */}
      {shareModal&&<ShareModal listing={shareModal} onClose={()=>setShareModal(null)}/>}

      {toast.msg&&<div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
