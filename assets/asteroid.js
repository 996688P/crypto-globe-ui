/* HW_ASTEROID_BELT_V256x
  作者 2026-09-30(第十一轮):
    · "小行星币围绕着地球飘就可以了 四面八方的"
       → 取消"冲向面板/外出"逻辑; 每颗币在【自己随机的 3D 轨道平面】上环绕地球
         (半径/倾角/交点/速度/相位 全随机) → 四面八方全 3D 环绕
    · "向着屏幕的或者回去的太快了" → 角速度放慢(0.045~0.11 rad/s ≈ 60~140s/圈)
    · "空间感 距离感 沉浸感" →
        ① 真 3D 遮挡: depthTest 开 → 飘到地球背后的币被地球挡住(藏在后面)
        ② 空气透视: 越远越暗 + 略小 → 距离感
        ③ 保留: 透玻璃外壳 + 币 logo + 呼吸 + 自转
    · "所有贴纸最清楚" → assets/coins_hi/*.png (512×512 SVG矢量光栅化)
  独立绕球体; 逐帧由 主模块 的 tick 调用 __cgAsteroidFrame。 */
(function () {
  'use strict';
  if (window.__cgAsteroidV3) return;
  window.__cgAsteroidV3 = 1;
  window.__cgAsteroidBelt = 1;

  var COINS = [
    {s:'BTC',c:'#F7931A'},{s:'ETH',c:'#8A9FF5'},{s:'BNB',c:'#F3BA2F'},{s:'SOL',c:'#14F195'},
    {s:'XRP',c:'#4A90D9'},{s:'ADA',c:'#2A6FE0'},{s:'DOGE',c:'#C9A227'},{s:'TRX',c:'#EF4444'},
    {s:'USDT',c:'#26A17B'},{s:'USDC',c:'#2775CA'},{s:'OKB',c:'#5A67D8'},{s:'HT',c:'#2A9D8F'},
    {s:'KCS',c:'#24AE8F'},{s:'AVAX',c:'#E84142'},{s:'LINK',c:'#2A5ADA'},{s:'DOT',c:'#E6007A'},
    {s:'MATIC',c:'#8247E5'},{s:'LTC',c:'#5B8DEF'},{s:'ATOM',c:'#8B93C9'},{s:'FIL',c:'#4AA8FF'},
    {s:'SUI',c:'#4DA2FF'},{s:'APT',c:'#7FD1FF'},{s:'ARB',c:'#12AAFF'},{s:'OP',c:'#FF5A5F'},
    {s:'NEAR',c:'#00D2A0'},{s:'SEI',c:'#E0342E'},{s:'UNI',c:'#FF007A'},{s:'AAVE',c:'#B6509E'},
    {s:'MKR',c:'#1AAB9B'},{s:'DAI',c:'#F5AC37'},{s:'SAND',c:'#00ADEF'},{s:'MANA',c:'#FF2D55'},
    {s:'APE',c:'#0054F9'},{s:'CRV',c:'#3465A4'},{s:'ONE',c:'#00AEE9'},{s:'XTZ',c:'#2C7DF7'},
    {s:'EOS',c:'#8C8C8C'},{s:'ZEC',c:'#ECB244'},{s:'DASH',c:'#008CE7'},{s:'CHZ',c:'#CD412B'},
    {s:'ENJ',c:'#7866D5'},{s:'BAT',c:'#FF5000'},{s:'ZIL',c:'#49C1BF'},{s:'NEO',c:'#58BF00'},
    {s:'KSM',c:'#F0004C'},{s:'WAVES',c:'#0155FF'},{s:'YFI',c:'#006AE3'},{s:'SNX',c:'#00D1FF'},
    {s:'COMP',c:'#00D395'},{s:'GRT',c:'#6747ED'},{s:'SUSHI',c:'#FA52A0'},{s:'BAL',c:'#7C6EE6'},
    {s:'ZRX',c:'#4E4E4E'},{s:'ALGO',c:'#4C4C4C'},{s:'VET',c:'#15BDFF'},{s:'XLM',c:'#14B6E7'},
    {s:'ETC',c:'#3AB83A'},{s:'BCH',c:'#8DC351'}
  ];
  function rand(a,b){ return a + Math.random()*(b-a); }

  function glassTile(logo, color, mirror) {
    var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), R = S / 2;
    if (mirror) { x.translate(S, 0); x.scale(-1, 1); }   /* 2026-10-05: 背面贴图水平镜像 → 币自转时正反两面看符号都正立、不镜像 */
    var g = x.createRadialGradient(R*0.62, R*0.56, R*0.04, R, R, R);
    g.addColorStop(0.0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.035)');
    g.addColorStop(1.0, 'rgba(255,255,255,0.015)');
    x.beginPath(); x.arc(R, R, R*0.985, 0, 6.2832); x.fillStyle = g; x.fill();
    if (logo) {
      var ir = R * 0.62;
      x.save(); x.beginPath(); x.arc(R, R, ir, 0, 6.2832); x.closePath(); x.clip();
      x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.95;
      x.drawImage(logo, R-ir, R-ir, ir*2, ir*2);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.restore();
    }
    x.beginPath();
    for (var k = 0; k < 6; k++) {
      var a = Math.PI/6 + k*Math.PI/3;
      var px = R + Math.cos(a)*R*0.965, py = R + Math.sin(a)*R*0.965;
      if (k===0) x.moveTo(px,py); else x.lineTo(px,py);
    }
    x.closePath(); x.strokeStyle='rgba(255,255,255,0.28)'; x.lineWidth=S*0.013; x.stroke();
    var hl = x.createRadialGradient(R*0.62, R*0.50, 2, R*0.62, R*0.50, R*0.60);
    hl.addColorStop(0,'rgba(255,255,255,0.24)'); hl.addColorStop(1,'rgba(255,255,255,0)');
    x.save(); x.beginPath(); x.arc(R,R,R*0.95,0,6.2832); x.clip();
    x.fillStyle=hl; x.fillRect(0,0,S,S); x.restore();
    var t = new THREE.CanvasTexture(c); t.needsUpdate = true; t.anisotropy = 8;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  var belt=null, rocks=[], coinGeo=null;
  var lastT=0;   /* 2026-10-06: 最近一帧时间(供"点击飘走"计时) */

  function build(){
    var scene=window.__cgScene;
    if(!scene||typeof THREE==='undefined')return false;
    if(belt)return true;
    belt=new THREE.Group(); belt.name='hwAsteroidBelt'; belt.renderOrder=1; scene.add(belt);
    coinGeo=new THREE.CylinderGeometry(1,1,0.10,6,1,false);   /* 薄六棱柱 */

    COINS.forEach(function(coin,i){
      var g=new THREE.Group(); belt.add(g);
      var rec={
        g:g, sym:coin.s,
        R: rand(1.25, 2.05),                     /* 轨道半径 */
        a0: Math.random()*6.283,                 /* 初相 */
        inc: rand(0.12, 1.45)*(Math.random()<0.5?1:-1),  /* 轨道面倾角 → 四面八方 */
        node: Math.random()*6.283,               /* 交点经度 */
        spd: rand(0.035, 0.085)*(Math.random()<0.28?-1:1), /* 慢(≈57~140s/圈) */
        baseY: rand(-0.18, 0.18),
        wph: Math.random()*6.283,
        spinSpd: (Math.random()<0.5?1:-1)*rand(0.22, 0.5),
        sc: rand(0.030, 0.052),                  /* 尺寸系数(随机, 非查表) */
        spinner:null, capMat:null, sideMat:null, edgeMat:null,
        fdx:0, fdy:0, fdz:0, fbt:-9, f0:0        /* 2026-10-06: 被碰到 → 飘走(方向/起始时刻/幅度) */
      };
      rocks.push(rec);
      var im=new Image();
      im.onload=function(){
        /* 2026-10-05 作者「外圈币盾很多币 logo 错误」根因:
           圆片正/反两面共用同一张 logo → 币自转背面朝向相机时, 符号被水平镜像
           (看着就像「logo 错了/反了」)。给背面一张【水平镜像】贴图 → 正反两面看都正立、不镜像。 */
        var cap =new THREE.MeshBasicMaterial({ map:glassTile(im, coin.c, false), transparent:true, depthWrite:false, depthTest:true });
        var capB=new THREE.MeshBasicMaterial({ map:glassTile(im, coin.c, true),  transparent:true, depthWrite:false, depthTest:true });
        var side=new THREE.MeshBasicMaterial({ color:new THREE.Color(0xdfeeff), transparent:true, opacity:0.20, depthWrite:false, depthTest:true });
        var mesh=new THREE.Mesh(coinGeo,[side,cap,capB]); mesh.rotation.x=Math.PI/2;
        var edge=new THREE.LineSegments(new THREE.EdgesGeometry(coinGeo,1),
          new THREE.LineBasicMaterial({color:new THREE.Color(0xffffff),transparent:true,opacity:0.26,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true}));
        edge.rotation.x=Math.PI/2;
        var sp=new THREE.Group(); sp.add(mesh); sp.add(edge); g.add(sp);
        mesh.renderOrder=5; edge.renderOrder=6;   /* 玻璃币球壳 ro=2/3 → 小行星在其后渲染: 前面必在玻璃前 */
        rec.spinner=sp; rec.capMat=cap; rec.capMatB=capB; rec.sideMat=side; rec.edgeMat=edge.material;
      };
      im.onerror=function(){};
      im.src='assets/coins_hi/'+coin.s.toLowerCase()+'.png';
    });
    window.__cgRocks=rocks;
    return true;
  }

  function frame(dt, tt){
    if(!belt){ if(!build())return; }
    var group=window.__cgEarthGroup; if(!group)return;
    var wh=window.__cgWorldHalf||2.0;
    var t=tt||performance.now()/1000;
    lastT=t;
    belt.position.set(group.position.x, group.position.y, 0);   /* 环绕地球中心 */
    var cam=window.__cgCamera;
    var cx=cam?cam.position.x:0, cy=cam?cam.position.y:0.26, cz=cam?cam.position.z:2.30;

    for(var i=0;i<rocks.length;i++){
      var r=rocks[i];
      var ang=r.a0 + t*r.spd;
      var ca=Math.cos(ang), sa=Math.sin(ang);
      /* 该币自己轨道面上的点 */
      var lx=ca*r.R, ly=sa*r.R*Math.sin(r.inc), lz=sa*r.R*Math.cos(r.inc);
      /* 绕 Y 轴旋转 → 轨道面朝向随机(四面八方) */
      var cn=Math.cos(r.node), sn=Math.sin(r.node);
      var x=lx*cn + lz*sn;
      var z=-lx*sn + lz*cn;
      var y=ly + r.baseY + Math.sin(t*0.45 + r.wph)*wh*0.05;

      /* 空气透视: 越远越暗(距离感) */
      var wx=belt.position.x+x, wy=belt.position.y+y, wz=z;
      var dx=cx-wx, dy=cy-wy, dz=cz-wz;
      var dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
      var dim = 1 - Math.min(1, Math.max(0,(dist-2.2)/(5.6-2.2)))*0.55;   /* 1 → 0.45 */

      /* 硬约束: 距地球中心 >= 1.05 (玻璃币球外壁 0.862 + 余量) → 绝不可穿壳 */
      var _rr=Math.sqrt(x*x+y*y+z*z);
      if(_rr<1.05 && _rr>1e-6){ var _k=1.05/_rr; x*=_k; y*=_k; z*=_k; }

      /* ── 2026-10-06 作者: 碰到/点击 → 飘走 ──
         冲量: 命中瞬间(0.16s)快速弹开 → 其后指数回落(≈0.6s)自然飘回轨道。
         位移加在"防穿壳夹取"之后, 允许它短暂飘到玻璃壳外。 */
      var _age = t - r.fbt, _env = 0;
      if(_age >= 0 && _age < 3.0){
        _env = _age < 0.16 ? (_age/0.16) : Math.exp(-(_age-0.16)/0.62);
        var _o = wh * r.f0 * _env;
        x += r.fdx*_o; y += r.fdy*_o; z += r.fdz*_o;
      }

      var br=Math.sin(t*1.0 + r.wph);                  /* 呼吸 */
      var k=wh*r.sc*(1+0.045*br+0.22*_env);            /* 被碰到时鼓一下 */
      r.g.position.set(x, y, z);
      r.g.scale.setScalar(k);
      r.g.rotation.z = Math.sin(t*0.35 + r.wph)*0.14 + _env*0.5*Math.sin(t*3.0+r.wph);
      if(r.spinner) r.spinner.rotation.y = t*r.spinSpd + _env*2.4;   /* 飘走时自转加快 */

      if(r.capMat){
        r.capMat.opacity = dim;
        r.capMat.color.setScalar((0.84+0.16*br)*dim);
        if(r.capMatB){ r.capMatB.opacity = dim; r.capMatB.color.setScalar((0.84+0.16*br)*dim); }
        r.sideMat.opacity = 0.20*dim;
        r.edgeMat.opacity = (0.28+0.22*br)*dim;
      }
    }
  }
  /* ══════════════════════════════════════════════════════════════
     2026-10-06 作者: 「小行星玻璃币要有交互感, 我碰到或点击会飘走」
       · 命中: 相机射线 vs 每颗币世界坐标(点到射线距离 < 币半径)
         —— 不用 Raycaster.intersectObject, 免去给 58 颗币各挂网格的开销
       · 命中 → poke(): 沿「离地心向外 + 稍向观众 + 一点上抛」给冲量,
         币立刻飘开、自转加快、鼓一下, 随后自然飘回自己的轨道(不掉币)
       · 交互: pointerdown (同时覆盖 点击 / 触摸)
     ══════════════════════════════════════════════════════════════ */
  var _ray=null,_ndcV=null,_wpos=null,_dirTmp=null,_pokeCv=null;
  function ensureRay(){
    if(!_ray && typeof THREE!=='undefined'){
      _ray=new THREE.Raycaster(); _ndcV=new THREE.Vector2();
      _wpos=new THREE.Vector3();  _dirTmp=new THREE.Vector3();
    }
    return !!_ray;
  }
  function bindPoke(){
    if(_pokeCv) return true;
    var cv=document.querySelector('#aiEarth canvas')||document.querySelector('.earth-bg canvas');
    if(!cv) return false;
    _pokeCv=cv;
    cv.addEventListener('pointerdown', function(e){ try{ pokeAt(e.clientX, e.clientY); }catch(err){} }, {passive:true});
    return true;
  }
  function pokeAt(cx, cy){
    if(!ensureRay()) return null;
    var cam=window.__cgCamera; if(!cam) return null;
    var cv=_pokeCv||document.querySelector('#aiEarth canvas'); if(!cv) return null;
    var rc=cv.getBoundingClientRect(); if(!rc.width) return null;
    _ndcV.x=((cx-rc.left)/rc.width)*2-1;
    _ndcV.y=-((cy-rc.top)/rc.height)*2+1;
    _ray.setFromCamera(_ndcV, cam);
    var best=null, bestD=Infinity;
    for(var i=0;i<rocks.length;i++){
      var r=rocks[i]; if(!r.spinner) continue;
      r.g.getWorldPosition(_wpos);
      _dirTmp.copy(_wpos).sub(_ray.ray.origin);
      var pr=_dirTmp.dot(_ray.ray.direction);
      if(pr<=0) continue;
      var perp=Math.sqrt(Math.max(0, _dirTmp.lengthSq()-pr*pr));
      var rad=Math.max(0.06, r.g.scale.x*1.6);
      if(perp<rad && pr<bestD){ bestD=pr; best=r; }
    }
    if(!best) return null;
    poke(best);
    return best.sym;
  }
  function poke(r){
    r.g.getWorldPosition(_wpos);
    var bp=belt?belt.position:null;
    var ox=_wpos.x, oy=_wpos.y, oz=_wpos.z;
    if(bp){ ox-=bp.x; oy-=bp.y; }
    var L=Math.sqrt(ox*ox+oy*oy+oz*oz)||1;
    var fdx=0,fdy=0,fdz=0;
    var cam=window.__cgCamera;
    if(cam && cam.getWorldDirection){ cam.getWorldDirection(_dirTmp); fdx=_dirTmp.x; fdy=_dirTmp.y; fdz=_dirTmp.z; }
    var dx=ox/L*0.78 - fdx*0.42, dy=oy/L*0.78 - fdy*0.42 + 0.28, dz=oz/L*0.78 - fdz*0.42;
    var dl=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
    r.fdx=dx/dl; r.fdy=dy/dl; r.fdz=dz/dl;
    r.f0=rand(0.55, 0.85);
    r.fbt=lastT;
  }
  window.__cgPokeAt=pokeAt;   /* 调试/自动化钩子 */
  (function bindWait(n){ if(bindPoke())return; if(n<120)setTimeout(function(){bindWait(n+1);},250); })(0);

  window.__cgAsteroidFrame=frame;
  (function wait(n){ if(build())return; if(n<80)setTimeout(function(){wait(n+1);},250); })(0);
})();
