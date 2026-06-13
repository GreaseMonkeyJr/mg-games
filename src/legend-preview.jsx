import { useEffect, useRef } from "react";

const BODY_R = 13;

export default function LegendPreview() {
  const canvasRef = useRef(null);
  const animRef   = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    // --- Seeded pseudo-random (stable per spot) ---
    function seededRand(seed) {
      let s = seed;
      return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
    }

    // --- Draw leopard spots clipped to a path ---
    // Each spot: dark ring outline + golden fill, random size/rotation/position
    function drawSpots(clipFn, seed, count) {
      ctx.save();
      ctx.beginPath(); clipFn(); ctx.clip();

      const rand = seededRand(seed);

      // Get clip bounding box from canvas size
      const bx = 0, by = 0, bw = W, bh = H;

      for (let i = 0; i < count; i++) {
        // Random position spread across bounding area
        const cx = bx + rand() * bw;
        const cy = by + rand() * bh;
        const rx  = 7  + rand() * 14;   // very varied sizes
        const ry  = 5  + rand() * 10;
        const rot = rand() * Math.PI;
        const gap = 2 + rand() * 3;      // gap between ring and fill

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        // Outer dark ring (crescent-like — not a full ring, broken)
        // Draw 2-4 arc segments around the ellipse to simulate leopard rosette
        const segments = Math.floor(2 + rand() * 3);
        for (let s = 0; s < segments; s++) {
          const startA = (s / segments) * Math.PI * 2 + rand() * 0.4;
          const endA   = startA + (0.5 + rand() * 0.8);
          ctx.beginPath();
          ctx.ellipse(0, 0, rx + gap, ry + gap, 0, startA, endA);
          ctx.lineWidth  = 2.5 + rand() * 2.5;
          ctx.strokeStyle = "#1a0d00";
          ctx.stroke();
        }

        // Golden fill centre
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0,   "#ffe066");
        g.addColorStop(0.5, "#d4a020");
        g.addColorStop(1,   "#a07010");
        ctx.fillStyle = g;
        ctx.fill();

        ctx.restore();
      }
      ctx.restore();
    }

    // --- Body path: sine-wave slither ---
    function getPath(t) {
      const pts = [];
      for (let i = 0; i < 300; i++) {
        const p = i / 300;
        const x = W/2
          + Math.sin(p * Math.PI * 2.4 + t * 0.6) * 95
          + Math.sin(p * Math.PI * 1.1 + t * 0.35) * 30;
        const y = 52 + p * (H - 104);
        pts.push({ x, y });
      }
      return pts;
    }

    // --- Draw body ribbon ---
    function drawRibbon(pts, width, color, alpha) {
      ctx.save();
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(pts[pts.length-1].x, pts[pts.length-1].y);
      for (let i = pts.length-2; i >= 1; i--) {
        const mx = (pts[i].x + pts[i-1].x)/2;
        const my = (pts[i].y + pts[i-1].y)/2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.strokeStyle = color;
      ctx.lineWidth   = width;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.stroke();
      ctx.restore();
    }

    // --- Draw spots clipped to the body ribbon shape ---
    function drawBodySpots(pts) {
      // Build a thick stroke path, then clip to it and draw spots inside
      ctx.save();

      // Create clip path by building a path around the ribbon
      ctx.beginPath();
      // Build the path from scratch as a filled region (offset each side)
      const R = BODY_R;
      function bodyClip() {
        ctx.beginPath();
        ctx.moveTo(pts[pts.length-1].x, pts[pts.length-1].y);
        for (let i = pts.length-2; i >= 1; i--) {
          const mx = (pts[i].x + pts[i-1].x)/2;
          const my = (pts[i].y + pts[i-1].y)/2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[0].x, pts[0].y);
        ctx.lineWidth = R * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(); // we'll use this as a clip trick via fillRect
      }

      // Use an offscreen approach: stroke a wide path to create clip
      // Actually: just use the ribbon stroke as a clip by using ctx.isPointInStroke? No.
      // Better: duplicate the ribbon path as a filled stroke trick
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[pts.length-1].x, pts[pts.length-1].y);
      for (let i = pts.length-2; i >= 1; i--) {
        const mx = (pts[i].x + pts[i-1].x)/2;
        const my = (pts[i].y + pts[i-1].y)/2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.save();
      ctx.lineWidth = BODY_R * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#000";
      // Use this path as a clip: stroke then use globalCompositeOperation trick
      // Simplest: just draw spots everywhere then mask outside with ribbon overdraw
      // We'll clip via a helper: draw spots on a temp canvas
      ctx.restore();
      ctx.restore();

      // Simple approach: draw spots on a layer, overdraw outside with black
      // Just draw spots inline with the ribbon's bounding area
      drawSpots(() => {
        ctx.beginPath();
        ctx.moveTo(pts[pts.length-1].x, pts[pts.length-1].y);
        for (let i = pts.length-2; i >= 1; i--) {
          const mx = (pts[i].x + pts[i-1].x)/2;
          const my = (pts[i].y + pts[i-1].y)/2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[0].x, pts[0].y);
        ctx.lineWidth = BODY_R * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(); // makes the path "filled" for clip purposes
      }, 42, 55);

      ctx.restore();
    }

    // ── Pre-generate spots in snake-local space (stable, don't move) ──
    const spots = [];
    {
      let _s = 0x4fa3e1;
      const rand = () => { _s = (_s * 1664525 + 1013904223) & 0xffffffff; return (_s >>> 0) / 0xffffffff; };
      for (let i = 0; i < 60; i++) {
        const rx     = 3 + rand() * rand() * 16;
        const ry     = 2 + rand() * rand() * 10;
        const goldH  = rand();
        const r      = Math.floor(200 + goldH * 55);
        const g2     = Math.floor(140 + goldH * 80);
        const b      = Math.floor(rand() * 20);
        const nSegs  = 1 + Math.floor(rand() * 4);
        const segs   = [];
        for (let s = 0; s < nSegs; s++) {
          segs.push({ sa: rand() * Math.PI * 2, al: 0.3 + rand() * 1.2 });
        }
        spots.push({
          t:         rand(),                        // position along body (0=head, 1=tail)
          side:      (rand() - 0.5) * 2,            // -1..1 across width
          rx, ry,
          rot:       rand() * Math.PI,
          gap:       1 + rand() * 2,
          ringW:     1.5 + rand() * 3,
          ringColor: `rgba(${10+Math.floor(rand()*15)},${5+Math.floor(rand()*10)},0,${0.7+rand()*0.3})`,
          segs,
          c0: `rgb(${Math.min(255,r+40)},${Math.min(255,g2+40)},${b})`,
          c1: `rgb(${r},${g2},${b})`,
          c2: `rgb(${Math.max(0,r-50)},${Math.max(0,g2-50)},${b})`,
        });
      }
    }

    let start = null;

    function draw(ts) {
      if (!start) start = ts;
      const t = (ts - start) / 1000;

      ctx.clearRect(0, 0, W, H);
      // Background — grass
      ctx.fillStyle = "#2a5018"; ctx.fillRect(0, 0, W, H);
      ["#3a7d2c","#4a9a38","#3a7d2c"].forEach((c,i) => {
        ctx.fillStyle = c;
        ctx.fillRect(i*(W/3), 0, W/3, H);
      });
      [1,2].forEach(i => {
        ctx.strokeStyle="#5c3d1a"; ctx.lineWidth=4;
        ctx.beginPath(); ctx.moveTo(i*W/3,0); ctx.lineTo(i*W/3,H); ctx.stroke();
      });

      const pts = getPath(t * 0.55);

      // 1. Black body base
      drawRibbon(pts, BODY_R*2+6, "#0d0806");
      drawRibbon(pts, BODY_R*2,   "#0a0705");

      // 2. Spots clipped inside body
      // Use compositing trick: draw spots on body using "source-atop" style
      // We draw ribbon to an offscreen then draw spots — simplest: use save/restore with clip via stroke
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[pts.length-1].x, pts[pts.length-1].y);
      for (let i = pts.length-2; i >= 1; i--) {
        const mx=(pts[i].x+pts[i-1].x)/2, my=(pts[i].y+pts[i-1].y)/2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[0].x, pts[0].y);
      // Create clip from the stroke shape
      // Canvas doesn't clip to stroke directly, so we'll use a workaround:
      // Build a region by drawing thick lines and using globalCompositeOperation
      ctx.restore();

      // ─── Cleanest approach: offscreen canvas for body texture ───
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const oc = off.getContext("2d");

      // Draw spots all over offscreen
      const rand = seededRand(99);
      for (let i = 0; i < 70; i++) {
        const cx  = rand() * W;
        const cy  = rand() * H;
        const rx  = 6 + rand() * 13;
        const ry  = 4 + rand() * 9;
        const rot = rand() * Math.PI;
        const gap = 1.5 + rand() * 2.5;
        const segs = Math.floor(2 + rand() * 3);

        oc.save();
        oc.translate(cx, cy);
        oc.rotate(rot);

        for (let s = 0; s < segs; s++) {
          const sa = (s/segs)*Math.PI*2 + rand()*0.5;
          const ea = sa + 0.5 + rand()*0.9;
          oc.beginPath();
          oc.ellipse(0, 0, rx+gap, ry+gap, 0, sa, ea);
          oc.lineWidth = 2.5+rand()*2.5;
          oc.strokeStyle = "#1a0d00"; oc.stroke();
        }

        oc.beginPath();
        oc.ellipse(0, 0, rx, ry, 0, 0, Math.PI*2);
        const g = oc.createRadialGradient(0,0,0,0,0,rx);
        g.addColorStop(0,   "#ffe066");
        g.addColorStop(0.5, "#d4a020");
        g.addColorStop(1,   "#a07010");
        oc.fillStyle = g; oc.fill();
        oc.restore();
      }

      // Mask offscreen to ribbon shape using destination-in
      oc.save();
      oc.globalCompositeOperation = "destination-in";
      oc.beginPath();
      oc.moveTo(pts[pts.length-1].x, pts[pts.length-1].y);
      for (let i = pts.length-2; i >= 1; i--) {
        const mx=(pts[i].x+pts[i-1].x)/2, my=(pts[i].y+pts[i-1].y)/2;
        oc.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      oc.lineTo(pts[0].x, pts[0].y);
      oc.lineWidth  = BODY_R * 2;
      oc.lineCap    = "round";
      oc.lineJoin   = "round";
      oc.strokeStyle = "#000";
      oc.stroke();
      oc.restore();

      // Draw textured body onto main canvas
      ctx.drawImage(off, 0, 0);

      // Body outline
      drawRibbon(pts, BODY_R*2+6, "#060402", 0.55);

      // ── HEAD ──
      const h0 = pts[0], h5 = pts[Math.min(6, pts.length-1)];
      const ang  = Math.atan2(h0.y - h5.y, h0.x - h5.x);
      const perp = ang + Math.PI/2;
      const p = (fwd, side) => ({
        x: h0.x + Math.cos(ang)*fwd + Math.cos(perp)*side,
        y: h0.y + Math.sin(ang)*fwd + Math.sin(perp)*side,
      });

      const HW = BODY_R + 4, HL = BODY_R * 2.2;

      // Head outline
      ctx.save();
      ctx.beginPath();
      const nkM=p(-HL*.7,0), bkL=p(-HL*.5,HW*.95), bkR=p(-HL*.5,-HW*.95);
      const mdL=p(HL*.05,HW), mdR=p(HL*.05,-HW);
      const ckL=p(HL*.55,HW*.88), ckR=p(HL*.55,-HW*.88);
      const snL=p(HL*1.0,HW*.5), snR=p(HL*1.0,-HW*.5);
      const snT=p(HL*1.1,0);
      ctx.moveTo(nkM.x,nkM.y);
      ctx.bezierCurveTo(bkL.x,bkL.y,mdL.x,mdL.y,mdL.x,mdL.y);
      ctx.bezierCurveTo(mdL.x,mdL.y,ckL.x,ckL.y,snL.x,snL.y);
      ctx.bezierCurveTo(snL.x,snL.y,snT.x,snT.y,snT.x,snT.y);
      ctx.bezierCurveTo(snT.x,snT.y,snR.x,snR.y,snR.x,snR.y);
      ctx.bezierCurveTo(ckR.x,ckR.y,mdR.x,mdR.y,mdR.x,mdR.y);
      ctx.bezierCurveTo(mdR.x,mdR.y,bkR.x,bkR.y,nkM.x,nkM.y);
      ctx.closePath();
      ctx.fillStyle="#0a0705"; ctx.fill();
      ctx.strokeStyle="#060402"; ctx.lineWidth=2.5; ctx.stroke();
      ctx.restore();

      // Head leopard spots (offscreen)
      const hOff = document.createElement("canvas");
      hOff.width = W; hOff.height = H;
      const hc = hOff.getContext("2d");
      const hr = seededRand(77);
      for (let i = 0; i < 18; i++) {
        const fx = -HL*0.6 + hr()*(HL*1.6);
        const fy = -HW*0.85 + hr()*(HW*1.7);
        const bx = h0.x + Math.cos(ang)*fx + Math.cos(perp)*fy;
        const by = h0.y + Math.sin(ang)*fx + Math.sin(perp)*fy;
        const rx = 4 + hr()*7;
        const ry = 3 + hr()*5;
        const rot = hr()*Math.PI;
        const segs = Math.floor(2+hr()*2);
        hc.save(); hc.translate(bx,by); hc.rotate(rot);
        for (let s=0;s<segs;s++){
          const sa=(s/segs)*Math.PI*2+hr()*0.5;
          const ea=sa+0.5+hr()*0.8;
          hc.beginPath(); hc.ellipse(0,0,rx+2,ry+2,0,sa,ea);
          hc.lineWidth=2+hr()*2; hc.strokeStyle="#1a0d00"; hc.stroke();
        }
        hc.beginPath(); hc.ellipse(0,0,rx,ry,0,0,Math.PI*2);
        const g2=hc.createRadialGradient(0,0,0,0,0,rx);
        g2.addColorStop(0,"#ffe066"); g2.addColorStop(0.5,"#d4a020"); g2.addColorStop(1,"#a07010");
        hc.fillStyle=g2; hc.fill();
        hc.restore();
      }
      // Mask to head shape
      hc.save();
      hc.globalCompositeOperation="destination-in";
      hc.beginPath();
      hc.moveTo(nkM.x,nkM.y);
      hc.bezierCurveTo(bkL.x,bkL.y,mdL.x,mdL.y,mdL.x,mdL.y);
      hc.bezierCurveTo(mdL.x,mdL.y,ckL.x,ckL.y,snL.x,snL.y);
      hc.bezierCurveTo(snL.x,snL.y,snT.x,snT.y,snT.x,snT.y);
      hc.bezierCurveTo(snT.x,snT.y,snR.x,snR.y,snR.x,snR.y);
      hc.bezierCurveTo(ckR.x,ckR.y,mdR.x,mdR.y,mdR.x,mdR.y);
      hc.bezierCurveTo(mdR.x,mdR.y,bkR.x,bkR.y,nkM.x,nkM.y);
      hc.closePath(); hc.fill();
      hc.restore();
      ctx.drawImage(hOff, 0, 0);

      // Head outline on top
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(nkM.x,nkM.y);
      ctx.bezierCurveTo(bkL.x,bkL.y,mdL.x,mdL.y,mdL.x,mdL.y);
      ctx.bezierCurveTo(mdL.x,mdL.y,ckL.x,ckL.y,snL.x,snL.y);
      ctx.bezierCurveTo(snL.x,snL.y,snT.x,snT.y,snT.x,snT.y);
      ctx.bezierCurveTo(snT.x,snT.y,snR.x,snR.y,snR.x,snR.y);
      ctx.bezierCurveTo(ckR.x,ckR.y,mdR.x,mdR.y,mdR.x,mdR.y);
      ctx.bezierCurveTo(mdR.x,mdR.y,bkR.x,bkR.y,nkM.x,nkM.y);
      ctx.closePath();
      ctx.strokeStyle="#060402"; ctx.lineWidth=2.5; ctx.stroke();
      ctx.restore();

      // Eyes
      const eyeDist=HW*0.52, eyeFwd=HW*0.0;
      [-1,1].forEach(side=>{
        const ex=h0.x+Math.cos(ang)*eyeFwd+Math.cos(perp)*side*eyeDist;
        const ey=h0.y+Math.sin(ang)*eyeFwd+Math.sin(perp)*side*eyeDist;
        ctx.beginPath(); ctx.arc(ex,ey,BODY_R*0.42,0,Math.PI*2); ctx.fillStyle="#060302"; ctx.fill();
        ctx.beginPath(); ctx.arc(ex,ey,BODY_R*0.29,0,Math.PI*2);
        const ig=ctx.createRadialGradient(ex,ey,0,ex,ey,BODY_R*0.29);
        ig.addColorStop(0,"#a07820"); ig.addColorStop(1,"#3a1a04");
        ctx.fillStyle=ig; ctx.fill();
        ctx.beginPath(); ctx.arc(ex,ey,BODY_R*0.15,0,Math.PI*2); ctx.fillStyle="#050200"; ctx.fill();
        ctx.beginPath(); ctx.arc(ex-2,ey-2,BODY_R*0.08,0,Math.PI*2); ctx.fillStyle="rgba(255,255,255,0.75)"; ctx.fill();
      });

      // Nostrils
      [-0.32,0.32].forEach(s=>{
        const n=p(HL*0.88,HW*s*0.45);
        ctx.save(); ctx.translate(n.x,n.y); ctx.rotate(ang);
        ctx.beginPath(); ctx.ellipse(0,0,2.5,1.6,0,0,Math.PI*2);
        ctx.fillStyle="#060302"; ctx.fill(); ctx.restore();
      });

      // Tongue
      const flick=Math.abs(Math.sin(t*2.5));
      const tBase=p(HL*1.12,0);
      ctx.strokeStyle="#cc1515"; ctx.lineWidth=1.8; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(tBase.x,tBase.y);
      const tEnd={x:tBase.x+Math.cos(ang)*(10+flick*7),y:tBase.y+Math.sin(ang)*(10+flick*7)};
      ctx.lineTo(tEnd.x,tEnd.y); ctx.stroke();
      const fk={x:tBase.x+Math.cos(ang)*(7+flick*4),y:tBase.y+Math.sin(ang)*(7+flick*4)};
      [-0.45,0.45].forEach(a=>{
        ctx.beginPath(); ctx.moveTo(fk.x,fk.y);
        ctx.lineTo(fk.x+Math.cos(ang+a)*5,fk.y+Math.sin(ang+a)*5); ctx.stroke();
      });

      // Label
      ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(0,H-44,W,44);
      ctx.fillStyle="#ffd700"; ctx.font="bold 14px Georgia,serif"; ctx.textAlign="center";
      ctx.fillText("👑 LEGEND — Leopard Python", W/2, H-26);
      ctx.fillStyle="#d4a820"; ctx.font="10px Georgia,serif";
      ctx.fillText("Complete all achievements to unlock", W/2, H-10);

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0a1005"}}>
      <canvas ref={canvasRef} width={300} height={520}
        style={{borderRadius:14,border:"3px solid #8b6014",boxShadow:"0 0 40px rgba(212,168,32,0.35)"}}/>
    </div>
  );
}
