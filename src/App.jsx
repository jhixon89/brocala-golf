import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, onSnapshot, setDoc, getDoc,
  collection, query, where, getDocs
} from "firebase/firestore";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "firebase/auth";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "PASTE_YOUR_apiKey_HERE",
  authDomain: "PASTE_YOUR_authDomain_HERE",
  projectId: "PASTE_YOUR_projectId_HERE",
  storageBucket: "PASTE_YOUR_storageBucket_HERE",
  messagingSenderId: "PASTE_YOUR_messagingSenderId_HERE",
  appId: "PASTE_YOUR_appId_HERE",
};
// ─────────────────────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const EMOJIS = ["🔥","👏","💀"];

const CLUBS = [
  "Driver","3 Wood","5 Wood","4 Hybrid","5 Hybrid",
  "3 Iron","4 Iron","5 Iron","6 Iron","7 Iron","8 Iron","9 Iron",
  "Pitching Wedge","Gap Wedge","Sand Wedge","Lob Wedge"
];

const WEDGE_NAMES = ["Pitching Wedge","Gap Wedge","Sand Wedge","Lob Wedge"];

const WEDGE_TIPS = {
  "Pitching Wedge":{feel:"Lower trajectory, more rollout — plays like a long iron approach",shots:["Stock: Ball center, normal stance — expect 2-3 hop and release","Low checker: Ball back, hands forward — punchy swing, checks up","High: Ball forward, open face slightly — softer landing"],spin:["Clean grooves = everything","Commit through impact — don't baby it","Ball-first contact, then turf"],expect:"Will release 5–15 feet past landing. Best for front pins and firm greens."},
  "Gap Wedge":{feel:"Mid trajectory, balanced — your most versatile scoring club",shots:["Stock: Standard setup — one-hop-and-stop on normal greens","Low: Ball back, firm hands — controlled roller, front pins","High: Open face, ball forward — high soft landing, back pins"],spin:["Dry face = max spin","Accelerate through — never decelerate","Strike the ball first, turf after"],expect:"Should stop within 5–8 feet of landing. Go-to for middle pins."},
  "Sand Wedge":{feel:"High trajectory, soft landing — your best stopping club",shots:["Stock: Slightly open face, ball center — should check or one-hop-stop","High spinner: Open face, ball forward, full speed — checks fast","Bump and run: Square face, ball back — low roller for firm fronts"],spin:["Wipe grooves before every shot — dirt kills spin","Moisture kills spin — dry the face","Speed = friction = spin — commit to the shot"],expect:"50–65 yds: will check fast. 70–80 yds: one-hop-stop. Over 80 yds: may release a few feet."},
  "Lob Wedge":{feel:"Maximum height, maximum spin — lands like a butterfly",shots:["Stock: Open face, ball forward — nearly vertical drop, minimal release","Full speed: Commit hard — more speed = more spin = more check","Flop: Wide open face, sliding under ball — very high, very soft"],spin:["This club only works with clean contact — thin = zero spin","Never decelerate — the club needs speed to work","Premium urethane ball makes a huge difference here"],expect:"Should check or stop within 3–5 feet of landing. Best for tight back pins and soft greens."},
};

const SEED_SCHEDULE = [{
  id:"seed-1", course:"Juliette Falls Golf Course",
  date:"2026-06-07", time:"10:00", notes:"", rsvps:[],
  createdAt:new Date().toISOString(),
}];

// ─── COLORS ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#1e4d26", card:"#0d2010", cardMid:"#112614",
  green:"#1a4d24", greenLight:"#2a6b34", greenBright:"#4db860",
  cream:"#f5f0e8", creamDim:"#c8bfa8", creamMuted:"#8a9e8a",
  gold:"#c9a227", goldLight:"#e8c04a", goldDim:"#7a5f10",
  danger:"#c04040", success:"#2a8a3a",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function norm(r){return r.holes===9?r.score*2:r.score;}
function calcHandicap(rounds){if(!rounds.length)return null;const diffs=rounds.map(r=>{const adj=norm(r),cr=parseFloat(r.courseRating)||72,sl=parseFloat(r.slope)||113;return(adj-cr)*(113/sl);});const recent=diffs.slice(-20);const sorted=[...recent].sort((a,b)=>a-b);const take=Math.max(1,Math.min(8,Math.floor(recent.length*0.4)));return(sorted.slice(0,take).reduce((s,v)=>s+v,0)/take*0.96).toFixed(1);}
function getMostImproved(allRounds,members){let best={player:null,diff:0};members.forEach(m=>{const pr=allRounds.filter(r=>r.playerName.trim().toLowerCase()===m.trim().toLowerCase()).sort((a,b)=>new Date(a.date)-new Date(b.date));if(pr.length<6)return;const sc=pr.map(norm),half=Math.floor(sc.length/2);const imp=(sc.slice(0,half).reduce((s,v)=>s+v,0)/half)-(sc.slice(-half).reduce((s,v)=>s+v,0)/half);if(imp>best.diff)best={player:m,diff:imp};});return best.diff>=1?best:null;}
function getRankings(rounds,members){const map={};members.forEach(m=>{map[m.toLowerCase()]={name:m,rounds:[]};});rounds.forEach(r=>{const k=r.playerName.trim().toLowerCase();if(!map[k])map[k]={name:r.playerName.trim(),rounds:[]};map[k].rounds.push(r);});return Object.values(map).map(p=>{if(!p.rounds.length)return{...p,avg:null,best:null,roundCount:0,handicap:null};const ns=p.rounds.map(norm);return{...p,avg:ns.reduce((s,v)=>s+v,0)/ns.length,best:Math.min(...ns),roundCount:p.rounds.length,handicap:calcHandicap(p.rounds)};}).sort((a,b)=>{if(a.avg===null&&b.avg===null)return 0;if(a.avg===null)return 1;if(b.avg===null)return -1;return a.avg-b.avg;});}
function getPlayerStats(playerName,allRounds,members){const key=playerName.trim().toLowerCase();const rounds=allRounds.filter(r=>r.playerName.trim().toLowerCase()===key).sort((a,b)=>new Date(a.date)-new Date(b.date));if(!rounds.length)return null;const scores=rounds.map(norm);const avg=scores.reduce((s,v)=>s+v,0)/scores.length;const now=new Date();const monthlyMap={};for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);monthlyMap[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]=0;}rounds.forEach(r=>{const k=r.date.slice(0,7);if(k in monthlyMap)monthlyMap[k]++;});const cc={},pc={};rounds.forEach(r=>{cc[r.course]=(cc[r.course]||0)+1;pc[r.partnerName]=(pc[r.partnerName]||0)+1;});let trend="neutral";if(rounds.length>=4){const half=Math.floor(rounds.length/2);const d=(scores.slice(-half).reduce((s,v)=>s+v,0)/half)-(scores.slice(0,half).reduce((s,v)=>s+v,0)/half);if(d<-1.5)trend="improving";else if(d>1.5)trend="declining";}const h2h={};members.forEach(m=>{if(m.trim().toLowerCase()===key)return;const mine=allRounds.filter(r=>r.playerName.trim().toLowerCase()===key&&r.partnerName.trim().toLowerCase()===m.trim().toLowerCase());const their=allRounds.filter(r=>r.playerName.trim().toLowerCase()===m.trim().toLowerCase()&&r.partnerName.trim().toLowerCase()===key);const mx=[];mine.forEach(my=>{const o=their.find(o=>o.date===my.date&&o.course===my.course);if(o)mx.push({m:norm(my),o:norm(o)});});if(mx.length){h2h[m]={wins:mx.filter(x=>x.m<x.o).length,losses:mx.filter(x=>x.m>x.o).length,ties:mx.filter(x=>x.m===x.o).length,total:mx.length};}});return{rounds,scores,avg,best:Math.min(...scores),worst:Math.max(...scores),trend,trendLastFive:scores.slice(-5),monthlyMap,roundsThisYear:rounds.filter(r=>new Date(r.date).getFullYear()===now.getFullYear()).length,roundsLastYear:rounds.filter(r=>new Date(r.date).getFullYear()===now.getFullYear()-1).length,topCourse:Object.entries(cc).sort((a,b)=>b[1]-a[1])[0],topPartner:Object.entries(pc).sort((a,b)=>b[1]-a[1])[0],h2h,totalRounds:rounds.length,handicap:calcHandicap(rounds)};}
async function resizeImage(file,maxDim=800,quality=0.72){return new Promise(resolve=>{const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{let{width:w,height:h}=img;if(w>h){if(w>maxDim){h=h/w*maxDim;w=maxDim;}}else{if(h>maxDim){w=w/h*maxDim;h=maxDim;}}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality));};img.src=e.target.result;};reader.readAsDataURL(file);});}
function formatDate(d){return new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function formatDateFull(d){return new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});}
function formatTime(t){const[h,m]=t.split(":");return`${+h%12||12}:${m} ${+h>=12?"PM":"AM"}`;}
function formatAgo(ts){const s=Math.floor((Date.now()-new Date(ts))/1000);if(s<60)return"just now";if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;}
function monthLabel(key){const[y,m]=key.split("-");return new Date(+y,+m-1,1).toLocaleDateString("en-US",{month:"short"});}
function initials(n){return n.split(" ").map(x=>x[0]).join("").toUpperCase().slice(0,2);}
function daysUntil(d){const a=new Date(d+"T12:00:00"),b=new Date();b.setHours(0,0,0,0);a.setHours(0,0,0,0);return Math.round((a-b)/864e5);}
function genCode(){return Math.random().toString(36).substring(2,8).toUpperCase();}
function genGroupId(){return Math.random().toString(36).substring(2,10);}
const GREENS=["#1a4d24","#1e5c2a","#163d1e","#245e2e","#0f3016","#1d5228","#204f25","#133a1a","#1b4e26","#226030","#112d16"];
function avatarColor(n){let h=0;for(let i=0;i<n.length;i++)h=n.charCodeAt(i)+((h<<5)-h);return GREENS[Math.abs(h)%GREENS.length];}
function calcAdjusted(rawYards,wind,windMph,temp,lie){let y=rawYards;const mph=parseFloat(windMph)||0;if(wind==="headwind")y=y*(1+0.01*mph);if(wind==="tailwind")y=y*(1-0.008*mph);if(wind==="crosswind")y=y*(1+0.005*mph);const t=parseFloat(temp)||70;y-=(t-70)*0.15;if(lie==="rough")y=y*1.10;if(lie==="sand")y=y*1.15;return Math.round(y);}

// ─── CSS ──────────────────────────────────────────────────────────────────────
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
  @keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}
  .rsvp-chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin:2px 3px 2px 0;background:rgba(26,77,36,.35);border:1px solid rgba(77,184,96,.3);color:#a8d8b0}
  .emoji-btn{background:rgba(13,32,16,.9);border:1px solid rgba(42,107,52,.3);border-radius:20px;padding:4px 10px;font-size:13px;cursor:pointer;transition:all .15s;color:#c8bfa8;display:inline-flex;align-items:center;gap:5px}
  .emoji-btn:hover{background:rgba(42,107,52,.25);border-color:rgba(77,184,96,.4);transform:scale(1.05)}
  .emoji-btn.active{background:rgba(42,107,52,.35);border-color:rgba(77,184,96,.5);color:#f5f0e8}
  .comment-item{padding:10px 0;border-bottom:1px solid rgba(42,107,52,.1)}.comment-item:last-child{border-bottom:none}
  @keyframes popIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}.pop{animation:popIn .2s ease}
`;

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function iStyle(e){return{width:"100%",padding:"11px 14px",borderRadius:10,background:"rgba(5,14,6,.85)",border:e?`1px solid ${C.danger}`:"1px solid rgba(42,107,52,.4)",color:C.cream,fontSize:14,outline:"none"};}
function Field({label,error,children}){return(<div><label style={{display:"block",fontSize:10,color:C.creamMuted,marginBottom:7,letterSpacing:2,textTransform:"uppercase"}}>{label}</label>{children}{error&&<div style={{color:"#e07070",fontSize:11,marginTop:4}}>{error}</div>}</div>);}
function SectionHeader({label,right,action}){return(<div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:18}}><div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:600,color:C.cream}}>{label}</div><div style={{height:1,flex:1,background:`linear-gradient(90deg,rgba(42,107,52,.4),transparent)`}}/>{action&&action}{right&&<div style={{fontSize:11,color:C.creamMuted,letterSpacing:1}}>{right}</div>}</div>);}
function SubHeader({label}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:600,color:C.greenBright,letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>{label}</div>;}
function Empty({msg}){return<div style={{textAlign:"center",padding:"30px 0",color:C.creamMuted,fontSize:13}}>{msg}</div>;}
function StatBox({label,value,sub,highlight}){return(<div style={{background:"rgba(13,32,16,.9)",border:`1px solid ${highlight?"rgba(201,162,39,.3)":"rgba(42,107,52,.25)"}`,borderRadius:12,padding:"14px 16px",flex:1,minWidth:0}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>{label}</div><div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:highlight?C.goldLight:C.cream,lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:11,color:C.creamMuted,marginTop:4}}>{sub}</div>}</div>);}
function Spinner(){return<div className="spin" style={{width:20,height:20,border:"2px solid rgba(77,184,96,.3)",borderTop:"2px solid #4db860",borderRadius:"50%",display:"inline-block"}}/>;}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen(){
  const [mode,    setMode]    = useState("signin"); // signin | signup
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(){
    setError(""); setLoading(true);
    try {
      if(mode==="signup"){
        if(!name.trim()){setError("Display name required");setLoading(false);return;}
        const cred=await createUserWithEmailAndPassword(auth,email.trim(),pass);
        await updateProfile(cred.user,{displayName:name.trim()});
        await setDoc(doc(db,"users",cred.user.uid),{displayName:name.trim(),email:email.trim(),groupIds:[],createdAt:new Date().toISOString()});
      } else {
        await signInWithEmailAndPassword(auth,email.trim(),pass);
      }
    } catch(e){
      const msgs={"auth/email-already-in-use":"Email already in use","auth/user-not-found":"No account found","auth/wrong-password":"Incorrect password","auth/invalid-email":"Invalid email","auth/weak-password":"Password must be 6+ characters","auth/invalid-credential":"Invalid email or password"};
      setError(msgs[e.code]||e.message);
    }
    setLoading(false);
  }

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans',sans-serif"}}>
      <style>{css}</style>
      <div style={{width:"100%",maxWidth:400}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:52,marginBottom:12}}>⛳</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,letterSpacing:4,color:C.cream}}>DTG</div>
          <div style={{fontSize:11,color:C.creamMuted,letterSpacing:6,textTransform:"uppercase",marginTop:4}}>Down To Golf</div>
        </div>

        <div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.3)",borderRadius:20,padding:"32px 28px",boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
          {/* Tab toggle */}
          <div style={{display:"flex",background:"rgba(5,14,6,.6)",borderRadius:12,padding:4,marginBottom:24}}>
            {["signin","signup"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,padding:"10px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .2s",background:mode===m?`linear-gradient(135deg,${C.green},${C.greenLight})`:"transparent",color:mode===m?C.cream:C.creamMuted}}>
                {m==="signin"?"Sign In":"Create Account"}
              </button>
            ))}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {mode==="signup"&&(
              <Field label="Your Name">
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. John Hixon" style={iStyle(false)} autoComplete="name"/>
              </Field>
            )}
            <Field label="Email">
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" style={iStyle(false)} autoComplete="email" onKeyDown={e=>{if(e.key==="Enter")handleSubmit();}}/>
            </Field>
            <Field label="Password">
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder={mode==="signup"?"6+ characters":"••••••••"} style={iStyle(false)} autoComplete={mode==="signup"?"new-password":"current-password"} onKeyDown={e=>{if(e.key==="Enter")handleSubmit();}}/>
            </Field>

            {error&&<div style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.3)",borderRadius:9,padding:"10px 14px",color:"#e07070",fontSize:13}}>{error}</div>}

            <button className="bh" onClick={handleSubmit} disabled={loading} style={{background:loading?"rgba(60,60,60,.4)":`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:12,color:loading?C.creamMuted:"#0a1a0c",padding:"14px",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",letterSpacing:1,fontFamily:"'Cinzel',sans-serif",boxShadow:loading?"none":"0 6px 24px rgba(201,162,39,.25)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .2s"}}>
              {loading?<><Spinner/> {mode==="signup"?"Creating Account…":"Signing In…"}</>:mode==="signup"?"JOIN DTG ⛳":"SIGN IN"}
            </button>
          </div>
        </div>
        <div style={{textAlign:"center",marginTop:20,fontSize:12,color:C.creamMuted}}>dt.golf · Private golf groups for your crew</div>
      </div>
    </div>
  );
}

