/**
 * Tiny ambient gold star field, intentionally low-power.
 * Visual only: no microphone, camera, network, tracking, or persistent data.
 */
export function initAmbientParticles(canvas) {
  if (!canvas || !canvas.getContext) return () => {};
  const ctx = canvas.getContext('2d', {alpha: true});
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stars = [];
  let raf = 0;
  let timer = 0;
  let last = 0;
  let width = 0;
  let height = 0;
  let disposed = false;
  let suspendedForAI = false;
  const random = (a,b) => a + Math.random() * (b - a);
  const makeStar = () => ({
    x:random(0,width), y:random(0,height),
    radius:random(.35,1.2),
    velocityX:random(-.09,.09), velocityY:random(-.14,-.025),
    alpha:random(.18,.55), twinkle:random(0,Math.PI*2), speed:random(.001,.004)
  });
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1,1.5);
    width = Math.max(1,window.innerWidth);
    height = Math.max(1,window.innerHeight);
    canvas.width = Math.round(width*dpr);
    canvas.height = Math.round(height*dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    stars.length = 0;
    const total = Math.min(100, Math.max(35, Math.round(width/17)));
    for (let i=0;i<total;i++) stars.push(makeStar());
  }
  function scheduleNext() {
    // When the AI is running in Smooth mode, avoid even requesting 60 visual
    // animation callbacks per second for particles that cannot be seen.
    const suspended = document.body.classList.contains('ai-active') &&
      document.body.classList.contains('smooth-ai');
    if (suspended) {
      timer = window.setTimeout(() => {
        timer = 0;
        raf = requestAnimationFrame(draw);
      }, 500);
    } else raf = requestAnimationFrame(draw);
  }
  function draw(now) {
    if (disposed) return;
    scheduleNext();
    const minimumFrameMs = document.body.classList.contains('ai-active') ? 85 : 45;
    if (document.hidden) return;
    if (document.body.classList.contains('ai-active') &&
        document.body.classList.contains('smooth-ai')) {
      if (!suspendedForAI) ctx.clearRect(0,0,width,height);
      suspendedForAI = true;
      return;
    }
    suspendedForAI = false;
    if (now-last < minimumFrameMs) return;
    last=now;
    ctx.clearRect(0,0,width,height);
    if (reduceMotion.matches) return;
    const light=document.body.dataset.theme === 'light';
    const color=light?'112,81,20':'228,190,88';
    for (const s of stars) {
      s.x+=s.velocityX;
      s.y+=s.velocityY;
      if(s.y < -5) {s.y=height+5; s.x=random(0,width);}
      if(s.x < -5) s.x=width+5;
      if(s.x > width+5) s.x=-5;
      const flicker=.75+.25*Math.sin(now*s.speed+s.twinkle);
      ctx.fillStyle=`rgba(${color},${s.alpha*flicker})`;
      ctx.beginPath();
      ctx.arc(s.x,s.y,s.radius,0,Math.PI*2);
      ctx.fill();
    }
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  raf=requestAnimationFrame(draw);
  return ()=>{disposed=true;cancelAnimationFrame(raf);window.clearTimeout(timer);window.removeEventListener('resize',resize);};
}
