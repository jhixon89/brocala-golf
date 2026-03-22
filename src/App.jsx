import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

// ─── PASTE YOUR FIREBASE CONFIG HERE ────────────────────────────────────────
const firebaseConfig = {
  apiKey: "PASTE_YOUR_apiKey_HERE",
  authDomain: "PASTE_YOUR_authDomain_HERE",
  projectId: "PASTE_YOUR_projectId_HERE",
  storageBucket: "PASTE_YOUR_storageBucket_HERE",
  messagingSenderId: "PASTE_YOUR_messagingSenderId_HERE",
  appId: "PASTE_YOUR_appId_HERE",
};
// ────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const ADMIN_PIN       = "1989";        // ← change this
const ADMIN_NAME      = "John Hixon";
const REIGNING_CHAMP  = "Kevin Pladna";
const EMOJIS          = ["🔥","👏","💀"];

// Default members — loaded into Firebase on first run, then managed from Admin panel
const DEFAULT_MEMBERS = [
  "Chang","Chris Lane","Michael Lane","Zak","Tcarp",
  "Alex Aslani","Tbot","Forge","Jake Savola Finch","Kevin Pladna","John Hixon"
];

const SEED_SCHEDULE = [{
  id:"seed-1", course:"Juliette Falls Golf Course",
  date:"2026-06-07", time:"10:00", notes:"", rsvps:[],
  createdAt: new Date().toISOString(),
}];

const C = {
  bg:"#1e4d26", bgMid:"#1a4422", card:"#163b1e", cardMid:"#12321a",
  green:"#1a4d24", greenLight:"#2a6b34", greenGlow:"#3a8f44", greenBright:"#4db860",
  cream:"#f5f0e8", creamDim:"#c8bfa8", creamMuted:"#8a9e8a",
  gold:"#c9a227", goldLight:"#e8c04a", goldDim:"#7a5f10",
  danger:"#c04040", success:"#2a8a3a", pending:"#1a5a28", pendingLight:"#4db860",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function norm(r) { return r.holes === 9 ? r.score * 2 : r.score; }

function calcHandicap(rounds) {
  if (!rounds.length) return null;
  const diffs = rounds.map(r => {
    const adj = norm(r), cr = parseFloat(r.courseRating)||72, sl = parseFloat(r.slope)||113;
    return (adj - cr) * (113 / sl);
  });
  const recent = diffs.slice(-20);
  const sorted = [...recent].sort((a,b)=>a-b);
  const take   = Math.max(1, Math.min(8, Math.floor(recent.length * 0.4)));
  return (sorted.slice(0,take).reduce((s,v)=>s+v,0)/take*0.96).toFixed(1);
}

function getMostImproved(allRounds, members) {
  let best = { player:null, diff:0 };
  members.forEach(m => {
    const pr = allRounds.filter(r=>r.playerName.trim().toLowerCase()===m.trim().toLowerCase())
      .sort((a,b)=>new Date(a.date)-new Date(b.date));
    if (pr.length < 6) return;
    const sc = pr.map(norm), half = Math.floor(sc.length/2);
    const imp = (sc.slice(0,half).reduce((s,v)=>s+v,0)/half) - (sc.slice(-half).reduce((s,v)=>s+v,0)/half);
    if (imp > best.diff) best = { player:m, diff:imp };
  });
  return best.diff >= 1 ? best : null;
}

function getPlayerStats(playerName, allRounds, members) {
  const key = playerName.trim().toLowerCase();
  const rounds = allRounds.filter(r=>r.playerName.trim().toLowerCase()===key)
    .sort((a,b)=>new Date(a.date)-new Date(b.date));
  if (!rounds.length) return null;
  const scores = rounds.map(norm);
  const avg = scores.reduce((s,v)=>s+v,0)/scores.length;
  const now = new Date();
  const monthlyMap={};
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);monthlyMap[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]=0;}
  rounds.forEach(r=>{const k=r.date.slice(0,7);if(k in monthlyMap)monthlyMap[k]++;});
  const thisYear=now.getFullYear(), cc={}, pc={};
  rounds.forEach(r=>{cc[r.course]=(cc[r.course]||0)+1;pc[r.partnerName]=(pc[r.partnerName]||0)+1;});
  let trend="neutral";
  if(rounds.length>=4){const half=Math.floor(rounds.length/2);const d=(scores.slice(-half).reduce((s,v)=>s+v,0)/half)-(scores.slice(0,half).reduce((s,v)=>s+v,0)/half);if(d<-1.5)trend="improving";else if(d>1.5)trend="declining";}
  const h2h={};
  members.forEach(m=>{
    if(m.trim().toLowerCase()===key) return;
    const mine=allRounds.filter(r=>r.playerName.trim().toLowerCase()===key&&r.partnerName.trim().toLowerCase()===m.trim().toLowerCase());
    const their=allRounds.filter(r=>r.playerName.trim().toLowerCase()===m.trim().toLowerCase()&&r.partnerName.trim().toLowerCase()===key);
    const mx=[]; mine.forEach(my=>{const o=their.find(o=>o.date===my.date&&o.course===my.course);if(o)mx.push({m:norm(my),o:norm(o)});});
    if(mx.length){h2h[m]={wins:mx.filter(x=>x.m<x.o).length,losses:mx.filter(x=>x.m>x.o).length,ties:mx.filter(x=>x.m===x.o).length,total:mx.length};}
  });
  return {rounds,scores,avg,best:Math.min(...scores),worst:Math.max(...scores),trend,
    trendLastFive:scores.slice(-5),monthlyMap,
    roundsThisYear:rounds.filter(r=>new Date(r.date).getFullYear()===thisYear).length,
    roundsLastYear:rounds.filter(r=>new Date(r.date).getFullYear()===thisYear-1).length,
    topCourse:Object.entries(cc).sort((a,b)=>b[1]-a[1])[0],
    topPartner:Object.entries(pc).sort((a,b)=>b[1]-a[1])[0],
    h2h, totalRounds:rounds.length, handicap:calcHandicap(rounds)};
}

function getRankings(rounds, members) {
  const map={};
  members.forEach(m=>{map[m.toLowerCase()]={name:m,rounds:[]};});
  rounds.forEach(r=>{const k=r.playerName.trim().toLowerCase();if(!map[k])map[k]={name:r.playerName.trim(),rounds:[]};map[k].rounds.push(r);});
  return Object.values(map).map(p=>{
    if(!p.rounds.length) return{...p,avg:null,best:null,roundCount:0,handicap:null};
    const ns=p.rounds.map(norm);
    return{...p,avg:ns.reduce((s,v)=>s+v,0)/ns.length,best:Math.min(...ns),roundCount:p.rounds.length,handicap:calcHandicap(p.rounds)};
  }).sort((a,b)=>{
    if(a.avg===null&&b.avg===null){if(a.name===REIGNING_CHAMP)return -1;if(b.name===REIGNING_CHAMP)return 1;return 0;}
    if(a.avg===null)return 1;if(b.avg===null)return -1;return a.avg-b.avg;
  });
}

async function resizeImage(file,maxDim=800,quality=0.72){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        let{width:w,height:h}=img;
        if(w>h){if(w>maxDim){h=h/w*maxDim;w=maxDim;}}else{if(h>maxDim){w=w/h*maxDim;h=maxDim;}}
        const c=document.createElement('canvas');c.width=w;c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality));
      };img.src=e.target.result;
    };reader.readAsDataURL(file);
  });
}

function formatDate(d){return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function formatDateFull(d){return new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});}
function formatTime(t){const[h,m]=t.split(":");return`${+h%12||12}:${m} ${+h>=12?"PM":"AM"}`;}
function formatAgo(ts){const s=Math.floor((Date.now()-new Date(ts))/1000);if(s<60)return"just now";if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;}
function monthLabel(key){const[y,m]=key.split("-");return new Date(+y,+m-1,1).toLocaleDateString("en-US",{month:"short"});}
function initials(n){return n.split(" ").map(x=>x[0]).join("").toUpperCase().slice(0,2);}
function daysUntil(d){const a=new Date(d+"T12:00:00"),b=new Date();b.setHours(0,0,0,0);a.setHours(0,0,0,0);return Math.round((a-b)/864e5);}
const GREENS=["#1a4d24","#1e5c2a","#163d1e","#245e2e","#0f3016","#1d5228","#204f25","#133a1a","#1b4e26","#226030","#112d16"];
function avatarColor(n){let h=0;for(let i=0;i<n.length;i++)h=n.charCodeAt(i)+((h<<5)-h);return GREENS[Math.abs(h)%GREENS.length];}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css=`
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}body{background:#1e4d26}
  input,select,textarea{font-family:'DM Sans',sans-serif}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#4db860;border-radius:2px}
  .rh{transition:all .2s}.rh:hover{transform:translateX(3px);background:rgba(42,107,52,.2)!important;border-color:rgba(77,184,96,.35)!important}
  .bh{transition:all .15s}.bh:hover{filter:brightness(1.12);transform:translateY(-1px)}
  .tl{position:relative}.tl::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#c9a227,#e8c04a);border-radius:1px}
  @keyframes fadeSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fadeSlide .35s ease forwards}
  @keyframes shimmer{0%,100%{opacity:1}50%{opacity:.6}}.sh{animation:shimmer 2.5s ease-in-out infinite}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(77,184,96,.5)}70%{box-shadow:0 0 0 8px rgba(77,184,96,0)}}.pulse{animation:pulse 2s infinite}
  .rsvp-chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin:2px 3px 2px 0;background:rgba(26,77,36,.35);border:1px solid rgba(77,184,96,.3);color:#a8d8b0}
  .emoji-btn{background:rgba(13,32,16,.9);border:1px solid rgba(42,107,52,.3);border-radius:20px;padding:4px 10px;font-size:13px;cursor:pointer;transition:all .15s;color:#c8bfa8;display:inline-flex;align-items:center;gap:5px}
  .emoji-btn:hover{background:rgba(42,107,52,.25);border-color:rgba(77,184,96,.4);transform:scale(1.05)}
  .emoji-btn.active{background:rgba(42,107,52,.35);border-color:rgba(77,184,96,.5);color:#f5f0e8}
  .comment-item{padding:10px 0;border-bottom:1px solid rgba(42,107,52,.1)}.comment-item:last-child{border-bottom:none}
  @keyframes popIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}.pop{animation:popIn .2s ease}
  .member-row{display:flex;align-items:center;gap:10;padding:10px 14px;border-radius:10px;background:rgba(13,32,16,.7);border:1px solid rgba(42,107,52,.2);margin-bottom:8px;transition:all .15s}
  .member-row:hover{border-color:rgba(77,184,96,.3)}
`;