// ─── CREATE ROUND POST MODAL ──────────────────────────────────────────────────
function CreateRoundPostModal({currentUser, onPost, onClose}){
  const [postType,    setPostType]    = useState("round"); // "round" | "regular"
  const [photo,       setPhoto]       = useState(null);
  const [caption,     setCaption]     = useState("");
  const [course,      setCourse]      = useState("");
  const [date,        setDate]        = useState(new Date().toISOString().split("T")[0]);
  const [time,        setTime]        = useState("08:00");
  const [totalSpots,  setTotalSpots]  = useState("4");
  const [posting,     setPosting]     = useState(false);
  const [errors,      setErrors]      = useState({});
  const fileRef = useRef(null);

  async function handlePhoto(e){
    const f=e.target.files[0];if(!f)return;
    setPhoto(await resizeImage(f,900,0.82));
    e.target.value="";
  }

  async function handlePost(){
    const errs={};
    if(!photo) errs.photo="A photo is required";
    if(postType==="round"){
      if(!course.trim()) errs.course="Course name required";
      if(!date) errs.date="Date required";
      if(!time) errs.time="Tee time required";
      const spots=parseInt(totalSpots);
      if(!spots||spots<2||spots>4) errs.spots="2–4 spots";
    }
    setErrors(errs);
    if(Object.keys(errs).length) return;

    setPosting(true);

    let post;
    if(postType==="round"){
      const spots=parseInt(totalSpots);
      post={
        id:"dtg_"+Date.now().toString(),
        type:"match",
        authorUid:currentUser.uid,
        authorName:currentUser.displayName||currentUser.email,
        authorPhoto:null,
        photo,
        caption:caption.trim()||null,
        course:course.trim(),
        date,
        time,
        totalSpots:spots,
        players:[{uid:currentUser.uid,displayName:currentUser.displayName||currentUser.email,joinedAt:new Date().toISOString()}],
        reactions:{},
        comments:[],
        createdAt:new Date().toISOString(),
        status:"open",
      };
    } else {
      post={
        id:"dtg_"+Date.now().toString(),
        type:"regular",
        authorUid:currentUser.uid,
        authorName:currentUser.displayName||currentUser.email,
        authorPhoto:null,
        photo,
        caption:caption.trim()||null,
        reactions:{},
        comments:[],
        createdAt:new Date().toISOString(),
      };
    }

    await onPost(post);
    setPosting(false);
    onClose();
  }

  return(
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.92)",backdropFilter:"blur(10px)",display:"flex",flexDirection:"column",fontFamily:"'DM Sans',sans-serif",overflowY:"auto"}}>
      <div style={{maxWidth:520,margin:"0 auto",width:"100%",padding:"20px 16px 60px"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.creamMuted,fontSize:13,cursor:"pointer",letterSpacing:1}}>✕ CANCEL</button>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.cream,letterSpacing:2}}>NEW POST</div>
          <button className="bh" onClick={handlePost} disabled={posting||!photo} style={{background:photo&&!posting?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.4)",border:"none",borderRadius:9,color:photo&&!posting?"#0a1a0c":C.creamMuted,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:photo&&!posting?"pointer":"not-allowed",display:"flex",alignItems:"center",gap:6}}>{posting?<><Spinner/>Posting…</>:"Share"}</button>
        </div>

        {/* Post type toggle */}
        <div style={{display:"flex",background:"rgba(13,32,16,.8)",borderRadius:12,padding:4,marginBottom:16,border:"1px solid rgba(42,107,52,.25)"}}>
          {[{val:"round",label:"⛳ Looking for Players"},{val:"regular",label:"📸 Regular Post"}].map(t=>(
            <button key={t.val} onClick={()=>{setPostType(t.val);setErrors({});}} style={{flex:1,padding:"10px",borderRadius:9,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .2s",background:postType===t.val?`linear-gradient(135deg,${C.green},${C.greenLight})`:"transparent",color:postType===t.val?C.cream:C.creamMuted}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Photo upload */}
        <div onClick={()=>fileRef.current?.click()} style={{width:"100%",aspectRatio:"4/5",background:"rgba(13,32,16,.8)",border:errors.photo?"1px solid rgba(192,64,64,.5)":"1px dashed rgba(42,107,52,.4)",borderRadius:16,marginBottom:16,cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          {photo?(
            <img src={photo} alt="post" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          ):(
            <div style={{textAlign:"center",color:C.creamMuted,padding:"20px"}}>
              <div style={{fontSize:48,marginBottom:12}}>📸</div>
              <div style={{fontSize:15,fontWeight:600,color:C.creamDim}}>Add a Photo</div>
              <div style={{fontSize:12,marginTop:6}}>{postType==="round"?"Course, scenery, your crew":"Anything golf"}</div>
              {errors.photo&&<div style={{color:"#e07070",fontSize:12,marginTop:10}}>{errors.photo}</div>}
            </div>
          )}
          {photo&&(
            <button onClick={e=>{e.stopPropagation();setPhoto(null);}} style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,.65)",border:"none",borderRadius:"50%",width:32,height:32,color:C.cream,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>

        {/* Caption — always available */}
        <div style={{marginBottom:16}}>
          <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder={postType==="round"?"Add a caption… (optional)":"What's on your mind? (optional)"} rows={2} style={{...iStyle(false),resize:"none",fontFamily:"'DM Sans',sans-serif"}}/>
        </div>

        {/* Round-specific fields */}
        {postType==="round"&&(
          <div style={{background:"rgba(13,32,16,.85)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"20px 18px",display:"flex",flexDirection:"column",gap:16}}>
            <Field label="Course Name" error={errors.course}>
              <input value={course} onChange={e=>setCourse(e.target.value)} placeholder="e.g. Juliette Falls Golf Course" style={iStyle(errors.course)}/>
            </Field>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <Field label="Date" error={errors.date}>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...iStyle(errors.date),colorScheme:"dark"}}/>
              </Field>
              <Field label="Tee Time" error={errors.time}>
                <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{...iStyle(errors.time),colorScheme:"dark"}}/>
              </Field>
            </div>
            <Field label="Spots Needed (including you)" error={errors.spots}>
              <div style={{display:"flex",gap:10}}>
                {[2,3,4].map(n=>(
                  <button key={n} onClick={()=>setTotalSpots(String(n))} style={{flex:1,padding:"12px",borderRadius:10,cursor:"pointer",fontSize:14,fontWeight:700,transition:"all .2s",background:totalSpots===String(n)?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:totalSpots===String(n)?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:totalSpots===String(n)?C.cream:C.creamMuted}}>
                    {n} 🏌️
                  </button>
                ))}
              </div>
            </Field>
            <div style={{background:"rgba(5,14,6,.5)",border:"1px solid rgba(42,107,52,.2)",borderRadius:10,padding:"10px 14px",fontSize:12,color:C.creamMuted}}>
              You + <strong style={{color:C.creamDim}}>{(parseInt(totalSpots)||4)-1} more</strong> needed · Anyone on DTG can join
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MATCH POST CARD ──────────────────────────────────────────────────────────
function MatchPostCard({post, currentUser, onJoin, onLeave, onDelete, isOwner}){
  const [showCmts, setShowCmts] = useState(false);
  const [imgFull,  setImgFull]  = useState(false);
  const [cText,    setCText]    = useState("");

  const players = post.players||[];
  const totalSpots = post.totalSpots||4;
  const spotsLeft = totalSpots - players.length;
  const isFull = spotsLeft <= 0;
  const isIn = players.some(p=>p.uid===currentUser.uid);
  const isExpired = new Date(post.date+"T23:59:59") < new Date();
  const cmts = post.comments||[];
  const rxns = post.reactions||{};

  function handleReact(emoji){
    const curL=rxns[emoji]||[];
    const newL=curL.some(p=>p.uid===currentUser.uid)
      ?curL.filter(p=>p.uid!==currentUser.uid)
      :[...curL,{uid:currentUser.uid,displayName:currentUser.displayName||""}];
    onJoin({...post,reactions:{...rxns,[emoji]:newL}},true);
  }

  function submitComment(){
    if(!cText.trim())return;
    const newCmt={id:Date.now().toString(),uid:currentUser.uid,author:currentUser.displayName||"",text:cText.trim(),timestamp:new Date().toISOString()};
    onJoin({...post,comments:[...cmts,newCmt]},true);
    setCText("");
  }

  return(
    <div style={{background:"#0a1a0c",borderRadius:0,marginBottom:2,overflow:"hidden",borderTop:"1px solid rgba(42,107,52,.1)"}}>
      {/* Author row */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px 8px"}}>
        <Avatar name={post.authorName} photo={post.authorPhoto||null} size={36} radius={18}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:C.cream}}>{post.authorName}</div>
          <div style={{fontSize:11,color:C.creamMuted}}>{formatAgo(post.createdAt)}</div>
        </div>
        {isOwner&&!isExpired&&(
          <button onClick={()=>onDelete(post.id)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:18,cursor:"pointer",padding:"4px 8px"}}>⋯</button>
        )}
      </div>

      {/* Hero photo — full width, 4:5 ratio */}
      <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setImgFull(true)}>
        <img src={post.photo} alt="round" style={{width:"100%",aspectRatio:"4/5",objectFit:"cover",display:"block"}}/>
        {imgFull&&(
          <div onClick={e=>{e.stopPropagation();setImgFull(false);}} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.95)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,cursor:"pointer"}}>
            <img src={post.photo} alt="full" className="pop" style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",borderRadius:8}}/>
          </div>
        )}
        {/* Status overlay */}
        {(isFull||isExpired)&&(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:C.cream,letterSpacing:3,background:"rgba(0,0,0,.6)",borderRadius:12,padding:"12px 24px",border:"1px solid rgba(255,255,255,.15)"}}>
              {isExpired?"EXPIRED":"FULL ⛳"}
            </div>
          </div>
        )}
      </div>

      {/* Action row */}
      <div style={{padding:"10px 14px 4px",display:"flex",alignItems:"center",gap:10}}>
        {/* Reactions */}
        {EMOJIS.map(e=>{
          const count=rxns[e]?.length||0;
          const reacted=rxns[e]?.some(p=>p.uid===currentUser.uid);
          return(
            <button key={e} className={`emoji-btn${reacted?" active":""}`} onClick={()=>handleReact(e)}>
              {e}{count>0&&<span style={{fontSize:11,color:reacted?C.goldLight:C.creamMuted}}>{count}</span>}
            </button>
          );
        })}
        <div style={{flex:1}}/>
        <button className="bh" onClick={()=>setShowCmts(v=>!v)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:18,cursor:"pointer"}}>💬</button>
      </div>

      {/* Course + details — match posts only */}
      {post.type==="match"&&(
      <div style={{padding:"4px 14px 12px"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.cream,marginBottom:4}}>{post.course}</div>
        <div style={{fontSize:12,color:C.creamMuted,marginBottom:10}}>
          📅 {formatDateFull(post.date)} · ⏰ {formatTime(post.time)}
        </div>

        {/* Player avatars */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <div style={{display:"flex"}}>
            {players.map((p,i)=>(
              <div key={p.uid} style={{marginLeft:i>0?-8:0,zIndex:players.length-i}}>
                <Avatar name={p.displayName} photo={p.photo||null} size={30} radius={15}/>
              </div>
            ))}
            {/* Empty slots */}
            {Array.from({length:spotsLeft}).map((_,i)=>(
              <div key={"empty"+i} style={{marginLeft:players.length>0||i>0?-8:0,width:30,height:30,borderRadius:15,background:"rgba(42,107,52,.2)",border:"1.5px dashed rgba(77,184,96,.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:0}}>
                <span style={{fontSize:12,color:C.greenBright}}>+</span>
              </div>
            ))}
          </div>
          <div style={{fontSize:12,color:C.creamMuted}}>
            {isFull?"Full crew ⛳":`${spotsLeft} spot${spotsLeft!==1?"s":""} left`}
          </div>
        </div>

        {/* I'm In / Leave button */}
        {!isExpired&&(
          isIn?(
            <button className="bh" onClick={()=>onLeave(post)} style={{width:"100%",background:"rgba(42,107,52,.2)",border:"1px solid rgba(77,184,96,.3)",borderRadius:12,color:C.greenBright,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:.5}}>
              ✓ You're In · Tap to Leave
            </button>
          ):isFull?(
            <div style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,color:C.creamMuted,padding:"13px",fontSize:14,fontWeight:600,textAlign:"center"}}>
              Round Full
            </div>
          ):(
            <button className="bh" onClick={()=>onJoin(post,false)} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:12,color:"#0a1a0c",padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:.5,boxShadow:"0 4px 20px rgba(201,162,39,.3)"}}>
              I'm In ⛳
            </button>
          )
        )}
        {isExpired&&<div style={{fontSize:12,color:C.creamMuted,textAlign:"center",padding:"8px 0"}}>This round has passed</div>}
      </div>
      )}

      {/* Caption — regular posts and optional on match posts */}
      {post.caption&&post.type==="regular"&&(
        <div style={{padding:"0 14px 12px",fontSize:14,color:C.creamDim,lineHeight:1.6}}>
          <strong style={{color:C.cream}}>{post.authorName} </strong>{post.caption}
        </div>
      )}
      {post.caption&&post.type==="match"&&(
        <div style={{padding:"0 14px 8px",fontSize:13,color:C.creamMuted,fontStyle:"italic",paddingTop:0}}>"{post.caption}"</div>
      )}

      {/* Comments */}
      {showCmts&&(
        <div style={{borderTop:"1px solid rgba(42,107,52,.1)",padding:"12px 14px"}}>
          {cmts.length===0&&<div style={{fontSize:12,color:C.creamMuted,marginBottom:10}}>No comments yet</div>}
          {cmts.map(c=>(
            <div key={c.id} style={{display:"flex",gap:8,marginBottom:10,alignItems:"flex-start"}}>
              <Avatar name={c.author} size={26} radius={13}/>
              <div>
                <span style={{fontSize:12,fontWeight:600,color:C.cream}}>{c.author} </span>
                <span style={{fontSize:13,color:C.creamDim,lineHeight:1.5}}>{c.text}</span>
                <div style={{fontSize:10,color:C.creamMuted,marginTop:2}}>{formatAgo(c.timestamp)}</div>
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
            <Avatar name={currentUser.displayName||""} size={28} radius={14}/>
            <input value={cText} onChange={e=>setCText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitComment();}} placeholder="Add a comment…" style={{...iStyle(false),flex:1,padding:"8px 12px",fontSize:13}}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HOME SCREEN (Feed + My Groups tabs) ─────────────────────────────────────
function HomeScreen({currentUser, onSelectGroup}){
  const [tab,         setTab]         = useState("feed"); // feed | groups
  const [feedPosts,   setFeedPosts]   = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [groups,      setGroups]      = useState([]);
  const [groupsLoading,setGroupsLoading]=useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [showJoin,    setShowJoin]    = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [groupName,   setGroupName]   = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [working,     setWorking]     = useState(false);
  const [error,       setError]       = useState("");

  // Load global feed
  useEffect(()=>{
    const unsub=onSnapshot(doc(db,"dtg_feed","posts"),snap=>{
      setFeedPosts(snap.exists()?(snap.data().list||[]):[]);
      setFeedLoading(false);
    });
    return unsub;
  },[]);

  // Load user's groups
  useEffect(()=>{
    async function load(){
      const uDoc=await getDoc(doc(db,"users",currentUser.uid));
      const ids=uDoc.exists()?(uDoc.data().groupIds||[]):[];
      if(!ids.length){setGroupsLoading(false);return;}
      const gs=await Promise.all(ids.map(id=>getDoc(doc(db,"groups",id))));
      setGroups(gs.filter(g=>g.exists()).map(g=>({id:g.id,...g.data()})));
      setGroupsLoading(false);
    }
    load();
  },[currentUser.uid]);

  async function saveFeed(posts){await setDoc(doc(db,"dtg_feed","posts"),{list:posts});}

  async function handleNewPost(post){
    const updated=[post,...feedPosts].slice(0,500);
    await saveFeed(updated);
  }

  async function handleJoin(post, isUpdate=false){
    let updated;
    if(isUpdate){
      // reaction or comment update
      updated=feedPosts.map(p=>p.id===post.id?post:p);
    } else {
      // add player
      if(post.players?.some(p=>p.uid===currentUser.uid)) return;
      const newPlayer={uid:currentUser.uid,displayName:currentUser.displayName||"",photo:null,joinedAt:new Date().toISOString()};
      const updatedPost={...post,players:[...(post.players||[]),newPlayer],status:(post.players||[]).length+1>=post.totalSpots?"full":"open"};
      updated=feedPosts.map(p=>p.id===post.id?updatedPost:p);
    }
    await saveFeed(updated);
  }

  async function handleLeave(post){
    const updatedPost={...post,players:(post.players||[]).filter(p=>p.uid!==currentUser.uid),status:"open"};
    await saveFeed(feedPosts.map(p=>p.id===post.id?updatedPost:p));
  }

  async function handleDeletePost(postId){
    await saveFeed(feedPosts.filter(p=>p.id!==postId));
  }

  // Groups functions
  async function createGroup(){
    if(!groupName.trim())return;
    setWorking(true);setError("");
    const groupId=genGroupId();
    const inviteCode=genCode();
    const member={uid:currentUser.uid,displayName:currentUser.displayName||currentUser.email,email:currentUser.email,joinedAt:new Date().toISOString(),isAdmin:true};
    await setDoc(doc(db,"groups",groupId),{id:groupId,name:groupName.trim(),adminId:currentUser.uid,inviteCode,createdAt:new Date().toISOString(),membersList:[member]});
    await setDoc(doc(db,groupId,"schedule"),{list:[]});
    await setDoc(doc(db,groupId,"rounds"),{list:[]});
    await setDoc(doc(db,groupId,"pending"),{list:[]});
    const uDoc=await getDoc(doc(db,"users",currentUser.uid));
    const existing=uDoc.exists()?(uDoc.data().groupIds||[]):[];
    await setDoc(doc(db,"users",currentUser.uid),{displayName:currentUser.displayName||"",email:currentUser.email,groupIds:[...existing,groupId],updatedAt:new Date().toISOString()},{merge:true});
    const newGroup={id:groupId,name:groupName.trim(),adminId:currentUser.uid,inviteCode,membersList:[member]};
    setGroups(g=>[...g,newGroup]);
    setGroupName("");setShowCreate(false);setWorking(false);
    onSelectGroup(newGroup);
  }

  async function joinGroup(){
    const code=inviteInput.trim().toUpperCase();
    if(!code){setError("Enter an invite code");return;}
    setWorking(true);setError("");
    try {
      const q=query(collection(db,"groups"),where("inviteCode","==",code));
      const snap=await getDocs(q);
      if(snap.empty){setError("Invalid invite code");setWorking(false);return;}
      const gDoc=snap.docs[0];
      const group={id:gDoc.id,...gDoc.data()};
      const alreadyMember=(group.membersList||[]).some(m=>m.uid===currentUser.uid);
      if(!alreadyMember){
        const member={uid:currentUser.uid,displayName:currentUser.displayName||currentUser.email,email:currentUser.email,joinedAt:new Date().toISOString(),isAdmin:false};
        await setDoc(doc(db,"groups",group.id),{...group,membersList:[...(group.membersList||[]),member]});
        group.membersList=[...(group.membersList||[]),member];
      }
      const uDoc=await getDoc(doc(db,"users",currentUser.uid));
      const existing=uDoc.exists()?(uDoc.data().groupIds||[]):[];
      if(!existing.includes(group.id)){
        await setDoc(doc(db,"users",currentUser.uid),{groupIds:[...existing,group.id]},{merge:true});
      }
      setGroups(g=>[...g.filter(x=>x.id!==group.id),group]);
      setInviteInput("");setShowJoin(false);setWorking(false);
      onSelectGroup(group);
    } catch(e){setError("Something went wrong");setWorking(false);}
  }

  const sortedFeed=[...feedPosts].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

  return(
    <div style={{minHeight:"100vh",background:"#0a1a0c",fontFamily:"'DM Sans',sans-serif",color:C.cream}}>
      <style>{css}</style>

      {showNewPost&&(
        <CreateRoundPostModal
          currentUser={currentUser}
          onPost={handleNewPost}
          onClose={()=>setShowNewPost(false)}
        />
      )}

      {/* Header — Instagram style */}
      <div style={{position:"sticky",top:0,zIndex:100,background:"#0a1a0c",borderBottom:"1px solid rgba(42,107,52,.2)"}}>
        <div style={{maxWidth:520,margin:"0 auto",padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:700,letterSpacing:3,color:C.cream}}>DTG</div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            {tab==="feed"&&(
              <button className="bh" onClick={()=>setShowNewPost(true)} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Post Round</button>
            )}
            <button className="bh" onClick={()=>signOut(auth)} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,color:C.creamMuted,padding:"8px 12px",fontSize:11,cursor:"pointer"}}>Sign Out</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{maxWidth:520,margin:"0 auto",display:"flex",borderTop:"1px solid rgba(42,107,52,.15)"}}>
          {[{id:"feed",label:"⛳ Feed"},{id:"groups",label:"👥 My Groups"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"12px",background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,color:tab===t.id?C.goldLight:C.creamMuted,borderBottom:tab===t.id?`2px solid ${C.gold}`:"2px solid transparent",transition:"all .15s"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* FEED TAB */}
      {tab==="feed"&&(
        <div style={{maxWidth:520,margin:"0 auto"}}>
          {feedLoading&&(
            <div style={{textAlign:"center",padding:"60px"}}><Spinner/></div>
          )}
          {!feedLoading&&sortedFeed.length===0&&(
            <div style={{textAlign:"center",padding:"80px 24px",color:C.creamMuted}}>
              <div style={{fontSize:52,marginBottom:16}}>⛳</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:18,color:C.creamDim,marginBottom:8}}>No rounds posted yet</div>
              <div style={{fontSize:13,marginBottom:24}}>Be the first to post a round and find your crew</div>
              <button className="bh" onClick={()=>setShowNewPost(true)} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:12,color:"#0a1a0c",padding:"14px 28px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Post a Round</button>
            </div>
          )}
          {!feedLoading&&sortedFeed.map(post=>(
            <MatchPostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              onJoin={handleJoin}
              onLeave={handleLeave}
              onDelete={handleDeletePost}
              isOwner={post.authorUid===currentUser.uid}
            />
          ))}
        </div>
      )}

      {/* MY GROUPS TAB */}
      {tab==="groups"&&(
        <div style={{maxWidth:520,margin:"0 auto",padding:"20px 16px"}}>
          <div style={{fontSize:12,color:C.creamMuted,marginBottom:20,letterSpacing:1}}>Your private group leaderboards</div>

          {groupsLoading&&<div style={{textAlign:"center",padding:"40px"}}><Spinner/></div>}

          {!groupsLoading&&groups.map(g=>(
            <div key={g.id} className="rh" onClick={()=>onSelectGroup(g)} style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.2)",borderRadius:16,padding:"18px 20px",marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:46,height:46,borderRadius:12,background:`linear-gradient(135deg,${C.green},${C.greenLight})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>⛳</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.cream}}>{g.name}</div>
                <div style={{fontSize:11,color:C.creamMuted,marginTop:3}}>{(g.membersList||[]).length} members · Code: <strong style={{color:C.greenBright,letterSpacing:2}}>{g.inviteCode}</strong></div>
              </div>
              <div style={{color:C.creamMuted,fontSize:18}}>›</div>
            </div>
          ))}

          {!groupsLoading&&groups.length===0&&(
            <div style={{background:"rgba(13,32,16,.5)",border:"1px dashed rgba(42,107,52,.3)",borderRadius:16,padding:"36px",textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:32,marginBottom:10}}>👥</div>
              <div style={{fontSize:14,color:C.creamDim,marginBottom:4}}>No groups yet</div>
              <div style={{fontSize:12,color:C.creamMuted}}>Create one for your regular crew</div>
            </div>
          )}

          {!showCreate&&!showJoin&&(
            <div style={{display:"flex",gap:12,marginTop:8}}>
              <button className="bh" onClick={()=>{setShowCreate(true);setShowJoin(false);setError("");}} style={{flex:1,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:12,color:"#0a1a0c",padding:"13px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Create Group</button>
              <button className="bh" onClick={()=>{setShowJoin(true);setShowCreate(false);setError("");}} style={{flex:1,background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:12,color:C.cream,padding:"13px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Join with Code</button>
            </div>
          )}

          {showCreate&&(
            <div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.3)",borderRadius:16,padding:"22px",marginTop:8}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.cream,letterSpacing:2,marginBottom:16}}>CREATE A GROUP</div>
              <Field label="Group Name"><input value={groupName} onChange={e=>setGroupName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")createGroup();}} placeholder="e.g. Brocala Golf, Saturday Crew" style={iStyle(false)} autoFocus/></Field>
              {error&&<div style={{color:"#e07070",fontSize:12,marginTop:8}}>{error}</div>}
              <div style={{display:"flex",gap:10,marginTop:14}}>
                <button className="bh" onClick={()=>{setShowCreate(false);setError("");}} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:10,color:C.creamMuted,padding:"11px",fontSize:13,cursor:"pointer"}}>Cancel</button>
                <button className="bh" onClick={createGroup} disabled={!groupName.trim()||working} style={{flex:1,background:groupName.trim()?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:10,color:groupName.trim()?"#0a1a0c":C.creamMuted,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{working?<><Spinner/>Creating…</>:"Create ⛳"}</button>
              </div>
            </div>
          )}

          {showJoin&&(
            <div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.3)",borderRadius:16,padding:"22px",marginTop:8}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.cream,letterSpacing:2,marginBottom:16}}>JOIN A GROUP</div>
              <Field label="Invite Code"><input value={inviteInput} onChange={e=>setInviteInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")joinGroup();}} placeholder="6-character code" style={{...iStyle(false),textTransform:"uppercase",letterSpacing:4,textAlign:"center",fontSize:18}} autoFocus maxLength={6}/></Field>
              {error&&<div style={{color:"#e07070",fontSize:12,marginTop:8}}>{error}</div>}
              <div style={{display:"flex",gap:10,marginTop:14}}>
                <button className="bh" onClick={()=>{setShowJoin(false);setError("");}} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:10,color:C.creamMuted,padding:"11px",fontSize:13,cursor:"pointer"}}>Cancel</button>
                <button className="bh" onClick={joinGroup} disabled={inviteInput.length<6||working} style={{flex:1,background:inviteInput.length>=6?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:10,color:inviteInput.length>=6?"#0a1a0c":C.creamMuted,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{working?<><Spinner/>Joining…</>:"Join"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function DTG(){
  const [user,         setUser]         = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [currentGroup, setCurrentGroup] = useState(null);

  useEffect(()=>{
    return onAuthStateChanged(auth,(u)=>{
      setUser(u);
      setAuthLoading(false);
    });
  },[]);

  if(authLoading){
    return(
      <div style={{minHeight:"100vh",background:"#0a1a0c",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
        <style>{css}</style>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:52,marginBottom:16}}>⛳</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,letterSpacing:4,color:"#f5f0e8"}}>DTG</div>
          <div style={{fontSize:11,color:"#7a7060",letterSpacing:5,marginTop:4,textTransform:"uppercase"}}>Down To Golf</div>
          <div style={{marginTop:20}}><Spinner/></div>
        </div>
      </div>
    );
  }

  if(!user) return <AuthScreen/>;
  if(!currentGroup) return <HomeScreen currentUser={user} onSelectGroup={setCurrentGroup}/>;
  return <GroupApp currentUser={user} group={currentGroup} onLeaveGroup={()=>setCurrentGroup(null)}/>;
}

function AnnouncementBanner({announcement}){
  const [dismissedAt,setDismissedAt]=useState(null);
  if(!announcement?.text)return null;
  if(dismissedAt===announcement.postedAt)return null;
  const typeStyles={info:{bg:"rgba(26,77,36,.18)",border:"rgba(77,184,96,.3)",icon:"📢",color:C.greenBright},warning:{bg:"rgba(201,162,39,.12)",border:"rgba(201,162,39,.35)",icon:"⚠️",color:C.goldLight},urgent:{bg:"rgba(192,64,64,.14)",border:"rgba(192,64,64,.35)",icon:"🚨",color:"#e07070"}};
  const s=typeStyles[announcement.type||"info"];
  return(
    <div style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:14,padding:"14px 16px",marginBottom:24,display:"flex",alignItems:"flex-start",gap:12}}>
      <span style={{fontSize:20,flexShrink:0,marginTop:1}}>{s.icon}</span>
      <div style={{flex:1}}>
        {announcement.title&&<div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color:s.color,letterSpacing:1,marginBottom:4}}>{announcement.title}</div>}
        <div style={{fontSize:14,color:C.cream,lineHeight:1.6}}>{announcement.text}</div>
        <div style={{fontSize:11,color:C.creamMuted,marginTop:5}}>— {formatAgo(announcement.postedAt)}</div>
      </div>
      <button onClick={()=>setDismissedAt(announcement.postedAt)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:16,cursor:"pointer",flexShrink:0}}>✕</button>
    </div>
  );
}

// ─── ROUND CARD ───────────────────────────────────────────────────────────────
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
    <div style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
      {photo&&(<><img src={photo} alt="round" onClick={()=>setImgFull(true)} style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block",cursor:"pointer"}}/>{imgFull&&<div onClick={()=>setImgFull(false)} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}><img src={photo} alt="full" className="pop" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12,objectFit:"contain"}}/></div>}</>)}
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
            </div>
            {round.notes&&<div style={{fontSize:12,color:C.creamMuted,marginTop:6,fontStyle:"italic",borderLeft:`2px solid ${C.green}`,paddingLeft:10}}>{round.notes}</div>}
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,color:C.goldLight,lineHeight:1}}>{round.score}</div>
            <div style={{fontSize:10,color:C.creamMuted,letterSpacing:1,marginTop:2}}>STROKES</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {EMOJIS.map(e=>{const count=rxns?.[e]?.length||0,names=rxns?.[e]||[];return(<button key={e} className={`emoji-btn${count>0?" active":""}`} onClick={()=>{setReactEmoji(reactEmoji===e?null:e);setReactWho("");}}>{e}{count>0&&<span style={{fontSize:11,color:C.goldLight}}>{count}</span>}{names.length>0&&<span style={{fontSize:10,color:C.creamMuted,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names.join(", ")}</span>}</button>);})}
          <div style={{flex:1}}/>
          <button className="bh" onClick={()=>setShowCmts(v=>!v)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer"}}>💬 {cCount>0?`${cCount} comment${cCount!==1?"s":""}`:"Comment"}</button>
          {!photo&&<><button className="bh" onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer"}}>📷 Photo</button><input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/></>}
          {isAdmin&&<><button className="bh" onClick={onEdit} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",borderRadius:7,color:C.greenBright,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>EDIT</button><button className="bh" onClick={onDelete} style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.25)",borderRadius:7,color:"#c07070",padding:"4px 10px",fontSize:11,cursor:"pointer"}}>DEL</button></>}
        </div>
        {reactEmoji&&(<div style={{marginTop:10,padding:"10px 12px",background:"rgba(5,14,6,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:14}}>{reactEmoji}</span><select value={reactWho} onChange={e=>setReactWho(e.target.value)} style={{...iStyle(false),flex:1,minWidth:120,padding:"6px 10px",fontSize:13,appearance:"none"}}><option value="">Select name…</option>{members.map(m=><option key={m} value={m}>{m}{rxns?.[reactEmoji]?.includes(m)?" (remove)":""}</option>)}</select><button className="bh" onClick={submitReact} disabled={!reactWho} style={{background:`linear-gradient(135deg,${C.green},${C.greenLight})`,border:"none",borderRadius:8,color:C.cream,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:reactWho?"pointer":"not-allowed",opacity:reactWho?1:.5}}>{rxns?.[reactEmoji]?.includes(reactWho)?"Remove":"React"}</button></div>)}
        {deleteConfirm&&(<div style={{marginTop:10,padding:"11px 14px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:13,color:"#c07070"}}>Delete this round?</span><div style={{display:"flex",gap:8}}><button className="bh" onClick={onDeleteCancel} style={{background:"rgba(255,255,255,.06)",border:"none",borderRadius:7,color:C.creamMuted,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Cancel</button><button className="bh" onClick={onDeleteConfirm} style={{background:"rgba(192,64,64,.25)",border:"none",borderRadius:7,color:"#e08080",padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>Delete</button></div></div>)}
        {showCmts&&(<div style={{marginTop:14,paddingTop:14,borderTop:"1px solid rgba(42,107,52,.15)"}}>{cmts?.length===0&&<div style={{fontSize:12,color:C.creamMuted,marginBottom:12}}>No comments yet 🗑️</div>}{cmts?.map(c=>(<div key={c.id} className="comment-item" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><div style={{width:22,height:22,borderRadius:6,background:avatarColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(c.author)}</div><span style={{fontSize:12,fontWeight:600,color:C.cream}}>{c.author}</span><span style={{fontSize:10,color:C.creamMuted}}>{formatAgo(c.timestamp)}</span></div><div style={{fontSize:13,color:C.creamDim,paddingLeft:30,lineHeight:1.5}}>{c.text}</div></div>{isAdmin&&<button className="bh" onClick={()=>onDeleteComment(c.id)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:10,cursor:"pointer"}}>✕</button>}</div>))}<div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}><select value={cAuthor} onChange={e=>setCAuthor(e.target.value)} style={{...iStyle(false),width:"auto",flex:"0 0 140px",padding:"8px 10px",fontSize:13,appearance:"none",cursor:"pointer"}}><option value="">Your name…</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select><input value={cText} onChange={e=>setCText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitComment();}} placeholder="Say something..." style={{...iStyle(false),flex:1,minWidth:120,padding:"8px 12px",fontSize:13}}/><button className="bh" onClick={submitComment} disabled={!cText.trim()||!cAuthor} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:9,color:"#0a1a0c",padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:cText.trim()&&cAuthor?1:.5}}>Post</button></div></div>)}
      </div>
    </div>
  );
}

// ─── SCHEDULE CARD ────────────────────────────────────────────────────────────
function ScheduleCard({evt,members,onRsvp,isAdmin,onDelete,onEdit,compact=false}){
  const [rsvpOpen,setRsvpOpen]=useState(false);
  const [who,setWho]=useState("");
  const [delConfirm,setDelConfirm]=useState(false);
  const days=daysUntil(evt.date),isPast=days<0;
  const dLabel=days===0?"TODAY":days===1?"TOMORROW":isPast?`${Math.abs(days)}d ago`:`${days} DAYS`;
  const dColor=days<=7&&!isPast?C.goldLight:isPast?C.creamMuted:C.greenBright;
  function doRsvp(){if(!who)return;onRsvp(evt.id,who);setWho("");setRsvpOpen(false);}
  return(
    <div style={{background:compact?"rgba(13,32,16,.7)":"rgba(13,32,16,.85)",border:compact?"1px solid rgba(42,107,52,.22)":"1px solid rgba(77,184,96,.25)",borderRadius:compact?12:16,padding:compact?"14px 16px":"20px 22px",marginBottom:compact?8:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:compact?15:17,fontWeight:700,color:C.cream}}>{evt.course}</div>
            {!isPast&&<span style={{fontSize:10,fontWeight:700,letterSpacing:1,background:days<=7?"rgba(201,162,39,.15)":"rgba(26,107,52,.3)",border:days<=7?`1px solid rgba(201,162,39,.35)`:`1px solid rgba(77,184,96,.3)`,borderRadius:4,padding:"2px 8px",color:dColor}}>{dLabel}</span>}
          </div>
          <div style={{fontSize:13,color:C.creamDim,lineHeight:2}}><span style={{marginRight:16}}>📅 {formatDateFull(evt.date)}</span><span>⏰ {formatTime(evt.time)}</span></div>
          {evt.notes&&<div style={{fontSize:12,color:C.creamMuted,marginTop:6,fontStyle:"italic",borderLeft:`2px solid ${C.green}`,paddingLeft:10}}>{evt.notes}</div>}
          <div style={{marginTop:10}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{evt.rsvps?.length?`${evt.rsvps.length} Going`:"No RSVPs yet"}</div>{(evt.rsvps||[]).map(n=><span key={n} className="rsvp-chip">{n}</span>)}</div>
        </div>
        <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
          {!isPast&&<button className="bh" onClick={()=>{setRsvpOpen(v=>!v);setDelConfirm(false);}} style={{background:rsvpOpen?`rgba(42,107,52,.4)`:`linear-gradient(135deg,${C.green},${C.greenLight})`,border:`1px solid rgba(77,184,96,.4)`,borderRadius:9,color:C.cream,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{rsvpOpen?"↑ Close":"✓ RSVP"}</button>}
          {isAdmin&&<div style={{display:"flex",gap:6}}><button className="bh" onClick={()=>{onEdit(evt);setDelConfirm(false);setRsvpOpen(false);}} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",borderRadius:7,color:C.greenBright,padding:"5px 10px",fontSize:10,cursor:"pointer",fontWeight:600}}>EDIT</button><button className="bh" onClick={()=>setDelConfirm(v=>!v)} style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.2)",borderRadius:7,color:"#c07070",padding:"5px 10px",fontSize:10,cursor:"pointer"}}>DEL</button></div>}
        </div>
      </div>
      {delConfirm&&(<div style={{marginTop:12,padding:"11px 14px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:13,color:"#c07070"}}>Delete this scheduled round?</span><div style={{display:"flex",gap:8}}><button className="bh" onClick={()=>setDelConfirm(false)} style={{background:"rgba(255,255,255,.06)",border:"none",borderRadius:7,color:C.creamMuted,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Cancel</button><button className="bh" onClick={()=>{onDelete(evt.id);setDelConfirm(false);}} style={{background:"rgba(192,64,64,.25)",border:"none",borderRadius:7,color:"#e08080",padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>Delete</button></div></div>)}
      {rsvpOpen&&(<div style={{marginTop:14,padding:"14px",background:"rgba(5,14,6,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:12}}><div style={{fontSize:12,color:C.creamDim,marginBottom:10}}>Who's in?</div>{members.filter(m=>!(evt.rsvps||[]).includes(m)).length===0?<div style={{fontSize:12,color:C.creamMuted}}>Everyone's in! 🎉</div>:<div style={{display:"flex",gap:10}}><select value={who} onChange={e=>setWho(e.target.value)} style={{...iStyle(false),appearance:"none",cursor:"pointer",flex:1}}><option value="">Select your name…</option>{members.filter(m=>!(evt.rsvps||[]).includes(m)).map(m=><option key={m} value={m}>{m}</option>)}</select><button className="bh" onClick={doRsvp} disabled={!who} style={{background:who?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:10,color:who?"#0a1a0c":C.creamMuted,padding:"11px 20px",fontSize:13,fontWeight:700,cursor:who?"pointer":"not-allowed",whiteSpace:"nowrap"}}>I'm In ⛳</button></div>}{(evt.rsvps||[]).length>0&&<div style={{fontSize:11,color:C.creamMuted,marginTop:8}}>Already in: {(evt.rsvps||[]).join(", ")}</div>}</div>)}
    </div>
  );
}

// ─── PLAYER PROFILE ───────────────────────────────────────────────────────────
function PlayerProfile({playerName,allRounds,rankings,members,profile,onBack}){
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
          <Avatar name={playerName} photo={profile?.profilePhoto||null} size={72} radius={16}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,color:C.cream}}>{playerName}</div>
            {profile?.homeCourse&&<div style={{fontSize:12,color:C.greenBright,marginTop:3}}>🏌️ {profile.homeCourse}</div>}
            <div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>{rank===0&&stats?.totalRounds>0?<span style={{color:C.goldLight}}>👑 #1 in the group</span>:rank>=0&&stats?.totalRounds>0?`#${rank+1} on the board`:"No rounds yet"}</div>
            {profile?.bio&&<div style={{fontSize:13,color:C.creamDim,marginTop:8,lineHeight:1.6,fontStyle:"italic"}}>"{profile.bio}"</div>}
          </div>
          {stats&&<div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,color:C.goldLight}}>{stats.avg.toFixed(1)}</div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1}}>AVG</div>{stats.handicap&&<div style={{fontSize:11,color:C.creamDim,marginTop:3}}>HCP <strong style={{color:C.greenBright}}>{stats.handicap}</strong></div>}</div>}
        </div>
      </div>
      {!stats&&<div style={{textAlign:"center",padding:"40px",color:C.creamMuted}}><div style={{fontSize:32,marginBottom:12}}>🏌️</div>No rounds yet for {playerName}</div>}
      {stats&&(<>
        <div style={{display:"flex",gap:10,marginBottom:12}}><StatBox label="Rounds" value={stats.totalRounds} highlight/><StatBox label="Best" value={stats.best} sub="18H equiv"/><StatBox label="Worst" value={stats.worst} sub="18H equiv"/></div>
        <div style={{display:"flex",gap:10,marginBottom:20}}><StatBox label="This Year" value={stats.roundsThisYear} sub={`${stats.roundsLastYear} last year`}/><StatBox label="Top Course" value={stats.topCourse?stats.topCourse[0]:"—"} sub={stats.topCourse?`${stats.topCourse[1]} rounds`:""}/><StatBox label="Fav Partner" value={stats.topPartner?stats.topPartner[0].split(" ")[0]:"—"} sub={stats.topPartner?`${stats.topPartner[1]} rounds`:""}/></div>
        <div style={{background:trend.bg,border:`1px solid ${trend.border}`,borderRadius:14,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Scoring Trend</div><div style={{fontSize:15,fontWeight:600,color:trend.color}}>{trend.label}</div></div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:36}}>{stats.trendLastFive.map((s,i)=>{const mn=Math.min(...stats.trendLastFive),mx=Math.max(...stats.trendLastFive),r=mx-mn||1,h=8+((mx-s)/r)*28;return<div key={i} style={{width:8,borderRadius:3,background:trend.color,opacity:.5+(i*.1),height:`${h}px`}}/>;})}</div>
        </div>
        <div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"18px 20px",marginBottom:20}}>
          <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Rounds Per Month (Last 6)</div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",height:80}}>{mE.map(([k,cnt])=>{const pct=(cnt/maxM)*100;return(<div key={k} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,height:"100%",justifyContent:"flex-end"}}><div style={{fontSize:11,color:C.goldLight,fontWeight:600,opacity:cnt>0?1:0}}>{cnt}</div><div style={{width:"100%",borderRadius:6,background:cnt>0?"rgba(42,107,52,.5)":"rgba(26,77,36,.15)",border:cnt>0?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.2)",height:`${Math.max(pct,4)}%`,transition:"height .4s"}}/><div style={{fontSize:10,color:C.creamMuted}}>{monthLabel(k)}</div></div>);})}</div>
        </div>
        {h2h.length>0&&(<div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"18px 20px",marginBottom:20}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Head-to-Head</div>{h2h.map(([opp,rec])=>{const tot=rec.wins+rec.losses+rec.ties,wp=Math.round((rec.wins/tot)*100);return(<div key={opp} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,paddingBottom:12,borderBottom:"1px solid rgba(42,107,52,.15)"}}><div style={{width:32,height:32,borderRadius:8,background:avatarColor(opp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(opp)}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:C.cream,marginBottom:4}}>{opp}</div><div style={{height:5,borderRadius:3,background:"rgba(192,64,64,.3)",overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:"linear-gradient(90deg,#2a8a3a,#4db860)",width:`${wp}%`,transition:"width .5s"}}/></div></div><div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:rec.wins>rec.losses?C.greenBright:"#e07070"}}>{rec.wins}W – {rec.losses}L{rec.ties>0?` – ${rec.ties}T`:""}</div><div style={{fontSize:10,color:C.creamMuted}}>{tot} matchups</div></div></div>);})}
        </div>)}
      </>)}
    </div>
  );
}

// ─── CADDY ────────────────────────────────────────────────────────────────────
function CaddyView({members,bags,saveBags}){
  const [subView,   setSubView]   = useState("calc");
  const [player,    setPlayer]    = useState(()=>localStorage.getItem("caddy_player")||"");
  const [yardage,   setYardage]   = useState("");
  const [wind,      setWind]      = useState(()=>localStorage.getItem("caddy_wind")||"none");
  const [windMph,   setWindMph]   = useState(()=>localStorage.getItem("caddy_windMph")||"");
  const [temp,      setTemp]      = useState(()=>localStorage.getItem("caddy_temp")||"70");
  const [lie,       setLie]       = useState(()=>localStorage.getItem("caddy_lie")||"fairway");
  const [greenCond, setGreenCond] = useState(()=>localStorage.getItem("caddy_green")||"normal");
  const [shotType,  setShotType]  = useState(()=>localStorage.getItem("caddy_shotType")||"carry");
  const [result,    setResult]    = useState(null);
  const [bagPlayer, setBagPlayer] = useState("");
  const [bagDists,  setBagDists]  = useState({});
  const [bagSaved,  setBagSaved]  = useState(false);

  function save(key,val){localStorage.setItem(key,val);}
  function getRollout(club,green){const base=(()=>{if(WEDGE_NAMES.includes(club))return 0;if(["9 Iron","8 Iron"].includes(club))return 0.05;if(["7 Iron","6 Iron","5 Iron"].includes(club))return 0.07;if(["4 Iron","3 Iron"].includes(club))return 0.09;if(["4 Hybrid","5 Hybrid"].includes(club))return 0.10;if(["3 Wood","5 Wood"].includes(club))return 0.13;if(club==="Driver")return 0.15;return 0.07;})();if(green==="firm")return base*1.5;if(green==="soft")return base*0.3;return base;}
  function loadBag(name){setBagPlayer(name);const existing=bags[name.trim().toLowerCase()]||{};const filled={};CLUBS.forEach(c=>{filled[c]=existing[c]||"";});setBagDists(filled);setBagSaved(false);}
  async function saveBag(){if(!bagPlayer)return;const key=bagPlayer.trim().toLowerCase();const cleaned={};CLUBS.forEach(c=>{if(bagDists[c]&&!isNaN(bagDists[c])&&+bagDists[c]>0)cleaned[c]=+bagDists[c];});await saveBags({...bags,[key]:cleaned});setBagSaved(true);setTimeout(()=>setBagSaved(false),2500);}
  function calculate(){if(!player||!yardage)return;const key=player.trim().toLowerCase();const bag=bags[key]||{};if(!Object.keys(bag).length){setResult({error:true,name:player});return;}const adj=calcAdjusted(+yardage,wind,windMph,temp,lie);const ranked=CLUBS.filter(c=>bag[c]).map(c=>{const carry=bag[c],rollPct=getRollout(c,greenCond),rollYds=Math.round(carry*rollPct),total=carry+rollYds,effectiveDist=shotType==="total"?total:carry;return{club:c,carry,rollYds,total,diff:Math.abs(effectiveDist-adj),over:effectiveDist-adj};}).sort((a,b)=>a.diff-b.diff);const topClub=ranked[0]?.club;const wedgeTip=WEDGE_NAMES.includes(topClub)?WEDGE_TIPS[topClub]:null;const betweenClubs=ranked.length>=2&&Math.abs(ranked[0].diff-ranked[1].diff)<=5;setResult({adj,raw:+yardage,ranked,player,wind,windMph,temp,lie,greenCond,wedgeTip,topClub,shotType,betweenClubs});}
  const windLabels={none:"No Wind",headwind:"Headwind",tailwind:"Tailwind",crosswind:"Crosswind"};
  const lieLabels={fairway:"Fairway",rough:"Rough",sand:"Sand"};

  return(
    <div className="fi">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div><div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:600,color:C.cream}}>🏌️ CADDY</div><div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>Club recommendations based on your bag</div></div>
        <div style={{display:"flex",gap:8}}>
          <button className="bh" onClick={()=>setSubView("calc")} style={{background:subView==="calc"?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(13,32,16,.7)",border:subView==="calc"?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",borderRadius:9,color:subView==="calc"?C.cream:C.creamMuted,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Calculate</button>
          <button className="bh" onClick={()=>setSubView("bag")} style={{background:subView==="bag"?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(13,32,16,.7)",border:subView==="bag"?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",borderRadius:9,color:subView==="bag"?C.cream:C.creamMuted,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>My Bag</button>
        </div>
      </div>

      {subView==="calc"&&(
        <div>
          <div style={{background:"rgba(13,32,16,.85)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"22px 20px",marginBottom:16}}>
            <div style={{marginBottom:16}}><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Your Name</label><select value={player} onChange={e=>{setPlayer(e.target.value);save("caddy_player",e.target.value);setResult(null);}} style={{...iStyle(false),appearance:"none",cursor:"pointer"}}><option value="">Select player…</option>{members.map(m=><option key={m} value={m}>{m}{bags[m.trim().toLowerCase()]?"":" (no bag)"}</option>)}</select></div>
            <div style={{marginBottom:16}}><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Yardage to Pin</label><input type="number" value={yardage} onChange={e=>{setYardage(e.target.value);setResult(null);}} placeholder="e.g. 160" min="1" max="400" style={{...iStyle(false),fontSize:20,fontFamily:"'Cinzel',serif",textAlign:"center",letterSpacing:2}}/></div>
            <div style={{marginBottom:16}}><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Shot Goal</label><div style={{display:"flex",gap:10}}>{[{val:"carry",label:"🎯 Carry Only",desc:"Land it here"},{val:"total",label:"📏 Carry + Roll",desc:"Total distance"}].map(t=>(<button key={t.val} onClick={()=>{setShotType(t.val);save("caddy_shotType",t.val);setResult(null);}} style={{flex:1,padding:"10px 10px",borderRadius:10,cursor:"pointer",transition:"all .2s",textAlign:"left",background:shotType===t.val?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:shotType===t.val?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:shotType===t.val?C.cream:C.creamMuted}}><div style={{fontSize:13,fontWeight:600}}>{t.label}</div><div style={{fontSize:10,marginTop:3,opacity:.8}}>{t.desc}</div></button>))}</div></div>
            <div style={{marginBottom:16}}><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Wind</label><div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>{["none","headwind","tailwind","crosswind"].map(w=>(<button key={w} onClick={()=>{setWind(w);save("caddy_wind",w);setResult(null);}} style={{flex:1,minWidth:70,padding:"8px 6px",borderRadius:9,cursor:"pointer",fontSize:11,fontWeight:600,transition:"all .2s",background:wind===w?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:wind===w?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:wind===w?C.cream:C.creamMuted}}>{w==="none"?"🚫 None":w==="headwind"?"⬆️ Head":w==="tailwind"?"⬇️ Tail":"↔️ Cross"}</button>))}</div>{wind!=="none"&&(<div style={{display:"flex",alignItems:"center",gap:10}}><input type="number" value={windMph} onChange={e=>{setWindMph(e.target.value);save("caddy_windMph",e.target.value);setResult(null);}} placeholder="mph" min="1" max="50" style={{...iStyle(false),width:100,textAlign:"center",fontSize:16}}/><span style={{color:C.creamMuted,fontSize:13}}>mph {windLabels[wind].toLowerCase()}</span></div>)}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
              <div><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Temperature (°F)</label><input type="number" value={temp} onChange={e=>{setTemp(e.target.value);save("caddy_temp",e.target.value);setResult(null);}} placeholder="70" min="20" max="115" style={{...iStyle(false),textAlign:"center",fontSize:15}}/></div>
              <div><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Lie</label><div style={{display:"flex",flexDirection:"column",gap:6}}>{["fairway","rough","sand"].map(l=>(<button key={l} onClick={()=>{setLie(l);save("caddy_lie",l);setResult(null);}} style={{padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .2s",textAlign:"left",background:lie===l?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:lie===l?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:lie===l?C.cream:C.creamMuted}}>{l==="fairway"?"🟢 Fairway":l==="rough"?"🌿 Rough":"🟡 Sand"}</button>))}</div></div>
            </div>
            <div style={{marginBottom:20}}><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Green Conditions</label><div style={{display:"flex",gap:10}}>{[{val:"firm",icon:"☀️",label:"Firm",note:"More roll"},{val:"normal",icon:"⛳",label:"Normal",note:"Standard"},{val:"soft",icon:"🌧️",label:"Soft",note:"Less roll"}].map(g=>(<button key={g.val} onClick={()=>{setGreenCond(g.val);save("caddy_green",g.val);setResult(null);}} style={{flex:1,padding:"10px 8px",borderRadius:10,cursor:"pointer",transition:"all .2s",textAlign:"center",background:greenCond===g.val?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:greenCond===g.val?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:greenCond===g.val?C.cream:C.creamMuted}}><div style={{fontSize:16,marginBottom:3}}>{g.icon}</div><div style={{fontSize:12,fontWeight:600}}>{g.label}</div><div style={{fontSize:10,opacity:.75,marginTop:2}}>{g.note}</div></button>))}</div></div>
            <button className="bh" onClick={calculate} disabled={!player||!yardage} style={{width:"100%",background:player&&yardage?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:12,color:player&&yardage?"#0a1a0c":C.creamMuted,padding:"15px",fontSize:15,fontWeight:700,cursor:player&&yardage?"pointer":"not-allowed",letterSpacing:1,fontFamily:"'Cinzel',sans-serif",boxShadow:player&&yardage?"0 6px 24px rgba(201,162,39,.25)":"none",transition:"all .2s"}}>GET CLUB RECOMMENDATION 🏌️</button>
          </div>

          {result&&result.error&&(<div style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.3)",borderRadius:14,padding:"20px",textAlign:"center"}}><div style={{fontSize:20,marginBottom:8}}>🎒</div><div style={{color:"#e07070",fontSize:14,fontWeight:600}}>{result.name} hasn't set up their bag yet</div><div style={{color:C.creamMuted,fontSize:12,marginTop:6}}>Switch to <strong>My Bag</strong> tab to enter distances</div></div>)}

          {result&&!result.error&&(
            <div className="fi">
              <div style={{background:"linear-gradient(135deg,rgba(26,77,36,.25),rgba(201,162,39,.06))",border:"1px solid rgba(201,162,39,.2)",borderRadius:14,padding:"16px 20px",marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
                  <div><div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:C.creamMuted,letterSpacing:1,marginBottom:4}}>ADJUSTED DISTANCE</div><div style={{fontFamily:"'Cinzel',serif",fontSize:36,fontWeight:700,color:C.goldLight,lineHeight:1}}>{result.adj} <span style={{fontSize:16,color:C.creamDim}}>yards</span></div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:11,color:C.creamMuted,marginBottom:4}}>Playing for</div><div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.cream}}>{result.player}</div></div>
                </div>
                <div style={{borderTop:"1px solid rgba(42,107,52,.2)",paddingTop:12,display:"flex",flexDirection:"column",gap:6}}>
                  {(()=>{const lines=[];const mph=parseFloat(result.windMph)||0;const t=parseFloat(result.temp)||70;const tempDiff=Math.round(Math.abs((t-70)*0.15));const windAdj=result.wind==="headwind"?Math.round(result.raw*0.01*mph):result.wind==="tailwind"?Math.round(result.raw*0.008*mph):result.wind==="crosswind"?Math.round(result.raw*0.005*mph):0;
                  lines.push({label:"📍 Raw distance",val:`${result.raw} yds`,neutral:true});
                  if(result.wind!=="none"&&mph>0){if(result.wind==="headwind")lines.push({label:`💨 Headwind ${mph}mph`,val:`+${windAdj} yds`,note:"fighting the wind",up:true});if(result.wind==="tailwind")lines.push({label:`💨 Tailwind ${mph}mph`,val:`−${windAdj} yds`,note:"wind helps",up:false});if(result.wind==="crosswind")lines.push({label:`💨 Crosswind ${mph}mph`,val:`+${windAdj} yds`,note:"slight extra needed",up:true});}
                  if(t!==70){if(t>70)lines.push({label:`🌡️ ${t}°F (hot)`,val:`−${tempDiff} yds`,note:"ball carries farther",up:false});else lines.push({label:`🌡️ ${t}°F (cold)`,val:`+${tempDiff} yds`,note:"ball falls short",up:true});}
                  if(result.lie==="rough")lines.push({label:"🌿 Rough lie",val:`+${Math.round(result.raw*0.10)} yds`,note:"rough kills carry",up:true});
                  if(result.lie==="sand")lines.push({label:"🟡 Sand lie",val:`+${Math.round(result.raw*0.15)} yds`,note:"sand kills carry",up:true});
                  if(result.greenCond!=="normal")lines.push({label:result.greenCond==="firm"?"☀️ Firm greens":"🌧️ Soft greens",val:result.greenCond==="firm"?"+50% roll":"-70% roll",note:result.greenCond==="firm"?"more runout":"checks up",up:result.greenCond==="firm"});
                  return lines.map((l,i)=>(<div key={i} style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}><span style={{fontSize:12,color:C.creamMuted,minWidth:160}}>{l.label}</span><span style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color:l.neutral?C.creamDim:l.up?C.goldLight:C.greenBright,minWidth:60}}>{l.val}</span>{l.note&&<span style={{fontSize:11,color:C.creamMuted,fontStyle:"italic"}}>— {l.note}</span>}</div>));})()}
                  <div style={{borderTop:"1px solid rgba(42,107,52,.2)",marginTop:4,paddingTop:8,display:"flex",alignItems:"baseline",gap:8}}>
                    <span style={{fontSize:12,color:C.creamMuted,minWidth:160}}>🎯 Swing for</span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.goldLight}}>{result.adj} yds</span>
                    <span style={{fontSize:11,color:C.creamMuted,fontStyle:"italic"}}>— {result.shotType==="total"?"total including rollout":"carry distance"}</span>
                  </div>
                </div>
              </div>

              {result.betweenClubs&&result.ranked.length>=2&&(<div style={{background:"rgba(201,162,39,.1)",border:"1px solid rgba(201,162,39,.3)",borderRadius:12,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:10}}><span style={{fontSize:18,flexShrink:0}}>⚖️</span><div><div style={{fontSize:13,fontWeight:600,color:C.goldLight,marginBottom:3}}>You're between clubs</div><div style={{fontSize:12,color:C.creamDim,lineHeight:1.6}}><strong style={{color:C.cream}}>{result.ranked[0].club}</strong> and <strong style={{color:C.cream}}>{result.ranked[1].club}</strong> are within 5 yards of each other. When in doubt take the longer club and make a smooth swing.</div></div></div>)}

              <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>All Options — {result.shotType==="total"?"Total (Carry + Roll)":"Carry"} · Closest First</div>
              {result.ranked.map((item,i)=>{const isTop=i===0,isOver=item.over>0,diff=Math.abs(item.over),isWedge=WEDGE_NAMES.includes(item.club);return(<div key={item.club} style={{background:isTop?"linear-gradient(135deg,rgba(201,162,39,.1),rgba(26,77,36,.2))":"rgba(13,32,16,.7)",border:isTop?"1px solid rgba(201,162,39,.3)":"1px solid rgba(42,107,52,.15)",borderRadius:12,padding:"12px 16px",marginBottom:7,display:"flex",alignItems:"center",gap:12}}><div style={{width:22,textAlign:"center",flexShrink:0,fontFamily:"'Cinzel',serif",fontSize:12,color:isTop?C.goldLight:C.creamMuted,fontWeight:700}}>{i+1}</div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:isTop?15:13,color:isTop?C.goldLight:C.cream,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{item.club}{isTop&&<span style={{fontSize:9,background:"rgba(201,162,39,.15)",border:"1px solid rgba(201,162,39,.3)",borderRadius:4,padding:"2px 6px",color:C.gold,letterSpacing:1}}>BEST FIT</span>}{isWedge&&<span style={{fontSize:9,background:"rgba(42,107,52,.2)",border:"1px solid rgba(77,184,96,.25)",borderRadius:4,padding:"2px 6px",color:C.greenBright,letterSpacing:1}}>WEDGE</span>}</div>{result.shotType==="total"?(<div style={{fontSize:11,color:C.creamMuted,marginTop:3}}>Carry <strong style={{color:C.creamDim}}>{item.carry}</strong> + Roll <strong style={{color:C.creamDim}}>{item.rollYds}</strong> = <strong style={{color:isTop?C.goldLight:C.creamDim}}>{item.total} yds</strong></div>):(<div style={{fontSize:11,color:C.creamMuted,marginTop:3}}>Carry <strong style={{color:C.creamDim}}>{item.carry} yds</strong>{item.rollYds>0&&<span style={{color:C.creamMuted}}> · rolls ~{item.rollYds} more</span>}</div>)}</div><div style={{textAlign:"right",flexShrink:0}}>{diff===0?<div style={{fontSize:12,color:C.greenBright,fontWeight:700}}>PERFECT</div>:<div style={{fontSize:12,color:isTop?C.goldLight:C.creamDim,fontWeight:600}}>{diff} yds {isOver?"long":"short"}</div>}</div></div>);})}

              {result.wedgeTip&&(<div style={{marginTop:14,background:"rgba(13,32,16,.9)",border:"1px solid rgba(201,162,39,.2)",borderRadius:14,padding:"18px 20px"}}><div style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:C.goldLight,letterSpacing:2,marginBottom:14}}>🏌️ {result.topClub.toUpperCase()} TIPS</div><div style={{fontSize:13,color:C.creamDim,fontStyle:"italic",marginBottom:14,paddingLeft:10,borderLeft:`2px solid ${C.green}`}}>{result.wedgeTip.feel}</div><div style={{marginBottom:14}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Shot Options</div>{result.wedgeTip.shots.map((s,i)=>(<div key={i} style={{display:"flex",gap:8,marginBottom:7,alignItems:"flex-start"}}><span style={{color:C.greenBright,flexShrink:0,marginTop:1}}>•</span><span style={{fontSize:13,color:C.creamDim,lineHeight:1.6}}>{s}</span></div>))}</div><div style={{marginBottom:14}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>🔥 Spin Keys</div>{result.wedgeTip.spin.map((s,i)=>(<div key={i} style={{display:"flex",gap:8,marginBottom:7,alignItems:"flex-start"}}><span style={{color:C.gold,flexShrink:0,marginTop:1}}>→</span><span style={{fontSize:13,color:C.creamDim,lineHeight:1.6}}>{s}</span></div>))}</div><div style={{background:"rgba(26,77,36,.15)",border:"1px solid rgba(42,107,52,.25)",borderRadius:10,padding:"10px 14px"}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>What to Expect</div><div style={{fontSize:13,color:C.creamDim,lineHeight:1.6}}>{result.wedgeTip.expect}</div></div></div>)}
            </div>
          )}
        </div>
      )}

      {subView==="bag"&&(
        <div>
          <div style={{background:"rgba(13,32,16,.85)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"22px 20px",marginBottom:16}}>
            <div style={{marginBottom:18}}><label style={{display:"block",fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>Select Your Name</label><select value={bagPlayer} onChange={e=>loadBag(e.target.value)} style={{...iStyle(false),appearance:"none",cursor:"pointer"}}><option value="">Select player…</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
            {bagPlayer&&(<><div style={{fontSize:12,color:C.creamMuted,marginBottom:16}}>Enter your average carry distance. Leave blank for clubs you don't carry.</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>{CLUBS.map(club=>(<div key={club}><label style={{display:"block",fontSize:11,color:C.creamDim,marginBottom:5,fontWeight:500}}>{club}</label><div style={{display:"flex",alignItems:"center",gap:6}}><input type="number" value={bagDists[club]||""} onChange={e=>setBagDists({...bagDists,[club]:e.target.value})} placeholder="—" min="1" max="400" style={{...iStyle(false),textAlign:"center",padding:"8px 10px",fontSize:14,flex:1}}/><span style={{fontSize:11,color:C.creamMuted,flexShrink:0}}>yds</span></div></div>))}</div><button className="bh" onClick={saveBag} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:12,color:"#0a1a0c",padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"'Cinzel',sans-serif"}}>{bagSaved?"✓ Bag Saved!":"SAVE MY BAG"}</button></>)}
            {!bagPlayer&&(<div style={{textAlign:"center",padding:"30px 0",color:C.creamMuted}}><div style={{fontSize:32,marginBottom:10}}>🎒</div>Select your name to set up your bag distances</div>)}
          </div>
          <div style={{background:"rgba(13,32,16,.6)",border:"1px solid rgba(42,107,52,.2)",borderRadius:12,padding:"14px 18px"}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Bag Setup Status</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{members.map(m=>{const hasB=bags[m.trim().toLowerCase()]&&Object.keys(bags[m.trim().toLowerCase()]).length>0;const count=hasB?Object.keys(bags[m.trim().toLowerCase()]).length:0;return(<div key={m} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:20,background:hasB?"rgba(42,107,52,.2)":"rgba(50,30,10,.2)",border:hasB?"1px solid rgba(77,184,96,.3)":"1px solid rgba(100,70,30,.3)"}}><div style={{width:6,height:6,borderRadius:"50%",background:hasB?C.greenBright:"rgba(180,120,40,.6)",flexShrink:0}}/><span style={{fontSize:12,color:hasB?C.creamDim:C.creamMuted}}>{m.split(" ")[0]}</span>{hasB&&<span style={{fontSize:10,color:C.greenBright}}>{count}c</span>}</div>);})}</div></div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE AVATAR ───────────────────────────────────────────────────────────
function Avatar({name, photo, size=40, radius=10}){
  if(photo) return <img src={photo} alt={name} style={{width:size,height:size,borderRadius:radius,objectFit:"cover",flexShrink:0,border:"1.5px solid rgba(77,184,96,.3)"}}/>;
  return <div style={{width:size,height:size,borderRadius:radius,background:avatarColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.3,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(name)}</div>;
}

// ─── PROFILE EDIT MODAL ───────────────────────────────────────────────────────
function ProfileEditModal({currentUser, profile, onSave, onClose}){
  const [bio,       setBio]       = useState(profile?.bio||"");
  const [homeCourse,setHomeCourse]= useState(profile?.homeCourse||"");
  const [photoData, setPhotoData] = useState(profile?.profilePhoto||null);
  const [saving,    setSaving]    = useState(false);
  const fileRef = useRef(null);

  async function handlePhoto(e){
    const f=e.target.files[0];if(!f)return;
    const resized=await resizeImage(f,400,0.8);
    setPhotoData(resized);
    e.target.value="";
  }

  async function handleSave(){
    setSaving(true);
    await onSave({bio:bio.trim(),homeCourse:homeCourse.trim(),profilePhoto:photoData});
    setSaving(false);
    onClose();
  }

  return(
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.card,border:"1px solid rgba(42,107,52,.3)",borderRadius:20,padding:"28px 26px",width:"100%",maxWidth:420,boxShadow:"0 24px 80px rgba(0,0,0,.8)"}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700,color:C.cream,letterSpacing:2,marginBottom:24}}>EDIT PROFILE</div>

        {/* Photo */}
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:22}}>
          <div style={{position:"relative",cursor:"pointer"}} onClick={()=>fileRef.current?.click()}>
            <Avatar name={currentUser.displayName||""} photo={photoData} size={72} radius={16}/>
            <div style={{position:"absolute",bottom:-4,right:-4,width:24,height:24,background:C.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#0a1a0c"}}>+</div>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:C.cream}}>{currentUser.displayName}</div>
            <button onClick={()=>fileRef.current?.click()} style={{background:"none",border:"none",color:C.greenBright,fontSize:12,cursor:"pointer",padding:0,marginTop:4}}>Change photo</button>
            {photoData&&<button onClick={()=>setPhotoData(null)} style={{background:"none",border:"none",color:"#e07070",fontSize:12,cursor:"pointer",padding:0,marginLeft:10}}>Remove</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Field label="Home Course">
            <input value={homeCourse} onChange={e=>setHomeCourse(e.target.value)} placeholder="e.g. Juliette Falls Golf Course" style={iStyle(false)}/>
          </Field>
          <Field label="Bio">
            <textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Tell the crew a little about yourself…" rows={3} style={{...iStyle(false),resize:"none",fontFamily:"'DM Sans',sans-serif"}}/>
          </Field>
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button className="bh" onClick={onClose} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:10,color:C.creamMuted,padding:"12px",fontSize:13,cursor:"pointer"}}>Cancel</button>
            <button className="bh" onClick={handleSave} disabled={saving} style={{flex:1,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{saving?<><Spinner/>Saving…</>:"Save Profile"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CREATE POST MODAL ────────────────────────────────────────────────────────
function CreatePostModal({currentUser, profile, onPost, onClose}){
  const [text,    setText]    = useState("");
  const [photo,   setPhoto]   = useState(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);

  async function handlePhoto(e){
    const f=e.target.files[0];if(!f)return;
    setPhoto(await resizeImage(f));
    e.target.value="";
  }

  async function handlePost(){
    if(!text.trim()&&!photo)return;
    setPosting(true);
    await onPost({id:Date.now().toString(),type:"post",authorName:currentUser.displayName||"",authorPhoto:profile?.profilePhoto||null,content:text.trim(),photo:photo||null,reactions:{},comments:[],createdAt:new Date().toISOString()});
    setPosting(false);
    onClose();
  }

  return(
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.card,border:"1px solid rgba(42,107,52,.3)",borderRadius:20,padding:"24px 22px",width:"100%",maxWidth:420,boxShadow:"0 24px 80px rgba(0,0,0,.8)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
          <Avatar name={currentUser.displayName||""} photo={profile?.profilePhoto||null} size={40} radius={10}/>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.cream,letterSpacing:1}}>NEW POST</div>
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="What's happening on the course…" rows={4} style={{...iStyle(false),resize:"none",fontFamily:"'DM Sans',sans-serif",marginBottom:12}} autoFocus/>
        {photo&&(<div style={{position:"relative",marginBottom:12}}><img src={photo} alt="preview" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:12}}/><button onClick={()=>setPhoto(null)} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.6)",border:"none",borderRadius:"50%",width:28,height:28,color:C.cream,cursor:"pointer",fontSize:14}}>✕</button></div>)}
        <div style={{display:"flex",gap:10}}>
          <button className="bh" onClick={()=>fileRef.current?.click()} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,color:C.creamMuted,padding:"10px 16px",fontSize:13,cursor:"pointer"}}>📷 Photo</button>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>
          <div style={{flex:1}}/>
          <button className="bh" onClick={onClose} style={{background:"rgba(255,255,255,.05)",border:"none",borderRadius:10,color:C.creamMuted,padding:"10px 16px",fontSize:13,cursor:"pointer"}}>Cancel</button>
          <button className="bh" onClick={handlePost} disabled={(!text.trim()&&!photo)||posting} style={{background:text.trim()||photo?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:10,color:text.trim()||photo?"#0a1a0c":C.creamMuted,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{posting?<><Spinner/>Posting…</>:"Post"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── FEED POST CARD ───────────────────────────────────────────────────────────
function FeedPost({post, members, currentUser, isAdmin, onReact, onComment, onDelete, onPlayerTap}){
  const [showCmts, setShowCmts] = useState(false);
  const [cText,    setCText]    = useState("");
  const [imgFull,  setImgFull]  = useState(false);

  function submitComment(){
    if(!cText.trim())return;
    onComment(post.id,currentUser.displayName||"",cText);
    setCText("");
  }

  const cmts=post.comments||[];
  const rxns=post.reactions||{};

  return(
    <div style={{background:"rgba(13,32,16,.85)",border:"1px solid rgba(42,107,52,.2)",borderRadius:16,marginBottom:12,overflow:"hidden"}}>
      {/* Post photo */}
      {post.photo&&(<>
        <img src={post.photo} alt="post" onClick={()=>setImgFull(true)} style={{width:"100%",maxHeight:280,objectFit:"cover",display:"block",cursor:"pointer"}}/>
        {imgFull&&<div onClick={()=>setImgFull(false)} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.93)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}><img src={post.photo} alt="full" className="pop" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12,objectFit:"contain"}}/></div>}
      </>)}

      <div style={{padding:"16px 18px"}}>
        {/* Author + meta */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button onClick={()=>onPlayerTap(post.authorName)} style={{background:"none",border:"none",padding:0,cursor:"pointer",flexShrink:0}}>
            <Avatar name={post.authorName} photo={post.authorPhoto} size={40} radius={10}/>
          </button>
          <div style={{flex:1}}>
            <button onClick={()=>onPlayerTap(post.authorName)} style={{background:"none",border:"none",padding:0,cursor:"pointer"}}><span style={{fontWeight:600,fontSize:15,color:C.cream}}>{post.authorName}</span></button>
            <div style={{fontSize:11,color:C.creamMuted,marginTop:2}}>{formatAgo(post.createdAt)}</div>
          </div>
          {/* Type badge */}
          <div style={{fontSize:10,background:post.type==="round"?"rgba(201,162,39,.15)":post.type==="schedule"?"rgba(26,107,52,.25)":"rgba(42,107,52,.15)",border:post.type==="round"?"1px solid rgba(201,162,39,.3)":post.type==="schedule"?"1px solid rgba(77,184,96,.3)":"1px solid rgba(42,107,52,.3)",borderRadius:6,padding:"2px 8px",color:post.type==="round"?C.goldLight:C.greenBright,letterSpacing:1,textTransform:"uppercase"}}>{post.type==="round"?"⛳ Round":post.type==="schedule"?"📅 Scheduled":"📝 Post"}</div>
          {isAdmin&&<button className="bh" onClick={()=>onDelete(post.id)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer"}}>✕</button>}
        </div>

        {/* Content */}
        {post.content&&<div style={{fontSize:14,color:C.creamDim,lineHeight:1.7,marginBottom:post.roundData||post.scheduleData?12:0}}>{post.content}</div>}

        {/* Round card embed */}
        {post.roundData&&(
          <div style={{background:"rgba(5,14,6,.5)",border:"1px solid rgba(42,107,52,.2)",borderRadius:12,padding:"12px 14px",marginBottom:4}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,color:C.creamDim}}>📍 {post.roundData.course}</div>
                <div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>📅 {formatDate(post.roundData.date)} · {post.roundData.holes}H · w/ {post.roundData.partnerName}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:26,fontWeight:700,color:C.goldLight,lineHeight:1}}>{post.roundData.score}</div>
                <div style={{fontSize:9,color:C.creamMuted,letterSpacing:1}}>STROKES</div>
              </div>
            </div>
          </div>
        )}

        {/* Schedule embed */}
        {post.scheduleData&&(
          <div style={{background:"rgba(5,14,6,.5)",border:"1px solid rgba(77,184,96,.2)",borderRadius:12,padding:"12px 14px",marginBottom:4}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.cream,marginBottom:4}}>{post.scheduleData.course}</div>
            <div style={{fontSize:12,color:C.creamDim}}>📅 {formatDateFull(post.scheduleData.date)} · ⏰ {formatTime(post.scheduleData.time)}</div>
            {post.scheduleData.notes&&<div style={{fontSize:12,color:C.creamMuted,marginTop:4,fontStyle:"italic"}}>{post.scheduleData.notes}</div>}
          </div>
        )}

        {/* Reactions + comment toggle */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {EMOJIS.map(e=>{
            const count=rxns[e]?.length||0,names=rxns[e]||[];
            return(<button key={e} className={`emoji-btn${count>0?" active":""}`} onClick={()=>onReact(post.id,e,currentUser.displayName||"")}>{e}{count>0&&<span style={{fontSize:11,color:C.goldLight}}>{count}</span>}{names.length>0&&<span style={{fontSize:10,color:C.creamMuted,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{names.join(", ")}</span>}</button>);
          })}
          <div style={{flex:1}}/>
          <button className="bh" onClick={()=>setShowCmts(v=>!v)} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer"}}>💬 {cmts.length>0?`${cmts.length} comment${cmts.length!==1?"s":""}`:showCmts?"Hide":"Comment"}</button>
        </div>

        {/* Comments */}
        {showCmts&&(
          <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid rgba(42,107,52,.12)"}}>
            {cmts.length===0&&<div style={{fontSize:12,color:C.creamMuted,marginBottom:10}}>No comments yet — first one to say something 👇</div>}
            {cmts.map(c=>(
              <div key={c.id} className="comment-item" style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <div style={{width:24,height:24,borderRadius:6,background:avatarColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0,marginTop:2}}>{initials(c.author)}</div>
                <div style={{flex:1}}>
                  <span style={{fontSize:12,fontWeight:600,color:C.cream}}>{c.author} </span>
                  <span style={{fontSize:13,color:C.creamDim,lineHeight:1.5}}>{c.text}</span>
                  <div style={{fontSize:10,color:C.creamMuted,marginTop:2}}>{formatAgo(c.timestamp)}</div>
                </div>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center"}}>
              <Avatar name={currentUser.displayName||""} size={28} radius={7}/>
              <input value={cText} onChange={e=>setCText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitComment();}} placeholder="Add a comment…" style={{...iStyle(false),flex:1,padding:"8px 12px",fontSize:13}}/>
              <button className="bh" onClick={submitComment} disabled={!cText.trim()} style={{background:cText.trim()?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:9,color:cText.trim()?"#0a1a0c":C.creamMuted,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:cText.trim()?1:.5}}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FEED VIEW (replaces home tab) ────────────────────────────────────────────
function FeedView({feedPosts, currentUser, members, isAdmin, announcement, userProfiles, groupData, onCreatePost, onReact, onComment, onDeletePost, onPlayerTap, onEditProfile}){
  const myProfile=userProfiles[currentUser.uid]||{};

  return(
    <div className="fi">
      <AnnouncementBanner announcement={announcement}/>

      {/* My profile strip + post button */}
      <div style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
        <Avatar name={currentUser.displayName||""} photo={myProfile.profilePhoto||null} size={44} radius={11}/>
        <button onClick={onCreatePost} style={{flex:1,background:"rgba(5,14,6,.6)",border:"1px solid rgba(42,107,52,.25)",borderRadius:10,color:C.creamMuted,padding:"11px 14px",fontSize:13,cursor:"pointer",textAlign:"left"}}>
          What's happening on the course, {currentUser.displayName?.split(" ")[0]}?
        </button>
        <button className="bh" onClick={onEditProfile} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,color:C.creamMuted,padding:"9px 12px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>✏️ Profile</button>
      </div>

      {/* Feed */}
      {feedPosts.length===0&&(
        <div style={{textAlign:"center",padding:"48px 20px",color:C.creamMuted}}>
          <div style={{fontSize:40,marginBottom:14}}>⛳</div>
          <div style={{fontSize:15,color:C.creamDim,marginBottom:6}}>Nothing here yet</div>
          <div style={{fontSize:13}}>Approve a round or schedule a tee time and it'll show up here.</div>
        </div>
      )}

      {[...feedPosts].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(post=>(
        <FeedPost
          key={post.id}
          post={post}
          members={members}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onReact={onReact}
          onComment={onComment}
          onDelete={onDeletePost}
          onPlayerTap={onPlayerTap}
        />
      ))}
    </div>
  );
}

// ─── GAME CALCULATIONS ────────────────────────────────────────────────────────
function calcSkins(scores, players, totalHoles){
  const skins={};players.forEach(p=>{skins[p]=0;});
  let carryover=0;
  const holesWon={};
  for(let h=1;h<=totalHoles;h++){
    const hs=players.map(p=>({player:p,score:scores[p]?.[String(h)]})).filter(x=>x.score!==undefined&&x.score!==null);
    if(hs.length<players.length){carryover++;holesWon[h]={winner:null,carryover:carryover-1};continue;}
    const min=Math.min(...hs.map(x=>+x.score));
    const winners=hs.filter(x=>+x.score===min);
    if(winners.length===1){skins[winners[0].player]+=(1+carryover);holesWon[h]={winner:winners[0].player,value:1+carryover,tied:false};carryover=0;}
    else{carryover++;holesWon[h]={winner:null,tied:true,carryover};}
  }
  return{skins,holesWon,carryover};
}

function calcNassau(scores, players, totalHoles){
  const result={};
  players.forEach(p=>{
    const s=scores[p]||{};
    let front=0,back=0,frontDone=true,backDone=true;
    for(let h=1;h<=9;h++){if(s[String(h)]){front+=+s[String(h)];}else frontDone=false;}
    if(totalHoles===18){for(let h=10;h<=18;h++){if(s[String(h)]){back+=+s[String(h)];}else backDone=false;}}
    result[p]={front,back,total:front+back,frontDone,backDone,totalDone:frontDone&&(totalHoles===9||backDone)};
  });
  // Leaders
  function leader(key){const vals=players.map(p=>({p,v:result[p][key]})).filter(x=>x.v>0);if(!vals.length)return null;const min=Math.min(...vals.map(x=>x.v));const winners=vals.filter(x=>x.v===min);return winners.length===1?winners[0].p:"Tied";}
  return{...result,frontLeader:leader("front"),backLeader:leader("back"),totalLeader:leader("total")};
}

// ─── GAME VIEW ────────────────────────────────────────────────────────────────
function GameView({members, games, saveGames, currentUser}){
  const [subView,   setSubView]   = useState("list"); // list | create | active
  const [activeGame,setActiveGame]= useState(null);
  const [curHole,   setCurHole]   = useState(1);

  // Create game form
  const [gCourse,   setGCourse]   = useState("");
  const [gDate,     setGDate]     = useState(new Date().toISOString().split("T")[0]);
  const [gHoles,    setGHoles]    = useState(18);
  const [gType,     setGType]     = useState("both"); // skins | nassau | both
  const [gPlayers,  setGPlayers]  = useState([]);
  const [gErrors,   setGErrors]   = useState({});

  function openGame(g){setActiveGame(g);setCurHole(1);setSubView("active");}

  async function createGame(){
    const errs={};
    if(!gCourse.trim())errs.course="Required";
    if(gPlayers.length<2)errs.players="Select at least 2 players";
    setGErrors(errs);if(Object.keys(errs).length)return;
    const g={
      id:"game_"+Date.now(),
      type:gType,
      course:gCourse.trim(),
      date:gDate,
      holes:gHoles,
      players:gPlayers,
      scores:{},
      status:"active",
      createdAt:new Date().toISOString(),
      createdBy:currentUser.displayName||"",
    };
    const updated=[g,...games];
    await saveGames(updated);
    setGCourse("");setGPlayers([]);setGErrors({});
    setActiveGame(g);setCurHole(1);setSubView("active");
  }

  async function enterScore(player, hole, score){
    const updated={...activeGame,scores:{...activeGame.scores,[player]:{...(activeGame.scores[player]||{}),[String(hole)]:score===null?undefined:score}}};
    if(score===null){delete updated.scores[player][String(hole)];}
    setActiveGame(updated);
    await saveGames(games.map(g=>g.id===updated.id?updated:g));
  }

  async function completeGame(){
    const updated={...activeGame,status:"complete",completedAt:new Date().toISOString()};
    setActiveGame(updated);
    await saveGames(games.map(g=>g.id===updated.id?updated:g));
    showFin();
  }

  function showFin(){setSubView("list");setActiveGame(null);}

  const activeGames=games.filter(g=>g.status==="active");
  const pastGames=games.filter(g=>g.status==="complete");

  // ── LIST ──
  if(subView==="list") return(
    <div className="fi">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div><div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:600,color:C.cream}}>🎮 GAMES</div><div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>Skins · Nassau · Scorecard</div></div>
        <button className="bh" onClick={()=>setSubView("create")} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"10px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ New Game</button>
      </div>

      {activeGames.length>0&&(<>
        <div style={{fontSize:10,color:C.greenBright,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Active</div>
        {activeGames.map(g=>(
          <div key={g.id} className="rh" onClick={()=>openGame(g)} style={{background:"linear-gradient(135deg,rgba(26,77,36,.2),rgba(201,162,39,.05))",border:"1px solid rgba(77,184,96,.25)",borderRadius:14,padding:"16px 18px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:28}}>🟢</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.cream}}>{g.course}</div>
              <div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>{g.players.join(", ")} · {g.holes}H · {g.type==="both"?"Skins + Nassau":g.type==="skins"?"Skins":"Nassau"}</div>
            </div>
            <div style={{color:C.creamMuted}}>›</div>
          </div>
        ))}
      </>)}

      {pastGames.length>0&&(<>
        <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:10,marginTop:20}}>Completed</div>
        {pastGames.map(g=>(
          <div key={g.id} className="rh" onClick={()=>openGame(g)} style={{background:"rgba(13,32,16,.7)",border:"1px solid rgba(42,107,52,.15)",borderRadius:12,padding:"14px 16px",marginBottom:7,cursor:"pointer",display:"flex",alignItems:"center",gap:12,opacity:.8}}>
            <div style={{fontSize:22}}>✅</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:14,color:C.creamDim}}>{g.course}</div>
              <div style={{fontSize:11,color:C.creamMuted,marginTop:2}}>{formatDate(g.date)} · {g.players.join(", ")}</div>
            </div>
            <div style={{color:C.creamMuted}}>›</div>
          </div>
        ))}
      </>)}

      {games.length===0&&<Empty msg="No games yet — start one and play for skins ⛳"/>}
    </div>
  );

  // ── CREATE ──
  if(subView==="create") return(
    <div className="fi">
      <button className="bh" onClick={()=>setSubView("list")} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer",letterSpacing:2,marginBottom:16}}>← BACK</button>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:600,color:C.cream,marginBottom:20}}>NEW GAME</div>
      <div style={{background:"rgba(13,32,16,.85)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"22px 20px",display:"flex",flexDirection:"column",gap:16}}>
        <Field label="Course Name" error={gErrors.course}><input value={gCourse} onChange={e=>setGCourse(e.target.value)} placeholder="e.g. Juliette Falls" style={iStyle(gErrors.course)}/></Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <Field label="Date"><input type="date" value={gDate} onChange={e=>setGDate(e.target.value)} style={{...iStyle(false),colorScheme:"dark"}}/></Field>
          <Field label="Holes">
            <div style={{display:"flex",gap:8}}>
              {[9,18].map(n=><button key={n} onClick={()=>setGHoles(n)} style={{flex:1,padding:"11px",borderRadius:9,cursor:"pointer",fontSize:14,fontWeight:700,background:gHoles===n?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:gHoles===n?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:gHoles===n?C.cream:C.creamMuted}}>{n}</button>)}
            </div>
          </Field>
        </div>
        <Field label="Game Type">
          <div style={{display:"flex",gap:8}}>
            {[{v:"skins",l:"🎯 Skins"},{v:"nassau",l:"💰 Nassau"},{v:"both",l:"🎮 Both"}].map(t=><button key={t.v} onClick={()=>setGType(t.v)} style={{flex:1,padding:"10px 6px",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:600,background:gType===t.v?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:gType===t.v?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:gType===t.v?C.cream:C.creamMuted}}>{t.l}</button>)}
          </div>
        </Field>
        <Field label="Players" error={gErrors.players}>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {members.map(m=>{const sel=gPlayers.includes(m);return(<button key={m} onClick={()=>setGPlayers(sel?gPlayers.filter(p=>p!==m):[...gPlayers,m])} style={{padding:"8px 14px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:600,background:sel?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(5,14,6,.7)",border:sel?"1px solid rgba(77,184,96,.4)":"1px solid rgba(42,107,52,.3)",color:sel?C.cream:C.creamMuted}}>{m}</button>);})}
          </div>
        </Field>
        <button className="bh" onClick={createGame} disabled={!gCourse.trim()||gPlayers.length<2} style={{background:gCourse.trim()&&gPlayers.length>=2?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:12,color:gCourse.trim()&&gPlayers.length>=2?"#0a1a0c":C.creamMuted,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:1,fontFamily:"'Cinzel',sans-serif"}}>START GAME 🎮</button>
      </div>
    </div>
  );

  // ── ACTIVE SCORECARD ──
  if(subView==="active"&&activeGame){
    const g=activeGame;
    const skins=g.type!=="nassau"?calcSkins(g.scores,g.players,g.holes):null;
    const nassau=g.type!=="skins"?calcNassau(g.scores,g.players,g.holes):null;
    const maxHole=g.holes;
    const playerTotals={};
    g.players.forEach(p=>{playerTotals[p]=Object.values(g.scores[p]||{}).reduce((s,v)=>s+(+v||0),0);});

    return(
      <div className="fi">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <button className="bh" onClick={()=>{setSubView("list");setActiveGame(null);}} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer",letterSpacing:2}}>← GAMES</button>
          {g.status==="active"&&<button className="bh" onClick={completeGame} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(77,184,96,.3)",borderRadius:9,color:C.greenBright,padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>Finish Game ✓</button>}
        </div>

        {/* Game header */}
        <div style={{background:"linear-gradient(135deg,rgba(26,77,36,.2),rgba(201,162,39,.05))",border:"1px solid rgba(201,162,39,.2)",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700,color:C.cream}}>{g.course}</div>
          <div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>{formatDate(g.date)} · {g.holes}H · {g.type==="both"?"Skins + Nassau":g.type==="skins"?"Skins":"Nassau"}</div>
        </div>

        {/* Hole selector */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <button className="bh" onClick={()=>setCurHole(h=>Math.max(1,h-1))} disabled={curHole===1} style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:9,color:curHole===1?C.creamMuted:C.cream,padding:"10px 16px",fontSize:16,cursor:curHole===1?"default":"pointer"}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:36,fontWeight:700,color:C.goldLight,lineHeight:1}}>{curHole}</div>
              <div style={{fontSize:11,color:C.creamMuted}}>of {maxHole}</div>
            </div>
            <button className="bh" onClick={()=>setCurHole(h=>Math.min(maxHole,h+1))} disabled={curHole===maxHole} style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:9,color:curHole===maxHole?C.creamMuted:C.cream,padding:"10px 16px",fontSize:16,cursor:curHole===maxHole?"default":"pointer"}}>›</button>
          </div>

          {/* Hole dots */}
          <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
            {Array.from({length:maxHole},(_,i)=>i+1).map(h=>{
              const allEntered=g.players.every(p=>g.scores[p]?.[String(h)]!==undefined);
              return(<button key={h} onClick={()=>setCurHole(h)} style={{width:22,height:22,borderRadius:"50%",cursor:"pointer",border:"none",fontSize:9,fontWeight:700,background:h===curHole?C.gold:allEntered?"rgba(42,107,52,.6)":"rgba(42,107,52,.2)",color:h===curHole?"#0a1a0c":allEntered?C.greenBright:C.creamMuted}}>{h}</button>);
            })}
          </div>
        </div>

        {/* Score entry for current hole */}
        <div style={{marginBottom:20}}>
          {g.players.map(p=>{
            const score=g.scores[p]?.[String(curHole)];
            const total=playerTotals[p];
            return(
              <div key={p} style={{background:"rgba(13,32,16,.85)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
                <Avatar name={p} size={38} radius={9}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:C.cream}}>{p}</div>
                  <div style={{fontSize:11,color:C.creamMuted,marginTop:2}}>Total: <strong style={{color:total>0?C.creamDim:C.creamMuted}}>{total||"—"}</strong></div>
                </div>
                {/* Score stepper */}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>enterScore(p,curHole,score>1?(score-1):1)} style={{width:36,height:36,borderRadius:9,background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",color:C.cream,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
                  <div style={{width:44,textAlign:"center"}}>
                    {score!==undefined&&score!==null
                      ?<div style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:700,color:C.goldLight}}>{score}</div>
                      :<div style={{fontSize:18,color:C.creamMuted}}>—</div>}
                  </div>
                  <button onClick={()=>enterScore(p,curHole,(score||0)+1)} style={{width:36,height:36,borderRadius:9,background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",color:C.cream,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Skins results */}
        {skins&&(
          <div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"16px 18px",marginBottom:14}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:C.greenBright,letterSpacing:2,marginBottom:14}}>🎯 SKINS</div>
            {/* Player skins tally */}
            <div style={{display:"flex",gap:10,marginBottom:14}}>
              {g.players.map(p=>(
                <div key={p} style={{flex:1,background:"rgba(5,14,6,.5)",borderRadius:10,padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:11,color:C.creamMuted,marginBottom:4}}>{p.split(" ")[0]}</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:skins.skins[p]>0?C.goldLight:C.creamMuted}}>{skins.skins[p]}</div>
                  <div style={{fontSize:9,color:C.creamMuted,letterSpacing:1}}>SKINS</div>
                </div>
              ))}
            </div>
            {/* Hole-by-hole */}
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {Object.entries(skins.holesWon).map(([h,info])=>(
                <div key={h} style={{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:600,background:info.winner?"rgba(201,162,39,.15)":info.tied?"rgba(192,64,64,.1)":"rgba(42,107,52,.1)",border:info.winner?"1px solid rgba(201,162,39,.3)":info.tied?"1px solid rgba(192,64,64,.2)":"1px solid rgba(42,107,52,.15)",color:info.winner?C.goldLight:info.tied?"#e07070":C.creamMuted}}>
                  H{h} {info.winner?`→ ${info.winner.split(" ")[0]}${info.value>1?` (+${info.value-1})`:""}`:`${info.tied?"TIE":""}`}
                </div>
              ))}
            </div>
            {skins.carryover>0&&<div style={{fontSize:12,color:C.goldLight,marginTop:10}}>⚡ {skins.carryover} skin{skins.carryover!==1?"s":""} carrying over</div>}
          </div>
        )}

        {/* Nassau results */}
        {nassau&&(
          <div style={{background:"rgba(13,32,16,.9)",border:"1px solid rgba(42,107,52,.2)",borderRadius:14,padding:"16px 18px",marginBottom:14}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:C.greenBright,letterSpacing:2,marginBottom:14}}>💰 NASSAU</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr>
                    <th style={{textAlign:"left",color:C.creamMuted,padding:"4px 8px",fontWeight:600}}>Player</th>
                    {g.holes===18&&<th style={{color:C.creamMuted,padding:"4px 8px",fontWeight:600}}>Front 9</th>}
                    {g.holes===18&&<th style={{color:C.creamMuted,padding:"4px 8px",fontWeight:600}}>Back 9</th>}
                    <th style={{color:C.creamMuted,padding:"4px 8px",fontWeight:600}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {g.players.map(p=>{
                    const r=nassau[p];
                    const isFront=nassau.frontLeader===p;
                    const isBack=nassau.backLeader===p;
                    const isTotal=nassau.totalLeader===p;
                    return(
                      <tr key={p} style={{borderTop:"1px solid rgba(42,107,52,.1)"}}>
                        <td style={{padding:"8px",color:C.cream,fontWeight:600}}>{p.split(" ")[0]}</td>
                        {g.holes===18&&<td style={{padding:"8px",textAlign:"center",color:isFront?C.goldLight:r.front>0?C.creamDim:C.creamMuted,fontFamily:"'Cinzel',serif",fontWeight:isFront?700:400}}>{r.front||"—"}{isFront&&" 👑"}</td>}
                        {g.holes===18&&<td style={{padding:"8px",textAlign:"center",color:isBack?C.goldLight:r.back>0?C.creamDim:C.creamMuted,fontFamily:"'Cinzel',serif",fontWeight:isBack?700:400}}>{r.back||"—"}{isBack&&" 👑"}</td>}
                        <td style={{padding:"8px",textAlign:"center",color:isTotal?C.goldLight:r.total>0?C.creamDim:C.creamMuted,fontFamily:"'Cinzel',serif",fontWeight:isTotal?700:400}}>{r.total||"—"}{isTotal&&" 👑"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── GROUP APP (Main leaderboard experience) ──────────────────────────────────
function GroupApp({currentUser, group, onLeaveGroup}){
  const groupId = group.id;
  const isAdmin = currentUser.uid === group.adminId;

  const [rounds,       setRounds]       = useState([]);
  const [pending,      setPending]      = useState([]);
  const [schedule,     setSchedule]     = useState(SEED_SCHEDULE);
  const [reactions,    setReactions]    = useState({});
  const [comments,     setComments]     = useState([]);
  const [photos,       setPhotos]       = useState({});
  const [bags,         setBags]         = useState({});
  const [announcement, setAnnouncement] = useState(null);
  const [groupData,    setGroupData]    = useState(group);
  const [schedLoading, setSchedLoading] = useState(true);
  const [loading,      setLoading]      = useState(true);
  const [feedPosts,    setFeedPosts]    = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [games,        setGames]        = useState([]);
  const [view,         setView]         = useState("home");
  const [selPlayer,    setSelPlayer]    = useState(null);
  const [toast,        setToast]        = useState(null);
  const [editRound,    setEditRound]    = useState(null);
  const [delConfirm,   setDelConfirm]   = useState(null);
  const [pinModal,     setPinModal]     = useState(false);
  const [rejectId,     setRejectId]     = useState(null);
  const [rejectNote,   setRejectNote]   = useState("");
  const [form,         setForm]         = useState(emptyForm());
  const [schedForm,    setSchedForm]    = useState(emptySchedForm());
  const [schedModal,   setSchedModal]   = useState(false);
  const [schedErrors,  setSchedErrors]  = useState({});
  const [editSchedId,  setEditSchedId]  = useState(null);
  const [errors,       setErrors]       = useState({});
  const [newMemberName,   setNewMemberName]   = useState("");
  const [memberEditId,    setMemberEditId]    = useState(null);
  const [memberEditName,  setMemberEditName]  = useState("");
  const [annForm,      setAnnForm]      = useState({title:"",text:"",type:"info"});
  const [annPreview,   setAnnPreview]   = useState(false);
  const [showInvite,   setShowInvite]   = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showCreatePost,  setShowCreatePost]  = useState(false);

  const roundsRef  = useRef([]);
  const pendingRef = useRef([]);
  const didInit    = useRef({rounds:false,sched:false});
  const prevIds    = useRef({rounds:new Set(),sched:new Set()});

  // Derived member names list
  const members = (groupData.membersList||[]).map(m=>m.displayName);

  function emptyForm(){return{playerName:"",partnerName:"",date:new Date().toISOString().split("T")[0],course:"",score:"",holes:"18",tees:"blue",courseRating:"",slope:"",notes:""};}
  function emptySchedForm(){return{course:"",date:"",time:"10:00",notes:""};}

  useEffect(()=>{
    const unsubR=onSnapshot(doc(db,groupId,"rounds"),snap=>{
      const list=snap.exists()?(snap.data().list||[]):[];
      if(!didInit.current.rounds){prevIds.current.rounds=new Set(list.map(r=>r.id));didInit.current.rounds=true;}
      roundsRef.current=list; setRounds(list); setLoading(false);
    });
    const unsubP=onSnapshot(doc(db,groupId,"pending"),snap=>{const list=snap.exists()?(snap.data().list||[]):[];pendingRef.current=list;setPending(list);});
    const unsubS=onSnapshot(doc(db,groupId,"schedule"),snap=>{const list=snap.exists()?(snap.data().list||[]):null;if(!list){setDoc(doc(db,groupId,"schedule"),{list:[]});setSchedule([]);}else{setSchedule(list);}setSchedLoading(false);});
    const unsubRxn=onSnapshot(doc(db,groupId,"reactions"),snap=>{setReactions(snap.exists()?(snap.data().map||{}):{});});
    const unsubCmt=onSnapshot(doc(db,groupId,"comments"),snap=>{setComments(snap.exists()?(snap.data().list||[]):[]);});
    const unsubPho=onSnapshot(doc(db,groupId,"photos"),snap=>{setPhotos(snap.exists()?(snap.data().map||{}):{});});
    const unsubBags=onSnapshot(doc(db,groupId,"bags"),snap=>{setBags(snap.exists()?(snap.data().map||{}):{});});
    const unsubAnn=onSnapshot(doc(db,groupId,"announcement"),snap=>{setAnnouncement(snap.exists()&&snap.data().text?snap.data():null);});
    const unsubG=onSnapshot(doc(db,"groups",groupId),snap=>{if(snap.exists())setGroupData(snap.data());});
    const unsubFeed=onSnapshot(doc(db,groupId,"feed"),snap=>{setFeedPosts(snap.exists()?(snap.data().list||[]):[]);});
    // Load profiles for all group members
    const unsubProfiles = onSnapshot(doc(db,groupId,"userProfiles"),snap=>{setUserProfiles(snap.exists()?(snap.data().map||{}):{});});
    const unsubGames = onSnapshot(doc(db,groupId,"games"),snap=>{setGames(snap.exists()?(snap.data().list||[]):[]);});
    return()=>{unsubR();unsubP();unsubS();unsubRxn();unsubCmt();unsubPho();unsubBags();unsubAnn();unsubG();unsubFeed();unsubProfiles();unsubGames();};
  },[groupId]);

  async function saveRounds(nr)    {roundsRef.current=nr; setRounds(nr);    await setDoc(doc(db,groupId,"rounds"),{list:nr});}
  async function savePending(np)   {pendingRef.current=np;setPending(np);   await setDoc(doc(db,groupId,"pending"),{list:np});}
  async function saveSchedule(ns)  {setSchedule(ns);   await setDoc(doc(db,groupId,"schedule"),{list:ns});}
  async function saveReactions(rx) {setReactions(rx);  await setDoc(doc(db,groupId,"reactions"),{map:rx});}
  async function saveComments(cm)  {setComments(cm);   await setDoc(doc(db,groupId,"comments"),{list:cm});}
  async function savePhotos(ph)    {setPhotos(ph);     await setDoc(doc(db,groupId,"photos"),{map:ph});}
  async function saveBags(b)       {setBags(b);        await setDoc(doc(db,groupId,"bags"),{map:b});}
  async function saveAnnouncement(a){setAnnouncement(a);await setDoc(doc(db,groupId,"announcement"),a||{text:""});}
  async function saveGroupMembers(ml){const updated={...groupData,membersList:ml};setGroupData(updated);await setDoc(doc(db,"groups",groupId),updated);}
  async function saveFeed(posts)   {setFeedPosts(posts);await setDoc(doc(db,groupId,"feed"),{list:posts});}
  async function saveUserProfiles(map){setUserProfiles(map);await setDoc(doc(db,groupId,"userProfiles"),{map});}
  async function saveGames(list)     {setGames(list);     await setDoc(doc(db,groupId,"games"),{list});}

  async function addFeedPost(post){
    const posts=[post,...feedPosts].slice(0,200); // cap at 200
    await saveFeed(posts);
  }

  async function updateMyProfile(profileData){
    const key=currentUser.uid;
    const updated={...userProfiles,[key]:{...profileData,displayName:currentUser.displayName,updatedAt:new Date().toISOString()}};
    await saveUserProfiles(updated);
  }

  function getProfileFor(playerName){
    // Find uid by display name
    const member=(groupData.membersList||[]).find(m=>m.displayName===playerName);
    if(!member)return null;
    return userProfiles[member.uid]||null;
  }

  function myProfile(){return userProfiles[currentUser.uid]||{};}


  function showToast(msg,type="success"){setToast({msg,type});setTimeout(()=>setToast(null),3200);}

  async function handleReact(roundId,emoji,name){const cur=reactions[roundId]||{},curL=cur[emoji]||[],newL=curL.includes(name)?curL.filter(n=>n!==name):[...curL,name];await saveReactions({...reactions,[roundId]:{...cur,[emoji]:newL}});}
  async function handleComment(roundId,author,text){if(!text.trim()||!author)return;await saveComments([...comments,{id:Date.now().toString(),roundId,author,text:text.trim(),timestamp:new Date().toISOString()}]);showToast("Comment posted 💬");}
  async function handleDeleteComment(id){await saveComments(comments.filter(c=>c.id!==id));}
  async function handlePhotoUpload(roundId,dataUrl){await savePhotos({...photos,[roundId]:dataUrl});showToast("Photo added 📸");}

  // Feed handlers
  async function handleFeedReact(postId,emoji,name){
    const updated=feedPosts.map(p=>{
      if(p.id!==postId)return p;
      const cur=p.reactions||{},curL=cur[emoji]||[],newL=curL.includes(name)?curL.filter(n=>n!==name):[...curL,name];
      return{...p,reactions:{...cur,[emoji]:newL}};
    });
    await saveFeed(updated);
  }
  async function handleFeedComment(postId,author,text){
    if(!text.trim())return;
    const updated=feedPosts.map(p=>{if(p.id!==postId)return p;return{...p,comments:[...(p.comments||[]),{id:Date.now().toString(),author,text:text.trim(),timestamp:new Date().toISOString()}]};});
    await saveFeed(updated);
  }
  async function handleFeedDeletePost(postId){await saveFeed(feedPosts.filter(p=>p.id!==postId));}
  async function handleCreatePost(postData){await addFeedPost(postData);setShowCreatePost(false);showToast("Posted ✓");}


  function handleRsvp(evtId,name,action){const updated=schedule.map(e=>{if(e.id!==evtId)return e;if(action==="remove")return{...e,rsvps:(e.rsvps||[]).filter(n=>n!==name)};if((e.rsvps||[]).includes(name))return e;return{...e,rsvps:[...(e.rsvps||[]),name]};});saveSchedule(updated);if(action==="remove")showToast(`${name} removed`,"danger");else showToast(`✓ ${name} is in!`);}
  function handleDeleteSchedule(id){saveSchedule(schedule.filter(e=>e.id!==id));showToast("Event removed","danger");}
  function handleEditSched(evt){setEditSchedId(evt.id);setSchedForm({course:evt.course,date:evt.date,time:evt.time,notes:evt.notes||""});setSchedErrors({});setSchedModal(true);}
  function validateSched(f){const e={};if(!f.course.trim())e.course="Required";if(!f.date)e.date="Required";if(!f.time)e.time="Required";return e;}
  function handleSchedSubmit(){
    const e=validateSched(schedForm);setSchedErrors(e);if(Object.keys(e).length)return;
    if(editSchedId){
      saveSchedule(schedule.map(ev=>ev.id===editSchedId?{...ev,...schedForm}:ev));
      showToast("Round updated ✓");
    } else {
      const newEvt={...schedForm,id:Date.now().toString(),rsvps:[],createdAt:new Date().toISOString()};
      saveSchedule([...schedule,newEvt].sort((a,b)=>new Date(a.date)-new Date(b.date)));
      // Auto-post to feed
      addFeedPost({id:"sched_"+Date.now().toString(),type:"schedule",authorName:currentUser.displayName||"Admin",authorPhoto:myProfile()?.profilePhoto||null,content:`Round scheduled at ${schedForm.course}`,scheduleData:{course:schedForm.course,date:schedForm.date,time:schedForm.time,notes:schedForm.notes},reactions:{},comments:[],createdAt:new Date().toISOString()});
      showToast("Round scheduled ⛳");
    }
    setSchedForm(emptySchedForm());setSchedErrors({});setSchedModal(false);setEditSchedId(null);
  }

  function addMember(){const n=newMemberName.trim();if(!n||members.includes(n))return;const newM={uid:"manual_"+Date.now(),displayName:n,email:"",joinedAt:new Date().toISOString(),isAdmin:false};saveGroupMembers([...(groupData.membersList||[]),newM]);setNewMemberName("");showToast(`${n} added`);}
  function removeMember(name){if(!window.confirm(`Remove ${name}?`))return;saveGroupMembers((groupData.membersList||[]).filter(m=>m.displayName!==name));showToast(`${name} removed`,"danger");}
  function saveEditMember(){const n=memberEditName.trim();if(!n)return;saveGroupMembers((groupData.membersList||[]).map(m=>m.displayName===memberEditId?{...m,displayName:n}:m));setMemberEditId(null);setMemberEditName("");showToast("Name updated");}

  function postAnnouncement(){if(!annForm.text.trim())return;saveAnnouncement({...annForm,postedAt:new Date().toISOString()});setAnnPreview(false);showToast("Announcement posted 📢");}
  function clearAnnouncement(){saveAnnouncement(null);showToast("Announcement cleared","danger");}

  function validate(f){const e={};if(!f.playerName.trim())e.playerName="Required";if(!f.partnerName.trim())e.partnerName="Required";else if(f.playerName.trim().toLowerCase()===f.partnerName.trim().toLowerCase())e.partnerName="Must be different";if(!f.date)e.date="Required";if(!f.course.trim())e.course="Required";if(!f.score||isNaN(f.score)||+f.score<18||+f.score>200)e.score="Valid score 18–200";if(f.tees!=="blue")e.tees="Blue Tees only";if(f.courseRating&&(isNaN(f.courseRating)||+f.courseRating<60||+f.courseRating>80))e.courseRating="60–80";if(f.slope&&(isNaN(f.slope)||+f.slope<55||+f.slope>155))e.slope="55–155";return e;}
  function handleSubmit(){const e=validate(form);setErrors(e);if(Object.keys(e).length)return;const np=[...pendingRef.current,{...form,id:Date.now().toString(),score:+form.score,holes:+form.holes,courseRating:form.courseRating||"",slope:form.slope||"",submittedAt:new Date().toISOString(),status:"pending"}];savePending(np);setForm(emptyForm());setErrors({});showToast("Submitted — awaiting approval ⏳","pending");setView("home");}
  function handleEditSave(){const e=validate(form);setErrors(e);if(Object.keys(e).length)return;saveRounds(roundsRef.current.map(r=>r.id===editRound.id?{...r,...form,score:+form.score,holes:+form.holes}:r));setEditRound(null);setForm(emptyForm());setErrors({});showToast("Round updated ✓");setView("admin");}
  function approveRound(id){
    const r=pendingRef.current.find(p=>p.id===id);if(!r)return;
    const a={...r,approvedAt:new Date().toISOString()};
    delete a.status;delete a.rejectedAt;delete a.rejectNote;
    saveRounds([...roundsRef.current,a]);
    savePending(pendingRef.current.filter(p=>p.id!==id));
    // Auto-post to feed
    const profile=getProfileFor(r.playerName);
    addFeedPost({id:Date.now().toString(),type:"round",authorName:r.playerName,authorPhoto:profile?.profilePhoto||null,content:`Shot a ${r.score} at ${r.course} (${r.holes} holes)`,roundData:{score:r.score,course:r.course,holes:r.holes,date:r.date,partnerName:r.partnerName,courseRating:r.courseRating,slope:r.slope},photo:photos[r.id]||null,reactions:{},comments:[],createdAt:new Date().toISOString()});
    showToast(`✓ Approved — ${r.playerName}`);
  }
  function rejectRound(id){savePending(pendingRef.current.map(p=>p.id===id?{...p,status:"rejected",rejectedAt:new Date().toISOString(),rejectNote:rejectNote.trim()}:p));setRejectId(null);setRejectNote("");showToast("Round rejected","danger");}
  function handleDelete(id){saveRounds(roundsRef.current.filter(r=>r.id!==id));setDelConfirm(null);showToast("Round removed","danger");}
  function startEdit(round){setEditRound(round);setForm({playerName:round.playerName,partnerName:round.partnerName,date:round.date,course:round.course,score:round.score.toString(),holes:round.holes.toString(),tees:"blue",courseRating:round.courseRating||"",slope:round.slope||"",notes:round.notes||""});setErrors({});setView("submit");}

  function copyInvite(){navigator.clipboard.writeText(groupData.inviteCode).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}

  const rankings     = getRankings(rounds,members);
  const pendingCount = pending.filter(p=>p.status==="pending").length;
  const recentRounds = [...rounds].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  const upcomingEvt  = schedule.filter(e=>daysUntil(e.date)>=0).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const mostImproved = getMostImproved(rounds,members);
  const cmtsFor      = id=>comments.filter(c=>c.roundId===id);
  const toastBg      = toast?.type==="danger"?"rgba(192,64,64,.95)":toast?.type==="pending"?"rgba(13,56,20,.97)":"rgba(13,80,26,.95)";
  const TABS = ["home","standings","history","schedule","game","caddy",...(isAdmin?["admin"]:[])];

  function RCard(round,isAdm=false){return <RoundCardLive key={round.id} round={round} members={members} isAdmin={isAdm} rxns={reactions[round.id]} cmts={cmtsFor(round.id)} photo={photos[round.id]||null} onReact={handleReact} onComment={handleComment} onDeleteComment={handleDeleteComment} onPhotoUpload={handlePhotoUpload} onEdit={()=>startEdit(round)} onDelete={()=>setDelConfirm(round.id)} deleteConfirm={delConfirm===round.id} onDeleteConfirm={()=>handleDelete(round.id)} onDeleteCancel={()=>setDelConfirm(null)}/>;}

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans',sans-serif",color:C.cream,position:"relative"}}>
      <style>{css}</style>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,background:"linear-gradient(180deg,#2d6a35 0%,#1e4d26 100%)"}}/>

      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:1000,background:toastBg,backdropFilter:"blur(10px)",border:"1px solid rgba(77,184,96,.3)",borderRadius:10,padding:"12px 24px",fontSize:14,fontWeight:500,color:C.cream,boxShadow:"0 8px 30px rgba(0,0,0,.5)",whiteSpace:"nowrap",letterSpacing:.3}}>{toast.msg}</div>}

      {/* Schedule Modal */}
      {schedModal&&(<div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}><div style={{background:C.card,border:"1px solid rgba(42,107,52,.3)",borderRadius:20,padding:"28px 26px",width:"100%",maxWidth:420,boxShadow:"0 24px 80px rgba(0,0,0,.8)"}}><div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700,color:C.cream,letterSpacing:2,marginBottom:20}}>{editSchedId?"EDIT ROUND":"SCHEDULE A ROUND"}</div><div style={{display:"flex",flexDirection:"column",gap:16}}><Field label="Course Name" error={schedErrors.course}><input value={schedForm.course} onChange={e=>setSchedForm({...schedForm,course:e.target.value})} placeholder="e.g. Juliette Falls Golf Course" style={iStyle(schedErrors.course)}/></Field><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Field label="Date" error={schedErrors.date}><input type="date" value={schedForm.date} onChange={e=>setSchedForm({...schedForm,date:e.target.value})} style={{...iStyle(schedErrors.date),colorScheme:"dark"}}/></Field><Field label="Tee Time"><input type="time" value={schedForm.time} onChange={e=>setSchedForm({...schedForm,time:e.target.value})} style={{...iStyle(false),colorScheme:"dark"}}/></Field></div><Field label="Notes (optional)"><textarea value={schedForm.notes} onChange={e=>setSchedForm({...schedForm,notes:e.target.value})} placeholder="Details for the group…" rows={2} style={{...iStyle(false),resize:"none",fontFamily:"'DM Sans',sans-serif"}}/></Field><div style={{display:"flex",gap:10}}><button className="bh" onClick={()=>{setSchedModal(false);setSchedForm(emptySchedForm());setSchedErrors({});setEditSchedId(null);}} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:10,color:C.creamMuted,padding:"12px",fontSize:13,cursor:"pointer"}}>Cancel</button><button className="bh" onClick={handleSchedSubmit} style={{flex:1,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{editSchedId?"Save Changes":"Schedule It ⛳"}</button></div></div></div></div>)}

      {/* Header */}
      <div style={{position:"relative",zIndex:10,background:"#1e4d26",borderBottom:"1px solid rgba(201,162,39,.2)",boxShadow:"0 2px 12px rgba(0,0,0,.2)"}}>
        <div style={{height:3,background:`linear-gradient(90deg,transparent,${C.gold},${C.goldLight},${C.gold},transparent)`}}/>
        <div style={{maxWidth:720,margin:"0 auto",padding:"16px 24px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button onClick={onLeaveGroup} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:42,height:42,borderRadius:10,background:`linear-gradient(135deg,${C.cardMid},${C.green})`,border:"1.5px solid rgba(201,162,39,.45)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>⛳</div>
              </button>
              <div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:700,letterSpacing:2,color:C.cream}}>{groupData.name}</div>
                <div style={{fontSize:10,color:C.creamMuted,letterSpacing:3,textTransform:"uppercase",marginTop:1}}>Group Leaderboard</div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
              <button className="bh" onClick={()=>setShowInvite(v=>!v)} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,color:C.creamMuted,padding:"7px 12px",fontSize:11,cursor:"pointer",letterSpacing:1}}>🔗 INVITE</button>
              {isAdmin&&<button className="bh" onClick={()=>setView("admin")} style={{background:"rgba(201,162,39,.15)",border:"1px solid rgba(201,162,39,.3)",borderRadius:9,color:C.gold,padding:"7px 12px",fontSize:11,cursor:"pointer",letterSpacing:1,position:"relative"}}>ADMIN{pendingCount>0&&<span className="pulse" style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:C.greenBright,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:C.bg}}>{pendingCount}</span>}</button>}
              <button className="bh" onClick={()=>{setEditRound(null);setForm(emptyForm());setErrors({});setView("submit");}} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:10,color:"#0a1a0c",padding:"9px 16px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ POST ROUND</button>
            </div>
          </div>

          {/* Invite code bar */}
          {showInvite&&(<div style={{background:"rgba(5,14,6,.8)",border:"1px solid rgba(42,107,52,.3)",borderRadius:10,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Invite Code</div><div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:C.goldLight,letterSpacing:6}}>{groupData.inviteCode}</div></div><button className="bh" onClick={copyInvite} style={{background:copied?`rgba(42,107,52,.3)`:"rgba(255,255,255,.06)",border:copied?"1px solid rgba(77,184,96,.4)":"1px solid rgba(255,255,255,.1)",borderRadius:9,color:copied?C.greenBright:C.creamMuted,padding:"8px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>{copied?"✓ Copied!":"Copy Code"}</button></div>)}

          <div style={{display:"flex",gap:20,paddingBottom:4,flexWrap:"wrap"}}>
            {[{l:"Members",v:members.length},{l:"Active",v:rankings.filter(p=>p.roundCount>0).length},{l:"Rounds",v:rounds.length}].map(s=>(<div key={s.l} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.goldLight}}>{s.v}</span><span style={{fontSize:10,color:C.creamMuted,letterSpacing:1,textTransform:"uppercase"}}>{s.l}</span></div>))}
            {pendingCount>0&&<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:C.greenBright}}>{pendingCount}</span><span style={{fontSize:10,color:C.greenBright,letterSpacing:1,textTransform:"uppercase"}}>Pending</span></div>}
          </div>
          <div style={{display:"flex",gap:0,marginTop:12,overflowX:"auto"}}>
            {TABS.map(v=>(<button key={v} onClick={()=>{setView(v);setSelPlayer(null);}} className={(view===v&&!selPlayer)?"tl":""} style={{background:"none",border:"none",color:(view===v&&!selPlayer)?C.goldLight:C.creamMuted,padding:"9px 12px 11px",fontSize:10,cursor:"pointer",letterSpacing:2,textTransform:"uppercase",fontWeight:600,fontFamily:"'DM Sans',sans-serif",transition:"color .2s",whiteSpace:"nowrap"}}>{v}{v==="admin"&&pendingCount>0&&<span style={{marginLeft:5,background:C.greenBright,borderRadius:10,padding:"1px 5px",fontSize:9,color:C.bg,fontWeight:700,verticalAlign:"middle"}}>{pendingCount}</span>}</button>))}
          </div>
        </div>
      </div>

      {/* Profile Edit Modal */}
      {showProfileEdit&&(
        <ProfileEditModal
          currentUser={currentUser}
          profile={myProfile()}
          onSave={async(data)=>{await updateMyProfile(data);showToast("Profile updated ✓");}}
          onClose={()=>setShowProfileEdit(false)}
        />
      )}

      {/* Create Post Modal */}
      {showCreatePost&&(
        <CreatePostModal
          currentUser={currentUser}
          profile={myProfile()}
          onPost={handleCreatePost}
          onClose={()=>setShowCreatePost(false)}
        />
      )}

      {/* Main Content */}
      <div style={{maxWidth:720,margin:"0 auto",padding:"24px 20px 80px",position:"relative",zIndex:1}}>
        {selPlayer&&<PlayerProfile playerName={selPlayer} allRounds={rounds} rankings={rankings} members={members} profile={getProfileFor(selPlayer)} onBack={()=>setSelPlayer(null)}/>}

        {/* HOME = FEED */}
        {!selPlayer&&view==="home"&&(
          <FeedView
            feedPosts={feedPosts}
            currentUser={currentUser}
            members={members}
            isAdmin={isAdmin}
            announcement={announcement}
            userProfiles={userProfiles}
            groupData={groupData}
            onCreatePost={()=>setShowCreatePost(true)}
            onReact={handleFeedReact}
            onComment={handleFeedComment}
            onDeletePost={handleFeedDeletePost}
            onPlayerTap={setSelPlayer}
            onEditProfile={()=>setShowProfileEdit(true)}
          />
        )}

        {/* STANDINGS */}
        {!selPlayer&&view==="standings"&&(<div className="fi"><SectionHeader label="STANDINGS" right="AVG / 18 HOLES"/>{rankings.map((p,i)=>{const isTop=p.roundCount>0&&i===0,medal=["🥇","🥈","🥉"];return(<div key={p.name} className="rh" onClick={()=>setSelPlayer(p.name)} style={{background:isTop?"linear-gradient(135deg,rgba(201,162,39,.09),rgba(26,77,36,.25))":"rgba(13,32,16,.75)",border:isTop?"1px solid rgba(201,162,39,.28)":"1px solid rgba(42,107,52,.18)",borderRadius:14,padding:"14px 18px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:14}}><div style={{width:28,textAlign:"center",flexShrink:0}}>{isTop?<span className="sh" style={{fontSize:20}}>👑</span>:p.roundCount>0&&i<3?<span style={{fontSize:18}}>{medal[i]}</span>:<span style={{fontFamily:"'Cinzel',serif",fontSize:14,color:p.roundCount===0?C.creamMuted:C.creamDim,fontWeight:600}}>{p.roundCount===0?"—":i+1}</span>}</div><div style={{width:42,height:42,borderRadius:10,flexShrink:0,background:avatarColor(p.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif"}}>{initials(p.name)}</div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:15,color:isTop?C.goldLight:C.cream}}>{p.name}</div><div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>{p.roundCount>0?`${p.roundCount} round${p.roundCount!==1?"s":""} · Best: ${p.best} · HCP: ${p.handicap||"—"}`:"No rounds yet"}</div></div><div style={{textAlign:"right",flexShrink:0}}>{p.avg!==null?<><div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:700,color:isTop?C.goldLight:C.cream}}>{p.avg.toFixed(1)}</div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1}}>AVG</div></>:<div style={{fontSize:13,color:C.creamMuted}}>—</div>}</div><div style={{color:C.creamMuted,fontSize:13,flexShrink:0}}>›</div></div>);})}</div>)}

        {/* HISTORY */}
        {!selPlayer&&view==="history"&&(<div className="fi"><SectionHeader label="ALL ROUNDS" right={`${rounds.length} TOTAL`}/><div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:18}}>{members.map(m=><button key={m} className="bh" onClick={()=>setSelPlayer(m)} style={{background:"rgba(26,77,36,.2)",border:"1px solid rgba(42,107,52,.3)",borderRadius:20,color:C.creamDim,padding:"5px 13px",fontSize:12,cursor:"pointer"}}>{m}</button>)}</div>{rounds.length===0&&<Empty msg="No approved rounds yet"/>}{[...rounds].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>RCard(r))}</div>)}

        {/* SCHEDULE */}
        {!selPlayer&&view==="schedule"&&(<div className="fi"><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}><div><div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:600,color:C.cream}}>SCHEDULE</div><div style={{fontSize:12,color:C.creamMuted,marginTop:3}}>Upcoming rounds · RSVP to lock in your spot</div></div><button className="bh" onClick={()=>setSchedModal(true)} style={{background:`linear-gradient(135deg,${C.green},${C.greenLight})`,border:"1px solid rgba(77,184,96,.35)",borderRadius:10,color:C.cream,padding:"10px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ New Round</button></div>{upcomingEvt.length===0&&<Empty msg="No upcoming rounds scheduled"/>}{upcomingEvt.map(e=><ScheduleCard key={e.id} evt={e} members={members} onRsvp={handleRsvp} isAdmin={isAdmin} onDelete={handleDeleteSchedule} onEdit={handleEditSched}/>)}{schedule.filter(e=>daysUntil(e.date)<0).length>0&&(<div style={{marginTop:28}}><div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Past Rounds</div>{schedule.filter(e=>daysUntil(e.date)<0).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=><div key={e.id} style={{opacity:.5}}><ScheduleCard evt={e} members={members} onRsvp={handleRsvp} isAdmin={isAdmin} onDelete={handleDeleteSchedule} onEdit={handleEditSched} compact/></div>)}</div>)}</div>)}

        {/* GAME */}
        {!selPlayer&&view==="game"&&(<GameView members={members} games={games} saveGames={saveGames} currentUser={currentUser}/>)}

        {/* CADDY — bags stored on user profile globally */}
        {!selPlayer&&view==="caddy"&&(<CaddyView members={members} bags={bags} saveBags={async(b)=>{setBags(b);await setDoc(doc(db,groupId,"bags"),{map:b});await setDoc(doc(db,"userBags",currentUser.uid),{clubs:b[currentUser.displayName?.trim().toLowerCase()]||{}});}} currentUser={currentUser}/>)}

        {/* ADMIN */}
        {!selPlayer&&view==="admin"&&isAdmin&&(<div className="fi">
          <SectionHeader label="ADMIN"/>

          {/* Announcements */}
          <div style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"20px 22px",marginBottom:24}}>
            <SubHeader label="📢 Announcement"/>
            {announcement?.text&&(<div style={{marginBottom:16,padding:"12px 14px",background:"rgba(26,77,36,.15)",border:"1px solid rgba(77,184,96,.2)",borderRadius:10}}><div style={{fontSize:11,color:C.creamMuted,marginBottom:4}}>Currently live:</div><div style={{fontSize:13,color:C.cream}}>{announcement.text}</div><button className="bh" onClick={clearAnnouncement} style={{marginTop:10,background:"rgba(192,64,64,.15)",border:"1px solid rgba(192,64,64,.3)",borderRadius:7,color:"#e07070",padding:"5px 12px",fontSize:11,cursor:"pointer"}}>Clear</button></div>)}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10}}>
                <Field label="Title (optional)"><input value={annForm.title} onChange={e=>setAnnForm({...annForm,title:e.target.value})} placeholder="e.g. Season Update" style={iStyle(false)}/></Field>
                <Field label="Type"><select value={annForm.type} onChange={e=>setAnnForm({...annForm,type:e.target.value})} style={{...iStyle(false),appearance:"none",cursor:"pointer",minWidth:100}}><option value="info">📢 Info</option><option value="warning">⚠️ Warning</option><option value="urgent">🚨 Urgent</option></select></Field>
              </div>
              <Field label="Message"><textarea value={annForm.text} onChange={e=>setAnnForm({...annForm,text:e.target.value})} placeholder="Message to the group…" rows={3} style={{...iStyle(false),resize:"none",fontFamily:"'DM Sans',sans-serif"}}/></Field>
              <div style={{display:"flex",gap:10}}>{annForm.text&&<button className="bh" onClick={()=>setAnnPreview(v=>!v)} style={{background:"rgba(255,255,255,.05)",border:"none",borderRadius:9,color:C.creamMuted,padding:"9px 14px",fontSize:12,cursor:"pointer"}}>{annPreview?"Hide":"Preview"}</button>}<button className="bh" onClick={postAnnouncement} disabled={!annForm.text.trim()} style={{background:annForm.text.trim()?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:9,color:annForm.text.trim()?"#0a1a0c":C.creamMuted,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:annForm.text.trim()?"pointer":"not-allowed"}}>Post Announcement</button></div>
              {annPreview&&annForm.text&&<AnnouncementBanner announcement={{...annForm,postedAt:new Date().toISOString()}}/>}
            </div>
          </div>

          {/* Invite */}
          <div style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"20px 22px",marginBottom:24}}>
            <SubHeader label="🔗 Invite Code"/>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:32,fontWeight:700,color:C.goldLight,letterSpacing:8}}>{groupData.inviteCode}</div>
              <button className="bh" onClick={copyInvite} style={{background:copied?"rgba(42,107,52,.3)":"rgba(255,255,255,.06)",border:copied?"1px solid rgba(77,184,96,.4)":"1px solid rgba(255,255,255,.1)",borderRadius:9,color:copied?C.greenBright:C.creamMuted,padding:"9px 16px",fontSize:12,cursor:"pointer",fontWeight:600}}>{copied?"✓ Copied!":"Copy Code"}</button>
            </div>
            <div style={{fontSize:12,color:C.creamMuted,marginTop:8}}>Share this code with anyone you want to join {groupData.name}.</div>
          </div>

          {/* Members */}
          <div style={{background:"rgba(13,32,16,.8)",border:"1px solid rgba(42,107,52,.25)",borderRadius:16,padding:"20px 22px",marginBottom:24}}>
            <SubHeader label="👥 Members"/>
            <div style={{marginBottom:14}}>{(groupData.membersList||[]).map(m=>(<div key={m.uid} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:"rgba(5,14,6,.6)",border:"1px solid rgba(42,107,52,.2)",marginBottom:7}}><div style={{width:30,height:30,borderRadius:8,background:avatarColor(m.displayName),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif",flexShrink:0}}>{initials(m.displayName)}</div>{memberEditId===m.displayName?(<><input value={memberEditName} onChange={e=>setMemberEditName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveEditMember();}} autoFocus style={{...iStyle(false),flex:1,padding:"7px 10px",fontSize:13}}/><button className="bh" onClick={saveEditMember} style={{background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,border:"none",borderRadius:7,color:"#0a1a0c",padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Save</button><button className="bh" onClick={()=>{setMemberEditId(null);setMemberEditName("");}} style={{background:"rgba(255,255,255,.05)",border:"none",borderRadius:7,color:C.creamMuted,padding:"6px 10px",fontSize:11,cursor:"pointer"}}>✕</button></>):(<><span style={{flex:1,fontSize:14,color:C.cream,fontWeight:500}}>{m.displayName}</span>{m.uid===group.adminId&&<span style={{fontSize:9,background:"rgba(201,162,39,.15)",border:"1px solid rgba(201,162,39,.3)",borderRadius:4,padding:"2px 6px",color:C.gold,letterSpacing:1}}>ADMIN</span>}<button className="bh" onClick={()=>{setMemberEditId(m.displayName);setMemberEditName(m.displayName);}} style={{background:"rgba(42,107,52,.2)",border:"1px solid rgba(42,107,52,.35)",borderRadius:7,color:C.greenBright,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Rename</button><button className="bh" onClick={()=>removeMember(m.displayName)} style={{background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.25)",borderRadius:7,color:"#c07070",padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Remove</button></>)}</div>))}</div>
            <div style={{display:"flex",gap:10}}><input value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addMember();}} placeholder="Add member manually…" style={{...iStyle(false),flex:1,padding:"10px 14px",fontSize:13}}/><button className="bh" onClick={addMember} disabled={!newMemberName.trim()} style={{background:newMemberName.trim()?`linear-gradient(135deg,${C.green},${C.greenLight})`:"rgba(60,60,60,.3)",border:"none",borderRadius:10,color:newMemberName.trim()?C.cream:C.creamMuted,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:newMemberName.trim()?"pointer":"not-allowed",whiteSpace:"nowrap"}}>+ Add</button></div>
          </div>

          {/* Pending */}
          <div style={{marginBottom:24}}>
            <SubHeader label={`Pending Approval (${pendingCount})`}/>
            {pending.filter(p=>p.status==="pending").length===0&&<div style={{background:"rgba(26,77,36,.1)",border:"1px dashed rgba(42,107,52,.25)",borderRadius:12,padding:"24px",textAlign:"center",color:C.creamMuted,fontSize:13}}>No rounds awaiting approval</div>}
            {pending.filter(p=>p.status==="pending").map(r=>(<div key={r.id} style={{background:"rgba(26,77,36,.15)",border:"1px solid rgba(77,184,96,.25)",borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}><div style={{width:32,height:32,borderRadius:8,background:avatarColor(r.playerName),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.cream,fontFamily:"'Cinzel',serif"}}>{initials(r.playerName)}</div><span style={{fontWeight:600,fontSize:15,color:C.cream}}>{r.playerName}</span><span style={{color:C.creamMuted,fontSize:12}}>w/ {r.partnerName}</span></div><div style={{fontSize:12,color:C.creamDim,lineHeight:1.9}}><span style={{marginRight:10}}>📍 {r.course}</span><span style={{marginRight:10}}>📅 {formatDate(r.date)}</span><span style={{background:"rgba(26,77,36,.4)",border:"1px solid rgba(42,107,52,.35)",borderRadius:4,padding:"1px 7px",fontSize:11,marginRight:8}}>{r.holes}H</span></div><div style={{fontSize:11,color:C.creamMuted,marginTop:4}}>Submitted {new Date(r.submittedAt).toLocaleString()}</div></div><div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:700,color:C.goldLight}}>{r.score}</div><div style={{fontSize:10,color:C.creamMuted,letterSpacing:1}}>STROKES</div><div style={{display:"flex",gap:7,marginTop:10}}><button className="bh" onClick={()=>approveRound(r.id)} style={{background:"rgba(42,138,58,.25)",border:"1px solid rgba(42,138,58,.4)",borderRadius:8,color:"#6ae0a0",padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:600}}>✓ APPROVE</button><button className="bh" onClick={()=>{setRejectId(r.id);setRejectNote("");}} style={{background:"rgba(192,64,64,.15)",border:"1px solid rgba(192,64,64,.3)",borderRadius:8,color:"#e07070",padding:"7px 14px",fontSize:12,cursor:"pointer"}}>✕ REJECT</button></div></div></div>{rejectId===r.id&&(<div style={{marginTop:14,padding:"14px",background:"rgba(192,64,64,.08)",border:"1px solid rgba(192,64,64,.2)",borderRadius:10}}><div style={{fontSize:12,color:"#e07070",marginBottom:8}}>Rejection reason (optional):</div><textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)} rows={2} style={{width:"100%",padding:"9px 12px",borderRadius:8,background:"rgba(5,14,6,.9)",border:"1px solid rgba(192,64,64,.3)",color:C.cream,fontSize:13,outline:"none",resize:"none",fontFamily:"'DM Sans',sans-serif"}}/><div style={{display:"flex",gap:8,marginTop:10}}><button className="bh" onClick={()=>setRejectId(null)} style={{flex:1,background:"rgba(255,255,255,.05)",border:"none",borderRadius:8,color:C.creamMuted,padding:"8px",fontSize:12,cursor:"pointer"}}>Cancel</button><button className="bh" onClick={()=>rejectRound(r.id)} style={{flex:1,background:"rgba(192,64,64,.25)",border:"none",borderRadius:8,color:"#e08080",padding:"8px",fontSize:12,cursor:"pointer",fontWeight:600}}>Confirm Reject</button></div></div>)}</div>))}
          </div>

          {/* Approved rounds */}
          <div><SubHeader label={`Approved Rounds (${rounds.length})`}/>{rounds.length===0&&<Empty msg="No approved rounds yet"/>}{[...rounds].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>RCard(r,true))}</div>
        </div>)}

        {/* SUBMIT */}
        {!selPlayer&&view==="submit"&&(<div className="fi">
          <button className="bh" onClick={()=>{setView(editRound&&isAdmin?"admin":"home");setEditRound(null);}} style={{background:"none",border:"none",color:C.creamMuted,fontSize:12,cursor:"pointer",letterSpacing:2,marginBottom:10}}>← BACK</button>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:600,color:C.cream,marginBottom:4}}>{editRound?"EDIT ROUND":"SUBMIT A ROUND"}</div>
          <div style={{fontSize:13,color:C.creamMuted,marginBottom:24}}>🔵 Blue Tees only · Must be played with a group member · Awaits admin approval</div>
          <div style={{background:"rgba(10,26,12,.9)",border:"1px solid rgba(42,107,52,.25)",borderRadius:18,padding:"28px 24px"}}>
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {[{key:"playerName",label:"Your Name"},{key:"partnerName",label:"Playing Partner"}].map(({key,label})=>(<Field key={key} label={label} error={errors[key]}><select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} style={{...iStyle(errors[key]),appearance:"none",cursor:"pointer"}}><option value="">Select…</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></Field>))}
              </div>
              <Field label="Course Name" error={errors.course}><input value={form.course} onChange={e=>setForm({...form,course:e.target.value})} placeholder="e.g. Juliette Falls Golf Course" style={iStyle(errors.course)}/></Field>
              <Field label="Tee Box" error={errors.tees}>
                <div style={{display:"flex",gap:10}}>
                  {[{val:"blue",icon:"🔵",label:"Blue"},{val:"white",icon:"⚪",label:"White"},{val:"red",icon:"🔴",label:"Red"},{val:"gold",icon:"🟡",label:"Gold"}].map(t=>(<button key={t.val} onClick={()=>setForm({...form,tees:t.val})} style={{flex:1,padding:"10px 6px",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .2s",background:form.tees===t.val?(t.val==="blue"?"rgba(26,107,52,.5)":"rgba(80,30,30,.4)"):"rgba(5,14,6,.8)",border:form.tees===t.val?(t.val==="blue"?`2px solid ${C.greenBright}`:"2px solid rgba(192,64,64,.5)"):"1px solid rgba(42,107,52,.3)",color:form.tees===t.val?(t.val==="blue"?C.greenBright:"#e07070"):C.creamMuted}}>{t.icon} {t.label}</button>))}
                </div>
                {form.tees!=="blue"&&<div style={{marginTop:10,background:"rgba(192,64,64,.1)",border:"1px solid rgba(192,64,64,.3)",borderRadius:9,padding:"10px 14px",fontSize:13,color:"#e07070"}}>⛔ Only Blue Tee rounds accepted.</div>}
              </Field>
              <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr",gap:16}}>
                <Field label="Date" error={errors.date}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{...iStyle(errors.date),colorScheme:"dark"}}/></Field>
                <Field label="Holes"><select value={form.holes} onChange={e=>setForm({...form,holes:e.target.value})} style={{...iStyle(false),cursor:"pointer"}}><option value="18">18</option><option value="9">9</option></select></Field>
                <Field label="Score" error={errors.score}><input type="number" value={form.score} onChange={e=>setForm({...form,score:e.target.value})} placeholder="84" min="18" max="200" style={iStyle(errors.score)}/></Field>
              </div>
              <div>
                <div style={{fontSize:10,color:C.creamMuted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Course Info <span style={{fontWeight:400,letterSpacing:0,textTransform:"none",color:C.creamMuted}}>(optional — for handicap)</span></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <Field label="Course Rating" error={errors.courseRating}><input type="number" value={form.courseRating} onChange={e=>setForm({...form,courseRating:e.target.value})} placeholder="71.4" step="0.1" style={iStyle(errors.courseRating)}/></Field>
                  <Field label="Slope Rating" error={errors.slope}><input type="number" value={form.slope} onChange={e=>setForm({...form,slope:e.target.value})} placeholder="128" style={iStyle(errors.slope)}/></Field>
                </div>
              </div>
              <Field label="Notes (optional)"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Highlights, birdies, trash talk…" rows={3} style={{...iStyle(false),resize:"vertical",fontFamily:"'DM Sans',sans-serif"}}/></Field>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,rgba(42,107,52,.4),transparent)`}}/>
              <button className="bh" onClick={editRound?handleEditSave:handleSubmit} style={{background:form.tees==="blue"?`linear-gradient(135deg,${C.gold},${C.goldDim})`:"rgba(60,60,60,.3)",border:"none",borderRadius:12,color:form.tees==="blue"?"#0a1a0c":C.creamMuted,padding:"15px",fontSize:14,fontWeight:700,cursor:form.tees==="blue"?"pointer":"not-allowed",letterSpacing:2,fontFamily:"'Cinzel',sans-serif",boxShadow:form.tees==="blue"?"0 6px 24px rgba(201,162,39,.25)":"none",transition:"all .2s"}}>{editRound?"SAVE CHANGES":"SUBMIT FOR APPROVAL ⛳"}</button>
            </div>
          </div>
        </div>)}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function DTG(){
  const [user,         setUser]         = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [currentGroup, setCurrentGroup] = useState(null);

  useEffect(()=>{
    return onAuthStateChanged(auth,(u)=>{
      setUser(u);
      setAuthLoading(false);
    });
  },[]);

  if(authLoading){
    return(
      <div style={{minHeight:"100vh",background:"#1e4d26",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
        <style>{css}</style>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:16}}>⛳</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:700,letterSpacing:4,color:"#f5f0e8"}}>DTG</div>
          <div style={{marginTop:16}}><Spinner/></div>
        </div>
      </div>
    );
  }

  if(!user) return <AuthScreen/>;
  if(!currentGroup) return <GroupSelectScreen currentUser={user} onSelectGroup={setCurrentGroup}/>;
  return <GroupApp currentUser={user} group={currentGroup} onLeaveGroup={()=>setCurrentGroup(null)}/>;
}