// ── Shared UI ─────────────────────────────────────────────────────────────────
function iStyle(e){return{width:"100%",padding:"11px 14px",borderRadius:10,background:"rgba(5,14,6,.85)",border:e?`1px solid ${C.danger}`:"1px solid rgba(42,107,52,.4)",color:C.cream,fontSize:14,outline:"none"};}
function Field({label,error,children}){return(<div><label style={{display:"block",fontSize:10,color:C.creamMuted,marginBottom:7,letterSpacing:2,textTransform:"uppercase"}}>{label}</label>{children}{error&&<div style={{color:"#e07070",fontSize:11,marginTop:4}}>{error}</div>}</div>);}
function SectionHeader({label,right,action}){return(<div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:18}}><div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:600,color:C.cream}}>{label}</div><div style={{height:1,flex:1,background:`linear-gradient(90deg,rgba(42,107,52,.4),transparent)`}}/>{action&&action}{right&&<div style={{fontSize:11,color:C.creamMuted,letterSpacing:1}}>{right}</div>}</div>);}
function SubHeader({label}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:600,color:C.greenBright,letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>{label}</div>;}
function Empty({msg}){return<div style={{textAlign:"center",padding:"30px 0",color:C.creamMuted,fontSize:13}}>{msg}</div>;}
function StatBox({label,value,sub,highlight}){return(<div style={{background:"rgba(13,32,16,.9)",border:`1px solid ${highlight?"rgba(201,162,39,.3)":"rgba(42,107,52,.25)"}`,borderRadius:12,padding:"14px 16px",flex:1,minWidth:0}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{label}</div><div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:highlight?C.goldLight:C.cream,lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:11,color:C.creamMuted,marginTop:4}}>{sub}</div>}</div>);}

// ── Announcement Banner ───────────────────────────────────────────────────────
function AnnouncementBanner({announcement}){
  const [dismissedAt,setDismissedAt]=useState(null);
  if(!announcement?.text) return null;
  if(dismissedAt===announcement.postedAt) return null;
  const typeStyles={
    info: {bg:"rgba(26,77,36,.18)",border:"rgba(77,184,96,.3)",icon:"📢",color:C.greenBright},
    warning:{bg:"rgba(201,162,39,.12)",border:"rgba(201,162,39,.35)",icon:"⚠️",color:C.goldLight},
    urgent:{bg:"rgba(192,64,64,.14)",border:"rgba(192,64,64,.35)",icon:"🚨",color:"#e07070"},
  };
  const s=typeStyles[announcement.type||"info"];
  return(
    <div style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:14,padding:"14px 16px",marginBottom:24,display:"flex",alignItems:"flex-start",gap:12}}>
      <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{s.icon}</span>
      <div style={{flex:1}}>
        {announcement.title&&<div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color:s.color,letterSpacing:1,marginBottom:4}}>{announcement.title}</div>}
        <div style={{fontSize:14,color:C.cream,lineHeight:1.6}}>{announcement.text}</div>
        <div style={{fontSize:11,color:C.creamMuted,marginTop:5}}>— {ADMIN_NAME} · {formatAgo(announcement.postedAt)}</div>
      </div>
      <button onClick={()=>setDismissedAt(announcement.postedAt)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:16,cursor:"pointer",flexShrink:0,lineHeight:1,paddingTop:2}}>✕</button>
    </div>
  );
}

// ── Round Card ────────────────────────────────────────────────────────────────
function RoundCard({round,isAdmin,rxns,cmts,photo,onReact,onComment,onDeleteComment,onPhotoUpload,onEdit,onDelete,deleteConfirm,onDeleteConfirm,onDeleteCancel}){
  const [showCmts,setShowCmts]=useState(false);
  const [reactEmoji,setReactEmoji]=useState(null);
  const [reactWho,setReactWho]=useState("");
  const [cAuthor,setCAuthor]=useState("");
  const [cText,setCText]=useState("");
  const [imgFull,setImgFull]=useState(false);
  const fileRef=useRef(null);
  const cCount=cmts?.length||0;

  function submitReact(){if(!reactWho)return;onReact(round.id,reactEmoji,reactWho);setReactEmoji(null);setReactWho("");}
  function submitComment(){if(!cText.trim()||!cAuthor)return;onComment(round.id,cAuthor,cText);setCText("");}
  async function handleFile(e){const f=e.target.files[0];if(!f)return;onPhotoUpload(round.id,await resizeImage(f));e.target.value="";}

  return(
    <div style={{background:"rgba(13,32,16,.8)",backdropFilter:"blur(4px)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
      {photo&&(<>
        <img src={photo} alt="round" onClick={()=>setImgFull(true)} style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block",cursor:"pointer",transition:"opacity .2s"}}/>
        {imgFull&&<div onClick={()=>setImgFull(false)} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}><img src={photo} alt="full" className="pop" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12,objectFit:"contain"}}/></div>}
      </>)}
      <div style={{padding:"16px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}>
              <div style={{width:32,height:32,borderRadius:8,background:avatarColor(round.playerName),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(round.playerName)}</div>
              <span style={{fontWeight:600,fontSize:15,color:C.cream}}>{round.playerName}</span>
              <span style={{color:C.creamMuted,fontSize:12}}>w/ {round.partnerName}</span>
            </div>
            <div style={{fontSize:12,color:C.creamDim,lineHeight:1.8}}>
              <span style={{marginRight:10}}>📍 {round.course}</span>
              <span style={{marginRight:10}}>📅 {formatDate(round.date)}</span>
              <span style={{background:"rgba(26,77,36,.4)",border:"1px solid rgba(42,107,52,.35)",borderRadius:4,padding:"1px 7px",fontSize:11,marginRight:8}}>{round.holes}H</span>
              {(round.courseRating||round.slope)&&<span style={{color:C.creamMuted,fontSize:11}}>CR {round.courseRating||72} / SL {round.slope||113}</span>}
            </div>
            {round.notes&&<div style={{fontSize:12,color:C.creamMuted,marginTop:6,fontStyle:"italic",borderLeft:`2px solid ${C.green}`,paddingLeft:10}}>{round.notes}</div>}
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,color:C.goldLight,lineHeight:1}}>{round.score}</div>
            <div style={{fontSize:10,color:C.creamMuted,letterSpacing:1,marginTop:2}}>STROKES</div>
            {round.courseRating&&<div style={{fontSize:10,color:C.creamMuted,marginTop:2}}>DIFF: {((norm(round)-(parseFloat(round.courseRating)||72))*(113/(parseFloat(round.slope)||113))).toFixed(1)}</div>}
          </div>
        </div>
        {/* Action bar */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {EMOJIS.map(e=>{
            const count=rxns?.[e]?.length||0,names=rxns?.[e]||[];
            return(
              <button key={e} className={`emoji-btn${count>0?" active":""}`} onClick={()=>{setReactEmoji(reactEmoji===e?null:e);setReactWho("");}}>
                {e}{count>0&&<span style={{fontSize:11,color:C.goldLight}}>{count}</span>}
                {names.length>0&&<span style={{fontSize:10,color:C.creamMuted,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names.join(", ")}</span>}
              </button>
            );
          })}
          <div style={{flex:1}}/>
          <button className="bh" onClick={()=>setShowCmts(v=>!v)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>💬 {cCount>0?`${cCount} comment${cCount!==1?"s":""}`:"Comment"}</button>
          {!photo&&<><button className="bh" onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer"}}>📷 Add Photo</button><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/></>}
          {isAdmin&&<><button className="bh" onClick={onEdit} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",borderRadius:7,color:C.greenBright,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>EDIT</button><button className="bh" onClick={onDelete} style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.25)",borderRadius:7,color:"#c07070",padding:"4px 10px",fontSize:11,cursor:"pointer"}}>DEL</button></>}
        </div>
        {/* Reaction picker */}
        {reactEmoji&&(
          <div style={{marginTop:10,padding:"10px 12px",background:"rgba(5,14,6,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:14}}>{reactEmoji}</span>
            <select value={reactWho} onChange={e=>setReactWho(e.target.value)} style={{...iStyle(false),flex:1,minWidth:120,padding:"6px 10px",fontSize:13,appearance:"none"}}>
              <option value="">Select name…</option>
            </select>
            <button className="bh" onClick={submitReact} disabled={!reactWho} style={{background:`linear-gradient(135deg,${C.green},${C.greenLight})`,border:"none",borderRadius:8,color:C.cream,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:reactWho?"pointer":"not-allowed",opacity:reactWho?1:.5}}>React</button>
          </div>
        )}
        {deleteConfirm&&(
          <div style={{marginTop:10,padding:"11px 14px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#c07070"}}>Delete this round?</span>
            <div style={{display:"flex",gap:8}}>
              <button className="bh" onClick={onDeleteCancel} style={{background:"rgba(255,255,255,.06)",border:"none",borderRadius:7,color:C.creamMuted,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Cancel</button>
              <button className="bh" onClick={onDeleteConfirm} style={{background:"rgba(192,64,64,.25)",border:"none",borderRadius:7,color:"#e08080",padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>Delete</button>
            </div>
          </div>
        )}
        {/* Comments */}
        {showCmts&&(
          <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid rgba(42,107,52,.15)"}}>
            {cmts?.length===0&&<div style={{fontSize:12,color:C.creamMuted,marginBottom:12}}>No comments yet — start the trash talk 🗑️</div>}
            {cmts?.map(c=>(
              <div key={c.id} className="comment-item" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <div style={{width:22,height:22,borderRadius:6,background:avatarColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(c.author)}</div>
                    <span style={{fontSize:12,fontWeight:600,color:C.cream}}>{c.author}</span>
                    <span style={{fontSize:10,color:C.creamMuted}}>{formatAgo(c.timestamp)}</span>
                  </div>
                  <div style={{fontSize:13,color:C.creamDim,paddingLeft:30,lineHeight:1.5}}>{c.text}</div>
                </div>
                {isAdmin&&<button className="bh" onClick={()=>onDeleteComment(c.id)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:10,cursor:"pointer",flexShrink:0,paddingTop:2}}>✕</button>}
              </div>
            ))}
            <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
              <select value={cAuthor} onChange={e=>setCAuthor(e.target.value)} style={{...iStyle(false),width:"auto",flex:"0 0 140px",padding:"8px 10px",fontSize:13,appearance:"none",cursor:"pointer"}}>
                <option value="">Your name…</option>
              </select>
              <input value={cText} onChange={e=>setCText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitComment();}} placeholder="Say something..." style={{...iStyle(false),flex:1,minWidth:120,padding:"8px 12px",fontSize:13}}/>
              <button className="bh" onClick={submitComment} disabled={!cText.trim()||!cAuthor} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:9,color:"#0a1a0c",padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:cText.trim()&&cAuthor?1:.5}}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── RoundCard with live members injected ──────────────────────────────────────
function RoundCardLive({round,members,isAdmin,rxns,cmts,photo,onReact,onComment,onDeleteComment,onPhotoUpload,onEdit,onDelete,deleteConfirm,onDeleteConfirm,onDeleteCancel}){
  const [showCmts,setShowCmts]=useState(false);
  const [reactEmoji,setReactEmoji]=useState(null);
  const [reactWho,setReactWho]=useState("");
  const [cAuthor,setCAuthor]=useState("");
  const [cText,setCText]=useState("");
  const [imgFull,setImgFull]=useState(false);
  const fileRef=useRef(null);
  const cCount=cmts?.length||0;

  function submitReact(){if(!reactWho)return;onReact(round.id,reactEmoji,reactWho);setReactEmoji(null);setReactWho("");}
  function submitComment(){if(!cText.trim()||!cAuthor)return;onComment(round.id,cAuthor,cText);setCText("");}
  async function handleFile(e){const f=e.target.files[0];if(!f)return;onPhotoUpload(round.id,await resizeImage(f));e.target.value="";}

  return(
    <div style={{background:"rgba(13,32,16,.8)",backdropFilter:"blur(4px)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
      {photo&&(<>
        <img src={photo} alt="round" onClick={()=>setImgFull(true)} style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block",cursor:"pointer"}}/>
        {imgFull&&<div onClick={()=>setImgFull(false)} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}><img src={photo} alt="full" className="pop" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12,objectFit:"contain"}}/></div>}
      </>)}
      <div style={{padding:"16px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}>
              <div style={{width:32,height:32,borderRadius:8,background:avatarColor(round.playerName),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(round.playerName)}</div>
              <span style={{fontWeight:600,fontSize:15,color:C.cream}}>{round.playerName}</span>
              <span style={{color:C.creamMuted,fontSize:12}}>w/ {round.partnerName}</span>
            </div>
            <div style={{fontSize:12,color:C.creamDim,lineHeight:1.8}}>
              <span style={{marginRight:10}}>📍 {round.course}</span>
              <span style={{marginRight:10}}>📅 {formatDate(round.date)}</span>
              <span style={{background:"rgba(26,77,36,.4)",border:"1px solid rgba(42,107,52,.35)",borderRadius:4,padding:"1px 7px",fontSize:11,marginRight:8}}>{round.holes}H</span>
              {(round.courseRating||round.slope)&&<span style={{color:C.creamMuted,fontSize:11}}>CR {round.courseRating||72} / SL {round.slope||113}</span>}
            </div>
            {round.notes&&<div style={{fontSize:12,color:C.creamMuted,marginTop:6,fontStyle:"italic",borderLeft:`2px solid ${C.green}`,paddingLeft:10}}>{round.notes}</div>}
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,color:C.goldLight,lineHeight:1}}>{round.score}</div>
            <div style={{fontSize:10,color:C.creamMuted,letterSpacing:1,marginTop:2}}>STROKES</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {EMOJIS.map(e=>{
            const count=rxns?.[e]?.length||0,names=rxns?.[e]||[];
            return(<button key={e} className={`emoji-btn${count>0?" active":""}`} onClick={()=>{setReactEmoji(reactEmoji===e?null:e);setReactWho("");}}>{e}{count>0&&<span style={{fontSize:11,color:C.goldLight}}>{count}</span>}{names.length>0&&<span style={{fontSize:10,color:C.creamMuted}}>{names.join(", ")}</span>}</button>);
          })}
          <div style={{flex:1}}/>
          <button className="bh" onClick={()=>setShowCmts(v=>!v)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer"}}>💬 {cCount>0?`${cCount} comment${cCount!==1?"s":""}`:"Comment"}</button>
          {!photo&&<><button className="bh" onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer"}}>📷 Photo</button><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/></>}
          {isAdmin&&<><button className="bh" onClick={onEdit} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",borderRadius:7,color:C.greenBright,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>EDIT</button><button className="bh" onClick={onDelete} style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.25)",borderRadius:7,color:"#c07070",padding:"4px 10px",fontSize:11,cursor:"pointer"}}>DEL</button></>}
        </div>
        {reactEmoji&&(
          <div style={{marginTop:10,padding:"10px 12px",background:"rgba(5,14,6,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:14}}>{reactEmoji}</span>
            <select value={reactWho} onChange={e=>setReactWho(e.target.value)} style={{...iStyle(false),flex:1,minWidth:120,padding:"6px 10px",fontSize:13,appearance:"none"}}>
              <option value="">Select name…</option>
              {members.map(m=><option key={m} value={m}>{m}{rxns?.[reactEmoji]?.includes(m)?" (remove)":""}</option>)}
            </select>
            <button className="bh" onClick={submitReact} disabled={!reactWho} style={{background:`linear-gradient(135deg,${C.green},${C.greenLight})`,border:"none",borderRadius:8,color:C.cream,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:reactWho?"pointer":"not-allowed",opacity:reactWho?1:.5}}>{rxns?.[reactEmoji]?.includes(reactWho)?"Remove":"React"}</button>
          </div>
        )}
        {deleteConfirm&&(
          <div style={{marginTop:10,padding:"11px 14px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#c07070"}}>Delete this round?</span>
            <div style={{display:"flex",gap:8}}>
              <button className="bh" onClick={onDeleteCancel} style={{background:"rgba(255,255,255,.06)",border:"none",borderRadius:7,color:C.creamMuted,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Cancel</button>
              <button className="bh" onClick={onDeleteConfirm} style={{background:"rgba(192,64,64,.25)",border:"none",borderRadius:7,color:"#e08080",padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>Delete</button>
            </div>
          </div>
        )}
        {showCmts&&(
          <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid rgba(42,107,52,.15)"}}>
            {cmts?.length===0&&<div style={{fontSize:12,color:C.creamMuted,marginBottom:12}}>No comments yet 🗑️</div>}
            {cmts?.map(c=>(
              <div key={c.id} className="comment-item" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <div style={{width:22,height:22,borderRadius:6,background:avatarColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(c.author)}</div>
                    <span style={{fontSize:12,fontWeight:600,color:C.cream}}>{c.author}</span>
                    <span style={{fontSize:10,color:C.creamMuted}}>{formatAgo(c.timestamp)}</span>
                  </div>
                  <div style={{fontSize:13,color:C.creamDim,paddingLeft:30,lineHeight:1.5}}>{c.text}</div>
                </div>
                {isAdmin&&<button className="bh" onClick={()=>onDeleteComment(c.id)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:10,cursor:"pointer"}}>✕</button>}
              </div>
            ))}
            <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
              <select value={cAuthor} onChange={e=>setCAuthor(e.target.value)} style={{...iStyle(false),width:"auto",flex:"0 0 140px",padding:"8px 10px",fontSize:13,appearance:"none",cursor:"pointer"}}>
                <option value="">Your name…</option>
                {members.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <input value={cText} onChange={e=>setCText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitComment();}} placeholder="Say something..." style={{...iStyle(false),flex:1,minWidth:120,padding:"8px 12px",fontSize:13}}/>
              <button className="bh" onClick={submitComment} disabled={!cText.trim()||!cAuthor} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:9,color:"#0a1a0c",padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:cText.trim()&&cAuthor?1:.5}}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedule Card ─────────────────────────────────────────────────────────────
function ScheduleCard({evt,members,onRsvp,isAdmin,onDelete,onEdit,compact=false}){
  const [rsvpOpen,setRsvpOpen]=useState(false);
  const [who,setWho]=useState("");
  const [delConfirm,setDelConfirm]=useState(false);
  const [removeWho,setRemoveWho]=useState(null);
  const days=daysUntil(evt.date),isPast=days<0;
  const dLabel=days===0?"TODAY":days===1?"TOMORROW":isPast?`${Math.abs(days)}d ago`:`${days} DAYS`;
  const dColor=days<=7&&!isPast?C.goldLight:isPast?C.creamMuted:C.greenBright;
  function doRsvp(){if(!who)return;onRsvp(evt.id,who);setWho("");setRsvpOpen(false);}
  function doRemove(name){onRsvp(evt.id,name,"remove");setRemoveWho(null);}
  return(
    <div style={{background:compact?"rgba(13,32,16,.7)":"rgba(13,32,16,.85)",border:compact?"1px solid rgba(42,107,52,.22)":"1px solid rgba(77,184,96,.25)",borderRadius:compact?12:16,padding:compact?"14px 16px":"20px 22px",marginBottom:compact?8:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:compact?15:17,fontWeight:700,color:C.cream}}>{evt.course}</div>
            {!isPast&&<span style={{fontSize:10,fontWeight:700,letterSpacing:1,background:days<=7?"rgba(201,162,39,.15)":"rgba(26,107,52,.3)",border:days<=7?`1px solid rgba(201,162,39,.35)`:`1px solid rgba(77,184,96,.3)`,borderRadius:4,padding:"2px 8px",color:dColor}}>{dLabel}</span>}
          </div>
          <div style={{fontSize:13,color:C.creamDim,lineHeight:2}}>
            <span style={{marginRight:16}}>📅 {formatDateFull(evt.date)}</span>
            <span>⏰ {formatTime(evt.time)}</span>
          </div>
          {evt.notes&&<div style={{fontSize:12,color:C.creamMuted,marginTop:6,fontStyle:"italic",borderLeft:`2px solid ${C.green}`,paddingLeft:10}}>{evt.notes}</div>}
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,color:C.creamMuted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{evt.rsvps?.length?`${evt.rsvps.length} Going`:"No RSVPs yet"}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:0,alignItems:"center"}}>
              {(evt.rsvps||[]).map(n=>(
                <span key={n} className="rsvp-chip" style={{cursor:isAdmin?"pointer":"default"}} onClick={()=>isAdmin&&setRemoveWho(removeWho===n?null:n)}>{n}{isAdmin&&<span style={{marginLeft:4,opacity:.6,fontSize:10}}>✕</span>}</span>
              ))}
            </div>
            {removeWho&&isAdmin&&(
              <div style={{marginTop:8,padding:"8px 12px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12}}>
                <span style={{color:"#e07070"}}>Remove {removeWho} from RSVPs?</span>
                <div style={{display:"flex",gap:6}}>
                  <button className="bh" onClick={()=>setRemoveWho(null)} style={{background:"rgba(255,255,255,.06)",border:"none",borderRadius:6,color:C.creamMuted,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>No</button>
                  <button className="bh" onClick={()=>doRemove(removeWho)} style={{background:"rgba(192,64,64,.2)",border:"none",borderRadius:6,color:"#e08080",padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>Remove</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
          {!isPast&&(
            <button className="bh" onClick={()=>{setRsvpOpen(v=>!v);setDelConfirm(false);}} style={{background:rsvpOpen?`rgba(42,107,52,.4)`:`linear-gradient(135deg,${C.green},${C.greenLight})`,border:`1px solid rgba(77,184,96,.4)`,borderRadius:9,color:C.cream,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              {rsvpOpen?"↑ Close":"✓ RSVP"}
            </button>
          )}
          {isAdmin&&(
            <div style={{display:"flex",gap:6}}>
              <button className="bh" onClick={()=>{onEdit(evt);setDelConfirm(false);setRsvpOpen(false);}} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",borderRadius:7,color:C.greenBright,padding:"5px 10px",fontSize:10,cursor:"pointer",fontWeight:600}}>EDIT</button>
              <button className="bh" onClick={()=>setDelConfirm(v=>!v)} style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.2)",borderRadius:7,color:"#c07070",padding:"5px 10px",fontSize:10,cursor:"pointer"}}>DEL</button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {delConfirm&&(
        <div style={{marginTop:12,padding:"11px 14px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:"#c07070"}}>Delete this scheduled round?</span>
          <div style={{display:"flex",gap:8}}>
            <button className="bh" onClick={()=>setDelConfirm(false)} style={{background:"rgba(255,255,255,.06)",border:"none",borderRadius:7,color:C.creamMuted,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Cancel</button>
            <button className="bh" onClick={()=>{onDelete(evt.id);setDelConfirm(false);}} style={{background:"rgba(192,64,64,.25)",border:"none",borderRadius:7,color:"#e08080",padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>Delete</button>
          </div>
        </div>
      )}

      {/* RSVP panel */}
      {rsvpOpen&&(
        <div style={{marginTop:14,padding:"14px",background:"rgba(5,14,6,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:12}}>
          <div style={{fontSize:12,color:C.creamDim,marginBottom:10}}>Who's in?</div>
          {members.filter(m=>!(evt.rsvps||[]).includes(m)).length===0?(
            <div style={{fontSize:12,color:C.creamMuted}}>Everyone is already in! 🎉</div>
          ):(
            <div style={{display:"flex",gap:10}}>
              <select value={who} onChange={e=>setWho(e.target.value)} style={{...iStyle(false),appearance:"none",cursor:"pointer",flex:1}}>
                <option value="">Select your name…</option>
                {members.filter(m=>!(evt.rsvps||[]).includes(m)).map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <button className="bh" onClick={doRsvp} disabled={!who} style={{background:who?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:10,color:who?"#0a1a0c":C.creamMuted,padding:"11px 20px",fontSize:13,fontWeight:700,cursor:who?"pointer":"not-allowed",whiteSpace:"nowrap",transition:"all .2s"}}>I'm In ⛳</button>
            </div>
          )}
          {(evt.rsvps||[]).length>0&&<div style={{fontSize:11,color:C.creamMuted,marginTop:8}}>Already in: {(evt.rsvps||[]).join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

// ── Player Profile ─────────────────────────────────────────────────────────────
function PlayerProfile({playerName,allRounds,rankings,members,onBack}){
  const stats=getPlayerStats(playerName,allRounds,members);
  const rank=rankings.findIndex(r=>r.name.trim().toLowerCase()===playerName.trim().toLowerCase());
  const tI={improving:{label:"📈 Improving",color:C.greenBright,bg:"rgba(42,138,58,.15)",border:"rgba(42,138,58,.35)"},declining:{label:"📉 Declining",color:"#e07070",bg:"rgba(192,64,64,.12)",border:"rgba(192,64,64,.3)"},neutral:{label:"➡️ Steady",color:C.creamDim,bg:"rgba(42,107,52,.1)",border:"rgba(42,107,52,.25)"}};
  const trend=tI[stats?.trend||"neutral"];
  const mE=stats?Object.entries(stats.monthlyMap):[];
  const maxM=Math.max(...mE.map(([,v])=>v),1);
  const h2h=stats?Object.entries(stats.h2h):[];
  return(
    <div className="fi">
      <button className="bh" onClick={onBack} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer",letterSpacing:2,marginBottom:16}}>← BACK</button>
      <div style={{background:"linear-gradient(135deg,rgba(26,77,36,.25),rgba(201,162,39,.06))",border:"1px solid rgba(201,162,39,.2)",borderRadius:18,padding:"24px",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:64,height:64,borderRadius:14,background:avatarColor(playerName),display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0,boxShadow:"0 4px 20px rgba(0,0,0,.5)"}}>{initials(playerName)}</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,color:C.cream}}>{playerName}</div>
            <div style={{fontSize:12,color:C.creamMuted,marginTop:4}}>{rank===0&&stats?.totalRounds>0?<span style={{color:C.goldLight}}>👑 #1</span>:rank>=0&&stats?.totalRounds>0?`#${rank+1} on the board`:playerName===REIGNING_CHAMP?<span style={{color:C.goldLight}}>👑 Reigning Champ</span>:"No rounds yet"}</div>
          </div>
          {stats&&<div style={{textAlign:"right"}}><div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,color:C.goldLight}}>{stats.avg.toFixed(1)}</div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1}}>AVG</div>{stats.handicap&&<div style={{fontSize:11,color:C.creamDim,marginTop:3}}>HCP <strong style={{color:C.greenBright}}>{stats.handicap}</strong></div>}</div>}
        </div>
      </div>
      {!stats&&<div style={{textAlign:"center",padding:"40px",color:C.creamMuted}}><div style={{fontSize:32,marginBottom:12}}>🏌️</div>No rounds yet for {playerName}</div>}
      {stats&&(<>
        <div style={{display:"flex",gap:10,marginBottom:12}}><StatBox label="Rounds" value={stats.totalRounds} highlight/><StatBox label="Best" value={stats.best} sub="18H equiv"/><StatBox label="Worst" value={stats.worst} sub="18H equiv"/></div>
        <div style={{display:"flex",gap:10,marginBottom:20}}><StatBox label="This Year" value={stats.roundsThisYear} sub={`${stats.roundsLastYear} last year`}/><StatBox label="Top Course" value={stats.topCourse?stats.topCourse[0]:"—"} sub={stats.topCourse?`${stats.topCourse[1]} rounds`:""}/><StatBox label="Fav Partner" value={stats.topPartner?stats.topPartner[0].split(" ")[0]:"—"} sub={stats.topPartner?`${stats.topPartner[1]} rounds`:""}/></div>
        <div style={{background:trend.bg,border:`1px solid ${trend.border}`,borderRadius:14,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Scoring Trend</div><div style={{fontSize:15,fontWeight:600,color:trend.color}}>{trend.label}</div>{stats.rounds.length<4&&<div style={{fontSize:11,color:C.creamMuted,marginTop:3}}>Need 4+ rounds</div>}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:36}}>{stats.trendLastFive.map((s,i)=>{const mn=Math.min(...stats.trendLastFive),mx=Math.max(...stats.trendLastFive),r=mx-mn||1,h=8+((mx-s)/r)*28;return<div key={i} style={{width:8,borderRadius:3,background:trend.color,opacity:.5+(i*.1),height:`${h}px`}}/>;})}</div>
        </div>
        <div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"18px 20px",marginBottom:20}}>
          <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Rounds Per Month (Last 6)</div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",height:80}}>
            {mE.map(([k,cnt])=>{const pct=(cnt/maxM)*100;return(<div key={k} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,height:"100%",justifyContent:"flex-end"}}><div style={{fontSize:11,color:C.goldLight,fontWeight:600,opacity:cnt>0?1:0}}>{cnt}</div><div style={{width:"100%",borderRadius:6,background:cnt>0?"rgba(42,107,52,.5)":"rgba(26,77,36,.15)",border:cnt>0?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.2)",height:`${Math.max(pct,4)}%`,transition:"height .4s"}}/><div style={{fontSize:10,color:C.creamMuted}}>{monthLabel(k)}</div></div>);})}
          </div>
        </div>
        {h2h.length>0&&(<div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"18px 20px",marginBottom:20}}>
          <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Head-to-Head</div>
          {h2h.map(([opp,rec])=>{const tot=rec.wins+rec.losses+rec.ties,wp=Math.round((rec.wins/tot)*100);return(<div key={opp} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,paddingBottom:12,borderBottom:"1px solid rgba(42,107,52,.15)"}}>
            <div style={{width:32,height:32,borderRadius:8,background:avatarColor(opp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(opp)}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:C.cream,marginBottom:4}}>{opp}</div><div style={{height:5,borderRadius:3,background:"rgba(192,64,64,.3)",overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:"linear-gradient(90deg,#2a8a3a,#4db860)",width:`${wp}%`,transition:"width .5s"}}/></div></div>
            <div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:rec.wins>rec.losses?C.greenBright:"#e07070"}}>{rec.wins}W – {rec.losses}L{rec.ties>0?` – ${rec.ties}T`:""}</div><div style={{fontSize:10,color:C.creamMuted}}>{tot} matchups</div></div>
          </div>);})}
        </div>)}
        <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:14,marginTop:8}}>Round History</div>
      </>)}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function BrocalaGolf(){
  const [rounds,      setRounds]      = useState([]);
  const [pending,     setPending]     = useState([]);
  const [schedule,    setSchedule]    = useState([]);
  const [reactions,   setReactions]   = useState({});
  const [comments,    setComments]    = useState([]);
  const [photos,      setPhotos]      = useState({});
  const [members,     setMembers]     = useState(DEFAULT_MEMBERS);
  const [announcement,setAnnouncement]= useState(null);
  const [view,        setView]        = useState("home");
  const [selPlayer,   setSelPlayer]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState(null);
  const [editRound,   setEditRound]   = useState(null);
  const [delConfirm,  setDelConfirm]  = useState(null);
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [pinModal,    setPinModal]    = useState(false);
  const [pin,         setPin]         = useState("");
  const [pinErr,      setPinErr]      = useState(false);
  const [rejectId,    setRejectId]    = useState(null);
  const [rejectNote,  setRejectNote]  = useState("");
  const [form,        setForm]        = useState(emptyForm());
  const [schedForm,   setSchedForm]   = useState(emptySchedForm());
  const [schedModal,  setSchedModal]  = useState(false);
  const [schedErrors, setSchedErrors] = useState({});
  const [editSchedId, setEditSchedId] = useState(null);
  const [errors,      setErrors]      = useState({});
  const [notifPerm,   setNotifPerm]   = useState("default");

  // Admin: member management
  const [newMemberName,   setNewMemberName]   = useState("");
  const [memberEditId,    setMemberEditId]    = useState(null);
  const [memberEditName,  setMemberEditName]  = useState("");

  // Admin: announcement form
  const [annForm, setAnnForm] = useState({title:"",text:"",type:"info"});
  const [annPreview, setAnnPreview] = useState(false);

  const didInit = useRef({rounds:false,sched:false});
  const prevIds = useRef({rounds:new Set(),sched:new Set()});

  function emptyForm(){return{playerName:"",partnerName:"",date:new Date().toISOString().split("T")[0],course:"",score:"",holes:"18",tees:"blue",courseRating:"",slope:"",notes:""};}
  function emptySchedForm(){return{course:"",date:"",time:"10:00",notes:""};}

  function triggerNotif(title,body){if("Notification" in window&&Notification.permission==="granted")new Notification(`⛳ ${title}`,{body});}
  async function requestNotifPerm(){if(!("Notification" in window)){showToast("Browser doesn't support notifications","danger");return;}const p=await Notification.requestPermission();setNotifPerm(p);if(p==="granted")showToast("Notifications enabled 🔔");else showToast("Notifications blocked","danger");}

  useEffect(()=>{
    if("Notification" in window) setNotifPerm(Notification.permission);
    const unsubR=onSnapshot(doc(db,"brocala","rounds"),snap=>{
      const list=snap.exists()?(snap.data().list||[]):[];
      if(!didInit.current.rounds){prevIds.current.rounds=new Set(list.map(r=>r.id));didInit.current.rounds=true;}
      else{list.filter(r=>!prevIds.current.rounds.has(r.id)).forEach(r=>triggerNotif("Round Approved!",`${r.playerName} shot ${r.score} at ${r.course}`));prevIds.current.rounds=new Set(list.map(r=>r.id));}
      setRounds(list);setLoading(false);
    });
    const unsubP=onSnapshot(doc(db,"brocala","pending"),snap=>{setPending(snap.exists()?(snap.data().list||[]):[]);});
    const unsubS=onSnapshot(doc(db,"brocala","schedule"),snap=>{
      const list=snap.exists()?(snap.data().list||[]):null;
      if(!list){setDoc(doc(db,"brocala","schedule"),{list:SEED_SCHEDULE});setSchedule(SEED_SCHEDULE);}
      else{if(!didInit.current.sched){prevIds.current.sched=new Set(list.map(e=>e.id));didInit.current.sched=true;}else{list.filter(e=>!prevIds.current.sched.has(e.id)).forEach(e=>triggerNotif("Round Scheduled!",`${e.course} on ${formatDate(e.date)}`));prevIds.current.sched=new Set(list.map(e=>e.id));}setSchedule(list);}
    });
    const unsubRxn=onSnapshot(doc(db,"brocala","reactions"),snap=>{setReactions(snap.exists()?(snap.data().map||{}):{});});
    const unsubCmt=onSnapshot(doc(db,"brocala","comments"), snap=>{setComments(snap.exists()?(snap.data().list||[]):[]);});
    const unsubPho=onSnapshot(doc(db,"brocala","photos"),   snap=>{setPhotos(snap.exists()?(snap.data().map||{}):{});});
    const unsubMem=onSnapshot(doc(db,"brocala","members"),  snap=>{
      if(snap.exists()&&snap.data().list?.length) setMembers(snap.data().list);
      else setDoc(doc(db,"brocala","members"),{list:DEFAULT_MEMBERS});
    });
    const unsubAnn=onSnapshot(doc(db,"brocala","announcement"),snap=>{setAnnouncement(snap.exists()&&snap.data().text?snap.data():null);});
    return()=>{unsubR();unsubP();unsubS();unsubRxn();unsubCmt();unsubPho();unsubMem();unsubAnn();};
  },[]);

  async function saveRounds(nr)     {setRounds(nr);     await setDoc(doc(db,"brocala","rounds"),      {list:nr});}
  async function savePending(np)    {setPending(np);    await setDoc(doc(db,"brocala","pending"),     {list:np});}
  async function saveSchedule(ns)   {setSchedule(ns);   await setDoc(doc(db,"brocala","schedule"),    {list:ns});}
  async function saveReactions(rx)  {setReactions(rx);  await setDoc(doc(db,"brocala","reactions"),   {map:rx});}
  async function saveComments(cm)   {setComments(cm);   await setDoc(doc(db,"brocala","comments"),    {list:cm});}
  async function savePhotos(ph)     {setPhotos(ph);     await setDoc(doc(db,"brocala","photos"),      {map:ph});}
  async function saveMembers(ml)    {setMembers(ml);    await setDoc(doc(db,"brocala","members"),     {list:ml});}
  async function saveAnnouncement(a){setAnnouncement(a);await setDoc(doc(db,"brocala","announcement"),a||{text:""});}

  function showToast(msg,type="success"){setToast({msg,type});setTimeout(()=>setToast(null),3200);}

  // Reactions / comments / photos
  async function handleReact(roundId,emoji,name){const cur=reactions[roundId]||{},curL=cur[emoji]||[],newL=curL.includes(name)?curL.filter(n=>n!==name):[...curL,name];await saveReactions({...reactions,[roundId]:{...cur,[emoji]:newL}});}
  async function handleComment(roundId,author,text){if(!text.trim()||!author)return;await saveComments([...comments,{id:Date.now().toString(),roundId,author,text:text.trim(),timestamp:new Date().toISOString()}]);showToast("Comment posted 💬");}
  async function handleDeleteComment(id){await saveComments(comments.filter(c=>c.id!==id));}
  async function handlePhotoUpload(roundId,dataUrl){await savePhotos({...photos,[roundId]:dataUrl});showToast("Photo added 📸");}

  // Schedule
  function handleRsvp(evtId,name,action){
    const updated=schedule.map(e=>{
      if(e.id!==evtId) return e;
      if(action==="remove") return{...e,rsvps:(e.rsvps||[]).filter(n=>n!==name)};
      if((e.rsvps||[]).includes(name)) return e;
      return{...e,rsvps:[...(e.rsvps||[]),name]};
    });
    saveSchedule(updated);
    if(action==="remove") showToast(`${name} removed from RSVP`,"danger");
    else showToast(`✓ ${name} is in!`);
  }
  function handleDeleteSchedule(id){saveSchedule(schedule.filter(e=>e.id!==id));showToast("Event removed","danger");}
  function handleEditSched(evt){setEditSchedId(evt.id);setSchedForm({course:evt.course,date:evt.date,time:evt.time,notes:evt.notes||""});setSchedErrors({});setSchedModal(true);}
  function validateSched(f){const e={};if(!f.course.trim())e.course="Required";if(!f.date)e.date="Required";if(!f.time)e.time="Required";return e;}
  function handleSchedSubmit(){
    const e=validateSched(schedForm);setSchedErrors(e);if(Object.keys(e).length)return;
    if(editSchedId){
      saveSchedule(schedule.map(ev=>ev.id===editSchedId?{...ev,...schedForm}:ev));
      showToast("Round updated ✓");
    } else {
      saveSchedule([...schedule,{...schedForm,id:Date.now().toString(),rsvps:[],createdAt:new Date().toISOString()}].sort((a,b)=>new Date(a.date)-new Date(b.date)));
      showToast("Round scheduled ⛳");
    }
    setSchedForm(emptySchedForm());setSchedErrors({});setSchedModal(false);setEditSchedId(null);
  }

  // Member management
  function addMember(){const n=newMemberName.trim();if(!n||members.includes(n))return;saveMembers([...members,n]);setNewMemberName("");showToast(`${n} added to the group`);}
  function removeMember(name){if(!window.confirm(`Remove ${name} from Brocala Golf?`))return;saveMembers(members.filter(m=>m!==name));showToast(`${name} removed`,"danger");}
  function saveEditMember(){const n=memberEditName.trim();if(!n)return;saveMembers(members.map(m=>m===memberEditId?n:m));setMemberEditId(null);setMemberEditName("");showToast("Name updated");}

  // Announcement
  function postAnnouncement(){if(!annForm.text.trim())return;saveAnnouncement({...annForm,postedAt:new Date().toISOString()});setAnnPreview(false);showToast("Announcement posted 📢");}
  function clearAnnouncement(){saveAnnouncement(null);showToast("Announcement cleared","danger");}

  // Auth
  function tryPin(){if(pin===ADMIN_PIN){setIsAdmin(true);setPinModal(false);setPin("");setPinErr(false);setView("admin");}else{setPinErr(true);setPin("");}}

  // Round form
  function validate(f){const e={};if(!f.playerName.trim())e.playerName="Required";if(!f.partnerName.trim())e.partnerName="Required";else if(f.playerName.trim().toLowerCase()===f.partnerName.trim().toLowerCase())e.partnerName="Must be a different member";if(!f.date)e.date="Required";if(!f.course.trim())e.course="Required";if(!f.score||isNaN(f.score)||+f.score<18||+f.score>200)e.score="Valid score: 18–200";if(f.tees!=="blue")e.tees="Only Blue Tee rounds accepted";if(f.courseRating&&(isNaN(f.courseRating)||+f.courseRating<60||+f.courseRating>80))e.courseRating="60–80";if(f.slope&&(isNaN(f.slope)||+f.slope<55||+f.slope>155))e.slope="55–155";return e;}
  function handleSubmit(){const e=validate(form);setErrors(e);if(Object.keys(e).length)return;savePending([...pending,{...form,id:Date.now().toString(),score:+form.score,holes:+form.holes,courseRating:form.courseRating||"",slope:form.slope||"",submittedAt:new Date().toISOString(),status:"pending"}]);setForm(emptyForm());setErrors({});showToast("Submitted — awaiting John's approval ⏳","pending");setView("home");}
  function handleEditSave(){const e=validate(form);setErrors(e);if(Object.keys(e).length)return;saveRounds(rounds.map(r=>r.id===editRound.id?{...r,...form,score:+form.score,holes:+form.holes}:r));setEditRound(null);setForm(emptyForm());setErrors({});showToast("Round updated ✓");setView("admin");}
  function approveRound(id){const r=pending.find(p=>p.id===id);if(!r)return;const a={...r,approvedAt:new Date().toISOString()};delete a.status;delete a.rejectedAt;delete a.rejectNote;saveRounds([...rounds,a]);savePending(pending.filter(p=>p.id!==id));showToast(`✓ Approved — ${r.playerName}`);}
  function rejectRound(id){savePending(pending.map(p=>p.id===id?{...p,status:"rejected",rejectedAt:new Date().toISOString(),rejectNote:rejectNote.trim()}:p));setRejectId(null);setRejectNote("");showToast("Round rejected","danger");}
  function handleDelete(id){saveRounds(rounds.filter(r=>r.id!==id));setDelConfirm(null);showToast("Round removed","danger");}
  function startEdit(round){setEditRound(round);setForm({playerName:round.playerName,partnerName:round.partnerName,date:round.date,course:round.course,score:round.score.toString(),holes:round.holes.toString(),tees:"blue",courseRating:round.courseRating||"",slope:round.slope||"",notes:round.notes||""});setErrors({});setView("submit");}

  const rankings     = getRankings(rounds,members);
  const pendingCount = pending.filter(p=>p.status==="pending").length;
  const recentRounds = [...rounds].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  const upcomingEvt  = schedule.filter(e=>daysUntil(e.date)>=0).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const mostImproved = getMostImproved(rounds,members);
  const cmtsFor      = id => comments.filter(c=>c.roundId===id);

  const toastBg=toast?.type==="danger"?"rgba(192,64,64,.95)":toast?.type==="pending"?"rgba(13,56,20,.97)":"rgba(13,80,26,.95)";
  const toastBorder=toast?.type==="danger"?C.danger:toast?.type==="pending"?C.greenBright:C.success;
  const TABS=["home","standings","history","schedule",...(isAdmin?["admin"]:[])];

  function RCard(round,isAdm=false){
    return <RoundCardLive key={round.id} round={round} members={members} isAdmin={isAdm}
      rxns={reactions[round.id]} cmts={cmtsFor(round.id)} photo={photos[round.id]||null}
      onReact={handleReact} onComment={handleComment} onDeleteComment={handleDeleteComment} onPhotoUpload={handlePhotoUpload}
      onEdit={()=>startEdit(round)} onDelete={()=>setDelConfirm(round.id)}
      deleteConfirm={delConfirm===round.id} onDeleteConfirm={()=>handleDelete(round.id)} onDeleteCancel={()=>setDelConfirm(null)}/>;
  }

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans',sans-serif",color:C.cream,position:"relative"}}>
      <style>{css}</style>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,background:"linear-gradient(180deg,#2d6a35 0%,#1e4d26 100%)"}}/>

      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:1000,background:toastBg,backdropFilter:"blur(10px)",border:`1px solid ${toastBorder}`,borderRadius:10,padding:"12px 24px",fontSize:14,fontWeight:500,color:C.cream,boxShadow:"0 8px 30px rgba(0,0,0,.5)",whiteSpace:"nowrap",letterSpacing:.3}}>{toast.msg}</div>}

      {/* PIN */}
      {pinModal&&(<div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:C.card,border:"1px solid rgba(201,162,39,.3)",borderRadius:20,padding:"36px 32px",width:320,boxShadow:"0 24px 80px rgba(0,0,0,.8)"}}>
          <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:32,marginBottom:10}}>🔐</div><div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700,color:C.goldLight,letterSpacing:2}}>ADMIN ACCESS</div><div style={{fontSize:12,color:C.creamMuted,marginTop:6}}>John Hixon only</div></div>
          <input type="password" value={pin} onChange={e=>{setPin(e.target.value);setPinErr(false);}} onKeyDown={e=>{if(e.key==="Enter")tryPin();}} placeholder="Enter PIN" autoFocus style={{...iStyle(pinErr),textAlign:"center",fontSize:22,letterSpacing:10,marginBottom:8}}/>
          {pinErr&&<div style={{color:"#e07070",fontSize:12,textAlign:"center",marginBottom:10}}>Incorrect PIN</div>}
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button className="bh" onClick={()=>{setPinModal(false);setPin("");setPinErr(false);}} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:10,color:C.creamMuted,padding:"12px",fontSize:13,cursor:"pointer"}}>Cancel</button>
            <button className="bh" onClick={tryPin} style={{flex:1,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Enter</button>
          </div>
        </div>
      </div>)}

      {/* SCHEDULE MODAL */}
      {schedModal&&(<div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
        <div style={{background:C.card,border:"1px solid rgba(42,107,52,.3)",borderRadius:20,padding:"28px 26px",width:"100%",maxWidth:420,boxShadow:"0 24px 80px rgba(0,0,0,.8)"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700,color:C.cream,letterSpacing:2,marginBottom:20}}>{editSchedId?"EDIT ROUND":"SCHEDULE A ROUND"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Field label="Course Name" error={schedErrors.course}><input value={schedForm.course} onChange={e=>setSchedForm({...schedForm,course:e.target.value})} placeholder="e.g. Juliette Falls Golf Course" style={iStyle(schedErrors.course)}/></Field>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Field label="Date" error={schedErrors.date}><input type="date" value={schedForm.date} onChange={e=>setSchedForm({...schedForm,date:e.target.value})} style={{...iStyle(schedErrors.date),colorScheme:"dark"}}/></Field>
              <Field label="Tee Time"><input type="time" value={schedForm.time} onChange={e=>setSchedForm({...schedForm,time:e.target.value})} style={{...iStyle(false),colorScheme:"dark"}}/></Field>
            </div>
            <Field label="Notes (optional)"><textarea value={schedForm.notes} onChange={e=>setSchedForm({...schedForm,notes:e.target.value})} placeholder="Details for the group…" rows={2} style={{...iStyle(false),resize:"none",fontFamily:"'DM Sans',sans-serif"}}/></Field>
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button className="bh" onClick={()=>{setSchedModal(false);setSchedForm(emptySchedForm());setSchedErrors({});setEditSchedId(null);}} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:10,color:C.creamMuted,padding:"12px",fontSize:13,cursor:"pointer"}}>Cancel</button>
              <button className="bh" onClick={handleSchedSubmit} style={{flex:1,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{editSchedId?"Save Changes":"Schedule It ⛳"}</button>
            </div>
          </div>
        </div>
      </div>)}

      {/* HEADER */}
      <div style={{position:"relative",zIndex:10,background:"linear-gradient(180deg,rgba(10,26,12,.99) 0%,rgba(5,14,6,.97) 100%)",borderBottom:"1px solid rgba(201,162,39,.2)",boxShadow:"0 4px 40px rgba(0,0,0,.6)"}}>
        <div style={{height:3,background:`linear-gradient(90deg,transparent,${C.gold},${C.goldLight},${C.gold},transparent)`}}/>
        <div style={{maxWidth:720,margin:"0 auto",padding:"20px 24px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:52,height:52,borderRadius:12,background:`linear-gradient(135deg,${C.cardMid},${C.green})`,border:"1.5px solid rgba(201,162,39,.45)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:"0 0 24px rgba(201,162,39,.18)"}}>⛳</div>
              <div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,letterSpacing:3,color:C.cream,textShadow:"0 0 30px rgba(201,162,39,.25)"}}>BROCALA GOLF</div>
                <div style={{fontSize:10,color:C.creamMuted,letterSpacing:4,textTransform:"uppercase",marginTop:1}}>Group Leaderboard</div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
              <button className="bh" onClick={requestNotifPerm} title="Toggle notifications" style={{background:notifPerm==="granted"?"rgba(42,107,52,.25)":"rgba(255,255,255,.05)",border:notifPerm==="granted"?"1px solid rgba(77,184,96,.3)":"1px solid rgba(255,255,255,.1)",borderRadius:9,color:notifPerm==="granted"?C.greenBright:C.creamMuted,padding:"8px 12px",fontSize:15,cursor:"pointer"}}>{notifPerm==="granted"?"🔔":"🔕"}</button>
              {isAdmin?<button className="bh" onClick={()=>{setIsAdmin(false);setView("home");}} style={{background:"rgba(201,162,39,.15)",border:"1px solid rgba(201,162,39,.3)",borderRadius:9,color:C.gold,padding:"8px 14px",fontSize:12,cursor:"pointer",letterSpacing:1}}>EXIT ADMIN</button>
                :<button className="bh" onClick={()=>setPinModal(true)} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,color:C.creamMuted,padding:"8px 14px",fontSize:12,cursor:"pointer",letterSpacing:1,position:"relative"}}>ADMIN{pendingCount>0&&<span className="pulse" style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:C.greenBright,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:C.bg}}>{pendingCount}</span>}</button>}
              <button className="bh" onClick={()=>{setEditRound(null);setForm(emptyForm());setErrors({});setView("submit");}} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"10px 18px",fontWeight:700,fontSize:13,cursor:"pointer",letterSpacing:.8,fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 16px rgba(201,162,39,.25)"}}>+ POST ROUND</button>
            </div>
          </div>
          <div style={{display:"flex",gap:24,paddingBottom:4,flexWrap:"wrap"}}>
            {[{l:"Members",v:members.length},{l:"Active",v:rankings.filter(p=>p.roundCount>0).length},{l:"Rounds",v:rounds.length}].map(s=>(
              <div key={s.l} style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.goldLight}}>{s.v}</span><span style={{fontSize:11,color:C.creamMuted,letterSpacing:1,textTransform:"uppercase"}}>{s.l}</span></div>
            ))}
            {pendingCount>0&&<div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.greenBright}}>{pendingCount}</span><span style={{fontSize:11,color:C.greenBright,letterSpacing:1,textTransform:"uppercase"}}>Pending</span></div>}
          </div>
          <div style={{display:"flex",gap:0,marginTop:14,overflowX:"auto"}}>
            {TABS.map(v=>(
              <button key={v} onClick={()=>{setView(v);setSelPlayer(null);}} className={(view===v&&!selPlayer)?"tl":""}
                style={{background:"none",border:"none",color:(view===v&&!selPlayer)?C.goldLight:C.creamMuted,padding:"10px 14px 12px",fontSize:11,cursor:"pointer",letterSpacing:2,textTransform:"uppercase",fontWeight:600,fontFamily:"'DM Sans',sans-serif",transition:"color .2s",whiteSpace:"nowrap"}}>
                {v}{v==="admin"&&pendingCount>0&&<span style={{marginLeft:6,background:C.greenBright,borderRadius:10,padding:"1px 6px",fontSize:9,color:C.bg,fontWeight:700,verticalAlign:"middle"}}>{pendingCount}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{maxWidth:720,margin:"0 auto",padding:"28px 24px 80px",position:"relative",zIndex:1}}>

        {selPlayer&&<PlayerProfile playerName={selPlayer} allRounds={rounds} rankings={rankings} members={members} onBack={()=>setSelPlayer(null)}/>}

        {/* HOME */}
        {!selPlayer&&view==="home"&&(
          <div className="fi">
            <AnnouncementBanner announcement={announcement}/>
            {mostImproved&&(<div style={{background:"linear-gradient(135deg,rgba(201,162,39,.1),rgba(26,77,36,.15))",border:"1px solid rgba(201,162,39,.3)",borderRadius:14,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:14}}><span style={{fontSize:28}}>📈</span><div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Most Improved Player</div><div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700,color:C.goldLight}}>{mostImproved.player}</div><div style={{fontSize:12,color:C.creamDim,marginTop:2}}>Scoring avg improved by {mostImproved.diff.toFixed(1)} strokes</div></div><span style={{fontSize:28,marginLeft:"auto"}}>🏆</span></div>)}
            {upcomingEvt.length>0&&(<div style={{marginBottom:28}}><SectionHeader label="NEXT ROUND" action={<button className="bh" onClick={()=>setView("schedule")} style={{background:"none",border:"none",color:C.greenBright,fontSize:11,cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>See All →</button>}/><ScheduleCard evt={upcomingEvt[0]} members={members} onRsvp={handleRsvp} isAdmin={isAdmin} onDelete={handleDeleteSchedule} onEdit={handleEditSched}/></div>)}
            <div style={{marginBottom:28}}>
              <SectionHeader label="STANDINGS" action={<button className="bh" onClick={()=>setView("standings")} style={{background:"none",border:"none",color:C.greenBright,fontSize:11,cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>Full Board →</button>}/>
              {rankings.slice(0,3).map((p,i)=>{const isChamp=p.name===REIGNING_CHAMP&&p.roundCount===0,isTop=p.roundCount>0&&i===0,medal=["🥇","🥈","🥉"];return(<div key={p.name} className="rh" onClick={()=>setSelPlayer(p.name)} style={{background:isChamp||isTop?"linear-gradient(135deg,rgba(201,162,39,.09),rgba(26,77,36,.25))":"rgba(13,32,16,.75)",border:isChamp||isTop?"1px solid rgba(201,162,39,.28)":"1px solid rgba(42,107,52,.18)",borderRadius:14,padding:"13px 16px",marginBottom:7,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}><div style={{width:26,textAlign:"center",flexShrink:0}}>{isChamp||isTop?<span className="sh" style={{fontSize:18}}>👑</span>:p.roundCount>0&&i<3?<span style={{fontSize:16}}>{medal[i]}</span>:<span style={{fontSize:12,color:C.creamMuted}}>—</span>}</div><div style={{width:36,height:36,borderRadius:9,flexShrink:0,background:isChamp||isTop?`linear-gradient(135deg,${C.goldDim},${C.gold})`:avatarColor(p.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif"}}>{initials(p.name)}</div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14,color:isChamp||isTop?C.goldLight:C.cream}}>{p.name}{isChamp&&<span style={{marginLeft:8,fontSize:9,background:"rgba(201,162,39,.15)",border:"1px solid rgba(201,162,39,.3)",borderRadius:4,padding:"2px 6px",color:C.gold,letterSpacing:1,verticalAlign:"middle"}}>CHAMP</span>}</div><div style={{fontSize:11,color:C.creamMuted,marginTop:2}}>{p.roundCount>0?`${p.roundCount} rounds · HCP: ${p.handicap||"—"}`:"No rounds yet"}</div></div><div style={{textAlign:"right",flexShrink:0}}>{p.avg!==null?<><div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,color:isTop||isChamp?C.goldLight:C.cream}}>{p.avg.toFixed(1)}</div><div style={{fontSize:9,color:C.creamMuted}}>AVG</div></>:<div style={{fontSize:12,color:C.creamMuted}}>—</div>}</div></div>);})}
            </div>
            <div><SectionHeader label="RECENT ROUNDS" right={`${rounds.length} TOTAL`} action={<button className="bh" onClick={()=>setView("history")} style={{background:"none",border:"none",color:C.greenBright,fontSize:11,cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>All →</button>}/>{recentRounds.length===0&&<Empty msg="No approved rounds yet — be the first!"/>}{recentRounds.map(r=>RCard(r))}</div>
          </div>
        )}

        {/* STANDINGS */}
        {!selPlayer&&view==="standings"&&(
          <div className="fi">
            <SectionHeader label="STANDINGS" right="AVG / 18 HOLES"/>
            {mostImproved&&<div style={{background:"linear-gradient(135deg,rgba(201,162,39,.08),rgba(26,77,36,.12))",border:"1px solid rgba(201,162,39,.2)",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:20}}>📈</span><div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1,textTransform:"uppercase"}}>Most Improved</div><div style={{fontSize:14,fontWeight:600,color:C.goldLight}}>{mostImproved.player} <span style={{fontSize:12,color:C.creamDim}}>({mostImproved.diff.toFixed(1)} stroke improvement)</span></div></div></div>}
            {rankings.map((p,i)=>{const isChamp=p.name===REIGNING_CHAMP&&p.roundCount===0,isTop=p.roundCount>0&&i===0,medal=["🥇","🥈","🥉"];return(<div key={p.name} className="rh" onClick={()=>setSelPlayer(p.name)} style={{background:isChamp||isTop?"linear-gradient(135deg,rgba(201,162,39,.09),rgba(26,77,36,.25))":"rgba(13,32,16,.75)",border:isChamp||isTop?"1px solid rgba(201,162,39,.28)":"1px solid rgba(42,107,52,.18)",borderRadius:14,padding:"14px 18px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:14}}><div style={{width:28,textAlign:"center",flexShrink:0}}>{isChamp||isTop?<span className="sh" style={{fontSize:20}}>👑</span>:p.roundCount>0&&i<3?<span style={{fontSize:18}}>{medal[i]}</span>:<span style={{fontFamily:"'Cinzel',serif",fontSize:14,color:p.roundCount===0?C.creamMuted:C.creamDim,fontWeight:600}}>{p.roundCount===0?"—":i+1}</span>}</div><div style={{width:42,height:42,borderRadius:10,flexShrink:0,background:isChamp||isTop?`linear-gradient(135deg,${C.goldDim},${C.gold})`:avatarColor(p.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",boxShadow:isChamp||isTop?"0 0 16px rgba(201,162,39,.3)":"0 2px 8px rgba(0,0,0,.4)",border:isChamp||isTop?"1px solid rgba(201,162,39,.45)":"1px solid rgba(255,255,255,.06)"}}>{initials(p.name)}</div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:15,color:isChamp||isTop?C.goldLight:C.cream}}>{p.name}{isChamp&&<span style={{marginLeft:8,fontSize:10,background:"rgba(201,162,39,.15)",border:"1px solid rgba(201,162,39,.3)",borderRadius:4,padding:"2px 6px",color:C.gold,letterSpacing:1,verticalAlign:"middle"}}>REIGNING CHAMP</span>}</div><div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>{p.roundCount>0?`${p.roundCount} round${p.roundCount!==1?"s":""} · Best: ${p.best} · HCP: ${p.handicap||"—"}`:"No rounds yet"}</div></div><div style={{textAlign:"right",flexShrink:0}}>{p.avg!==null?<><div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:isTop||isChamp?C.goldLight:C.cream}}>{p.avg.toFixed(1)}</div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1}}>AVG</div></>:<div style={{fontSize:13,color:C.creamMuted}}>—</div>}</div><div style={{color:C.creamMuted,fontSize:13,flexShrink:0}}>›</div></div>);})}
          </div>
        )}

        {/* HISTORY */}
        {!selPlayer&&view==="history"&&(
          <div className="fi">
            <SectionHeader label="ALL ROUNDS" right={`${rounds.length} TOTAL`}/>
            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:18}}>{members.map(m=><button key={m} className="bh" onClick={()=>setSelPlayer(m)} style={{background:"rgba(26,77,36,.2)",border:"1px solid rgba(42,107,52,.3)",borderRadius:20,color:C.creamDim,padding:"5px 13px",fontSize:12,cursor:"pointer"}}>{m}</button>)}</div>
            {rounds.length===0&&<Empty msg="No approved rounds yet"/>}
            {[...rounds].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>RCard(r))}
          </div>
        )}

        {/* SCHEDULE */}
        {!selPlayer&&view==="schedule"&&(
          <div className="fi">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
              <div><div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:600,color:C.cream}}>SCHEDULE</div><div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>Upcoming rounds · RSVP to lock in your spot</div></div>
              <button className="bh" onClick={()=>setSchedModal(true)} style={{background:`linear-gradient(135deg,${C.green},${C.greenLight})`,border:"1px solid rgba(77,184,96,.35)",borderRadius:10,color:C.cream,padding:"10px 16px",fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:.5,whiteSpace:"nowrap"}}>+ New Round</button>
            </div>
            {upcomingEvt.length===0&&<Empty msg="No upcoming rounds scheduled"/>}
            {upcomingEvt.map(e=><ScheduleCard key={e.id} evt={e} members={members} onRsvp={handleRsvp} isAdmin={isAdmin} onDelete={handleDeleteSchedule} onEdit={handleEditSched}/>)}
            {schedule.filter(e=>daysUntil(e.date)<0).length>0&&(<div style={{marginTop:28}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Past Rounds</div>{schedule.filter(e=>daysUntil(e.date)<0).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=><div key={e.id} style={{opacity:.5}}><ScheduleCard evt={e} members={members} onRsvp={handleRsvp} isAdmin={isAdmin} onDelete={handleDeleteSchedule} onEdit={handleEditSched} compact/></div>)}</div>)}
          </div>
        )}

        {/* ADMIN */}
        {!selPlayer&&view==="admin"&&isAdmin&&(
          <div className="fi">
            <SectionHeader label={`ADMIN — ${ADMIN_NAME}`}/>

            {/* ── ANNOUNCEMENT SECTION ── */}
            <div style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"20px 22px",marginBottom:28}}>
              <SubHeader label="📢 Announcement"/>
              {announcement?.text&&(
                <div style={{marginBottom:16,padding:"12px 14px",background:"rgba(26,77,36,.15)",border:"1px solid rgba(77,184,96,.2)",borderRadius:10}}>
                  <div style={{fontSize:11,color:C.creamMuted,marginBottom:4}}>Currently live:</div>
                  <div style={{fontSize:13,color:C.cream}}>{announcement.text}</div>
                  <button className="bh" onClick={clearAnnouncement} style={{marginTop:10,background:"rgba(192,64,64,.15)",border:"1px solid rgba(192,64,64,.3)",borderRadius:7,color:"#e07070",padding:"5px 12px",fontSize:11,cursor:"pointer"}}>Clear Announcement</button>
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}>
                  <Field label="Title (optional)"><input value={annForm.title} onChange={e=>setAnnForm({...annForm,title:e.target.value})} placeholder="e.g. Season Update" style={iStyle(false)}/></Field>
                  <Field label="Type">
                    <select value={annForm.type} onChange={e=>setAnnForm({...annForm,type:e.target.value})} style={{...iStyle(false),appearance:"none",cursor:"pointer",minWidth:100}}>
                      <option value="info">📢 Info</option>
                      <option value="warning">⚠️ Warning</option>
                      <option value="urgent">🚨 Urgent</option>
                    </select>
                  </Field>
                </div>
                <Field label="Message"><textarea value={annForm.text} onChange={e=>setAnnForm({...annForm,text:e.target.value})} placeholder="Type your message to the group…" rows={3} style={{...iStyle(false),resize:"none",fontFamily:"'DM Sans',sans-serif"}}/></Field>
                <div style={{display:"flex",gap:10}}>
                  {annForm.text&&<button className="bh" onClick={()=>setAnnPreview(v=>!v)} style={{background:"rgba(255,255,255,.05)",border:"none",borderRadius:9,color:C.creamMuted,padding:"9px 14px",fontSize:12,cursor:"pointer"}}>{annPreview?"Hide Preview":"Preview"}</button>}
                  <button className="bh" onClick={postAnnouncement} disabled={!annForm.text.trim()} style={{background:annForm.text.trim()?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:9,color:annForm.text.trim()?"#0a1a0c":C.creamMuted,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:annForm.text.trim()?"pointer":"not-allowed"}}>Post Announcement</button>
                </div>
                {annPreview&&annForm.text&&<AnnouncementBanner announcement={{...annForm,postedAt:new Date().toISOString()}}/>}
              </div>
            </div>

            {/* ── MEMBER MANAGEMENT ── */}
            <div style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"20px 22px",marginBottom:28}}>
              <SubHeader label="👥 Manage Members"/>
              <div style={{marginBottom:16}}>
                {members.map(m=>(
                  <div key={m} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:"rgba(5,14,6,.6)",border:"1px solid rgba(42,107,52,.2)",marginBottom:7}}>
                    <div style={{width:30,height:30,borderRadius:8,background:avatarColor(m),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(m)}</div>
                    {memberEditId===m?(
                      <>
                        <input value={memberEditName} onChange={e=>setMemberEditName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveEditMember();}} autoFocus style={{...iStyle(false),flex:1,padding:"7px 10px",fontSize:13}}/>
                        <button className="bh" onClick={saveEditMember} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:7,color:"#0a1a0c",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Save</button>
                        <button className="bh" onClick={()=>{setMemberEditId(null);setMemberEditName("");}} style={{background:"rgba(255,255,255,.05)",border:"none",borderRadius:7,color:C.creamMuted,padding:"6px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
                      </>
                    ):(
                      <>
                        <span style={{flex:1,fontSize:14,color:C.cream,fontWeight:500}}>{m}</span>
                        <button className="bh" onClick={()=>{setMemberEditId(m);setMemberEditName(m);}} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",borderRadius:7,color:C.greenBright,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Rename</button>
                        <button className="bh" onClick={()=>removeMember(m)} style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.25)",borderRadius:7,color:"#c07070",padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Remove</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {/* Add new */}
              <div style={{display:"flex",gap:10}}>
                <input value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addMember();}} placeholder="New member name…" style={{...iStyle(false),flex:1,padding:"10px 14px",fontSize:13}}/>
                <button className="bh" onClick={addMember} disabled={!newMemberName.trim()} style={{background:newMemberName.trim()?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(60,60,60,.3)",border:"none",borderRadius:10,color:newMemberName.trim()?C.cream:C.creamMuted,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:newMemberName.trim()?"pointer":"not-allowed",whiteSpace:"nowrap"}}>+ Add Member</button>
              </div>
            </div>

            {/* ── PENDING ── */}
            <div style={{marginBottom:28}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><SubHeader label="Pending Approval"/><div style={{height:1,flex:1,background:"linear-gradient(90deg,rgba(77,184,96,.3),transparent)"}}/><div style={{fontSize:11,color:C.greenBright,marginBottom:14}}>{pendingCount} WAITING</div></div>
              {pending.filter(p=>p.status==="pending").length===0&&<div style={{background:"rgba(26,77,36,.1)",border:"1px dashed rgba(42,107,52,.25)",borderRadius:12,padding:"24px",textAlign:"center",color:C.creamMuted,fontSize:13}}>No rounds awaiting approval</div>}
              {pending.filter(p=>p.status==="pending").map(r=>(
                <div key={r.id} style={{background:"rgba(26,77,36,.15)",border:"1px solid rgba(77,184,96,.25)",borderRadius:14,padding:"16px 18px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}><div style={{width:32,height:32,borderRadius:8,background:avatarColor(r.playerName),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif"}}>{initials(r.playerName)}</div><span style={{fontWeight:600,fontSize:15,color:C.cream}}>{r.playerName}</span><span style={{color:C.creamMuted,fontSize:12}}>w/ {r.partnerName}</span></div>
                      <div style={{fontSize:12,color:C.creamDim,lineHeight:1.9}}><span style={{marginRight:10}}>📍 {r.course}</span><span style={{marginRight:10}}>📅 {formatDate(r.date)}</span><span style={{background:"rgba(26,77,36,.4)",border:"1px solid rgba(42,107,52,.35)",borderRadius:4,padding:"1px 7px",fontSize:11,marginRight:8}}>{r.holes}H</span>{r.courseRating&&<span style={{fontSize:11,color:C.creamMuted}}>CR:{r.courseRating} SL:{r.slope||113}</span>}</div>
                      {r.notes&&<div style={{fontSize:12,color:C.creamMuted,marginTop:6,fontStyle:"italic",borderLeft:`2px solid ${C.green}`,paddingLeft:10}}>{r.notes}</div>}
                      <div style={{fontSize:11,color:C.creamMuted,marginTop:6}}>Submitted {new Date(r.submittedAt).toLocaleString()}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,color:C.goldLight}}>{r.score}</div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1}}>STROKES</div>
                      <div style={{display:"flex",gap:7,marginTop:10}}>
                        <button className="bh" onClick={()=>approveRound(r.id)} style={{background:"rgba(42,138,58,.25)",border:"1px solid rgba(42,138,58,.4)",borderRadius:8,color:"#6ae0a0",padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>✓ APPROVE</button>
                        <button className="bh" onClick={()=>{setRejectId(r.id);setRejectNote("");}} style={{background:"rgba(192,64,64,.15)",border:"1px solid rgba(192,64,64,.3)",borderRadius:8,color:"#e07070",padding:"7px 14px",fontSize:12,cursor:"pointer"}}>✕ REJECT</button>
                      </div>
                    </div>
                  </div>
                  {rejectId===r.id&&(<div style={{marginTop:14,padding:"14px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:10}}><div style={{fontSize:12,color:"#e07070",marginBottom:8}}>Rejection reason (optional):</div><textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)} rows={2} style={{width:"100%",padding:"9px 12px",borderRadius:8,background:"rgba(5,14,6,.9)",border:"1px solid rgba(192,64,64,.3)",color:C.cream,fontSize:13,outline:"none",resize:"none",fontFamily:"'DM Sans',sans-serif"}}/><div style={{display:"flex",gap:8,marginTop:10}}><button className="bh" onClick={()=>setRejectId(null)} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:8,color:C.creamMuted,padding:"8px",fontSize:12,cursor:"pointer"}}>Cancel</button><button className="bh" onClick={()=>rejectRound(r.id)} style={{flex:1,background:"rgba(192,64,64,.25)",border:"none",borderRadius:8,color:"#e08080",padding:"8px",fontSize:12,cursor:"pointer",fontWeight:600}}>Confirm Reject</button></div></div>)}
                </div>
              ))}
            </div>

            {pending.filter(p=>p.status==="rejected").length>0&&(<div style={{marginBottom:28}}><SubHeader label="Rejected"/>{pending.filter(p=>p.status==="rejected").map(r=>(<div key={r.id} style={{background:"rgba(192,64,64,.06)",border:"1px solid rgba(192,64,64,.15)",borderRadius:12,padding:"12px 16px",marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><span style={{fontWeight:600,color:C.creamDim}}>{r.playerName}</span><span style={{color:C.creamMuted,fontSize:13,marginLeft:8}}>— {r.course} · {formatDate(r.date)} · {r.score} strokes</span>{r.rejectNote&&<div style={{fontSize:12,color:"#c07070",marginTop:4,fontStyle:"italic"}}>"{r.rejectNote}"</div>}</div><button className="bh" onClick={()=>savePending(pending.filter(p=>p.id!==r.id))} style={{background:"rgba(255,255,255,.05)",border:"none",borderRadius:7,color:C.creamMuted,padding:"5px 10px",fontSize:11,cursor:"pointer",marginLeft:12,flexShrink:0}}>dismiss</button></div></div>))}</div>)}

            <div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}><SubHeader label="Approved Rounds"/><div style={{height:1,flex:1,background:`linear-gradient(90deg,rgba(42,107,52,.4),transparent)`}}/><div style={{fontSize:11,color:C.creamMuted,marginBottom:14}}>{rounds.length} TOTAL</div></div>
              {rounds.length===0&&<Empty msg="No approved rounds yet"/>}
              {[...rounds].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>RCard(r,true))}
            </div>
          </div>
        )}

        {/* SUBMIT */}
        {!selPlayer&&view==="submit"&&(
          <div className="fi">
            <button className="bh" onClick={()=>{setView(editRound&&isAdmin?"admin":"home");setEditRound(null);}} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer",letterSpacing:2,marginBottom:10}}>← BACK</button>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:600,color:C.cream,marginBottom:4}}>{editRound?"EDIT ROUND":"SUBMIT A ROUND"}</div>
            <div style={{fontSize:13,color:C.creamMuted,marginBottom:24}}>🔵 Blue Tees only · Must be played with a Brocala member · Awaits John's approval</div>
            <div style={{background:"rgba(10,26,12,.9)",backdropFilter:"blur(8px)",border:"1px solid rgba(42,107,52,.25)",borderRadius:18,padding:"28px 24px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:20}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {[{key:"playerName",label:"Your Name"},{key:"partnerName",label:"Playing Partner"}].map(({key,label})=>(
                    <Field key={key} label={label} error={errors[key]}><select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} style={{...iStyle(errors[key]),appearance:"none",cursor:"pointer"}}><option value="">Select…</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></Field>
                  ))}
                </div>
                <Field label="Course Name" error={errors.course}><input value={form.course} onChange={e=>setForm({...form,course:e.target.value})} placeholder="e.g. Juliette Falls Golf Course" style={iStyle(errors.course)}/></Field>
                <Field label="Tee Box" error={errors.tees}>
                  <div style={{display:"flex",gap:10}}>
                    {[{val:"blue",icon:"🔵",label:"Blue"},{val:"white",icon:"⚪",label:"White"},{val:"red",icon:"🔴",label:"Red"},{val:"gold",icon:"🟡",label:"Gold"}].map(t=>(
                      <button key={t.val} onClick={()=>setForm({...form,tees:t.val})} style={{flex:1,padding:"10px 6px",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .2s",background:form.tees===t.val?(t.val==="blue"?"rgba(26,107,52,.5)":"rgba(80,30,30,.4)"):"rgba(5,14,6,.8)",border:form.tees===t.val?(t.val==="blue"?`2px solid ${C.greenBright}`:"2px solid rgba(192,64,64,.5)"):"1px solid rgba(42,107,52,.3)",color:form.tees===t.val?(t.val==="blue"?C.greenBright:"#e07070"):C.creamMuted}}>{t.icon} {t.label}</button>
                    ))}
                  </div>
                  {form.tees!=="blue"&&<div style={{marginTop:10,background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.3)",borderRadius:9,padding:"10px 14px",fontSize:13,color:"#e07070",display:"flex",alignItems:"center",gap:8}}><span>⛔</span><span>Only <strong>Blue Tee</strong> rounds accepted.</span></div>}
                </Field>
                <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr",gap:16}}>
                  <Field label="Date" error={errors.date}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{...iStyle(errors.date),colorScheme:"dark"}}/></Field>
                  <Field label="Holes"><select value={form.holes} onChange={e=>setForm({...form,holes:e.target.value})} style={{...iStyle(false),cursor:"pointer"}}><option value="18">18</option><option value="9">9</option></select></Field>
                  <Field label="Score" error={errors.score}><input type="number" value={form.score} onChange={e=>setForm({...form,score:e.target.value})} placeholder="84" min="18" max="200" style={iStyle(errors.score)}/></Field>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Course Info <span style={{fontWeight:400,letterSpacing:0,textTransform:"none",color:C.creamMuted}}>(optional — used for handicap)</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    <Field label="Course Rating" error={errors.courseRating}><input type="number" value={form.courseRating} onChange={e=>setForm({...form,courseRating:e.target.value})} placeholder="e.g. 71.4" step="0.1" style={iStyle(errors.courseRating)}/></Field>
                    <Field label="Slope Rating" error={errors.slope}><input type="number" value={form.slope} onChange={e=>setForm({...form,slope:e.target.value})} placeholder="e.g. 128" style={iStyle(errors.slope)}/></Field>
                  </div>
                  <div style={{fontSize:11,color:C.creamMuted,marginTop:6}}>Find these on the course scorecard or at usga.org</div>
                </div>
                <Field label="Notes (optional)"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Highlights, birdies, trash talk…" rows={3} style={{...iStyle(false),resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/></Field>
                <div style={{height:1,background:`linear-gradient(90deg,transparent,rgba(42,107,52,.4),transparent)`}}/>
                <button className="bh" onClick={editRound?handleEditSave:handleSubmit} style={{background:form.tees==="blue"?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:12,color:form.tees==="blue"?"#0a1a0c":C.creamMuted,padding:"15px",fontSize:14,fontWeight:700,cursor:form.tees==="blue"?"pointer":"not-allowed",letterSpacing:2,fontFamily:"'Cinzel',sans-serif",boxShadow:form.tees==="blue"?"0 6px 24px rgba(201,162,39,.25)":"none",transition:"all .2s"}}>{editRound?"SAVE CHANGES":"SUBMIT FOR APPROVAL ⛳"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
