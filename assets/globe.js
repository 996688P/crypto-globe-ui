/* ============================================================================
 * crypto-globe-ui — 程序化星空 / 数字地球 / 六边形玻璃币球
 * Standalone WebGL visual layer (Three.js). Pure decoration, zero data coupling.
 * Ported & de-coupled from a private trading terminal's front-end.
 * License: MIT. Earth textures: NASA Visible Earth (public domain).
 * ==========================================================================*/
(function () {
  "use strict";
  window.__cgLang = window.__cgLang || "zh";   // 语言垫片: 原站由 i18n 提供, 独立版固定 zh
function initAIEarth(){
  // ===== Three.js WebGL 3D 地球 (v105.13 作者: 用成熟3D方案) =====
  const holder = document.getElementById('aiEarth');
  if(!holder || window.__earth3d) return;
  if(!window.THREE){ holder.innerHTML='<div style="color:#5b6478;font-size:12px;text-align:center;padding-top:120px">3D 引擎加载失败</div>'; return; }
  window.__earth3d = true;
  const THREE = window.THREE;
  /* v121(09-19 作者): 默认回到真实地球(旧版行为)
     数字全息风改为需显式开启: URL 加 ?earth=digi 才启用
     作者指令:「还是恢复之前的地球吧」→ 真实地球为默认 */
  /* v121.2(09-19 作者: 「不要数字地球了，还恢复之前的」)
     数字全息风彻底停用 —— DIGI 恒为 false, 全部着色器/图层走真实地球分支。
     代码保留(未删)以便日后需要时一行恢复, 但任何 URL 参数都无法再启用数字风。 */
  const DIGI = true;   // v123(09-19 作者): 地球=黑白数字科幻操作台 — 数字全息风成为默认, 全站统一黑白数据语言
  const W = holder.clientWidth || 420, H = holder.clientHeight || 300;
  /* v142c(作者: 太卡了) —— 性能三项:
     ① preserveDrawingBuffer 去掉: 本页从不用 toDataURL/readPixels,
        开着它每帧多一次整帧拷贝(全屏背景 = 最大浪费)
     ② antialias 关掉: 叠了高分辨率像素比后 MSAA 收益极低, 开销却狠
     ③ 像素比上限 2 → 1.3: 地球是整屏背景, 填充率是卡顿主因 */
  /* v143c(作者: 模糊) —— 像素比是整屏清晰度的总闸:
     旧版上限写死 1.3, 在 2x 屏上只渲染到 65% 再被浏览器放大 → 整屏糊,
     自适应降质还会把它压到 0.75(37.5%) → 非常糊。
     现在: 上限 = 屏幕物理像素(不超 2), 下限 1.25(绝不比旧版更糊)。 */
  const _pxMax = Math.min(window.devicePixelRatio || 1, 2);
  const _pxMin = 1.25;
  let _pxRatioCap = _pxMax;
  let renderer;
  /* v210-C: WebGL 能力预检 —— 无 GPU/禁用 WebGL 时 Three.js 会在构造时刷控制台错误,
     且 19 个 tab 反复重建 → 刷屏。先探测, 不可用则直接走静态兜底, 不构造 renderer。 */
  (function(){
    var ok=false;
    try{ var _c=document.createElement('canvas');
         ok = !!(_c.getContext('webgl2')||_c.getContext('webgl')||_c.getContext('experimental-webgl')); }catch(e){ ok=false; }
    window.__cgWebglOK = ok;
  })();
  if(window.__cgWebglOK===false){
    window.__earth3d=false; holder.classList.add('earth-fallback');
    try{holder.innerHTML='<div class="earth-fb"><div class="earth-fb-ring"></div><div class="earth-fb-core"></div><div class="earth-fb-tag">'+(__cgLang==='en'?'— GLOBE OFFLINE (no WebGL)':'— 星球离线 (无 WebGL)')+'</div></div>';}catch(e){}
    return;
  }
  try {
    renderer = new THREE.WebGLRenderer({ antialias:false, alpha:true, preserveDrawingBuffer:false, powerPreference:'high-performance' });
  } catch(e){ window.__earth3d=false;
    // V2: 不再静默留空 — WebGL 不可用时显式提示
    try{holder.innerHTML='<div style="color:var(--dim);font-size:12px;text-align:center;padding-top:120px;font-family:var(--mono)">'+(__cgLang==='en'?'— 3D unavailable':'— 3D 不可用')+'</div>';}catch(x){}
    return; }
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, _pxRatioCap));
  renderer.outputEncoding = THREE.sRGBEncoding;
  holder.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W/H, 0.1, 100);
  camera.position.set(0, 0.26, 2.30);   // v252(作者 2026-09-30): 居中放大 2.78→2.30
  camera.lookAt(0,0,0);
  window.__cgCamera = camera;   /* v256: 供环绕小行星层(小行星朝向相机)使用 */
  window.__cgScene = scene;     /* v256 */
  // v110.17: 竖屏(窄高)→ 相机拉远, 否则地球被横向裁切; 宽屏保持近距更有冲击力
  // v121(09-19 作者: 要适配): 原竖屏只是拉远, 但 x 仍死左偏 -0.72 → 地球大半个被推出屏外
  //   实锤 390x844: 可视半宽 ≈6.6*0.3839*0.462=1.17, 球心 -0.72 → 球占[-1.72,+0.28], 左侧全出屏。
  //   现改为按宽高比自适应: 竖屏居中 + 按宽度定距(球真正当背景); 横屏维持左偏构图。
  const FOV_T = Math.tan(42 * Math.PI / 360);   // 垂直半视角 tan
  let _baseX = -0.72, _pxAmp = 0.10, _baseY = 0;
  function _fitCam(force){
    try{
      /* v257(作者 2026-10-05): 滚动中不重拟合 → 根治“滚回去位置变了”
         (_baseY 已用文档坐标与滚动无关; 此处再兜底: 滚动时彻底不动) */
      let _scrollTop = 0;
      try { const _sc = document.querySelector('.content'); if (_sc) _scrollTop = _sc.scrollTop || 0; } catch (e) {}
      if (_scrollTop > 2 && !force) return;
      const cw = holder.clientWidth || 1, ch = holder.clientHeight || 1;
      const ar = cw / ch;
      if(ar < 0.95){
        camera.position.y = 0.10;
        _baseX = 0; _pxAmp = 0.03; _baseY = 0;
      } else {
        camera.position.y = 0.0;   /* v256b: 垂直对齐交由 group.position.y */
        _baseX = 0; _pxAmp = 0.05; _baseY = 0;
      }
      /* v257(作者 2026-10-05): ①整体缩小一圈(0.96→0.82)——原上下挤到边框;
         ②修“滚动缩放/位置漂移”: 尺寸/位置只依赖视口(ch/cw)+固定参考高,
           不再用 hero 的【实时】rect(随内容生长 560→812) → 与滚动/加载彻底无关。 */
      const hero = document.querySelector('.ai-hq');
      /* v259(作者 2026-10-06): 以 HUD 框(.hud-frame)为基准重新拟合 ——
         v258 按"视口高-76"算导致球 91.5% 塞满屏(过大), 且基准是已废弃的 .ai-hq 框。
         框内沿: 左/上 92/90, 右/下 40/40 (26px 准星 + 64/14 边距) → 框内高 = ch-130;
         尺寸 = 框内高 × 0.82 (沿用 v257 的比例意图, 只换基准); 位置 = 框中心。
         竖屏(ar<0.95)沿用 v257 原逻辑; 手机端 HUD 框 display:none → 零影响。 */
      const _hudFL=92, _hudFT=90, _hudFR=40, _hudFB=40;
      const _fh = Math.max(240, ch - _hudFT - _hudFB);   /* 框内高 */
      const _deskFill = (ar >= 0.95);
      const heroRef = _deskFill ? _fh
                                : Math.min(560, ch * 0.72);   // v257: 固定参考高(竖屏)
      const fitH = _deskFill ? _fh * 0.82 : heroRef * 0.82;    // v259: 横屏按框内高
      /* v256c(作者: 球体太小/偏上) —— 关键: 上一版按 1.08 拟合, 但真正的"球体"是
         玻璃六边层(hexGroup.scale 0.86 × 半径≈1.05 ≈ 0.90), 故视觉上只填了 ~82%,
         看起来像小球浮在上方。现按【实际可见半径 0.92】拟合 → 球体真正填满框、不再显小。 */
      const SPH = 0.92;
      let zFit = (SPH * ch) / (Math.max(fitH, 80) * FOV_T);   /* 令球直径=fitH: r_px=(SPH*ch)/(2*z*FOV_T)=fitH/2 */
      zFit = Math.max(2.4, Math.min(zFit, 14));
      if(ar < 0.95){                                       // 竖屏: 再按宽度兜底防裁切
        const zW = SPH / (FOV_T * ar);
        zFit = Math.max(zFit, Math.min(zW, 12));
      }
      camera.position.z = zFit;
      window.__cgBaseCamZ = zFit;   /* 静态基准: 滚动缩放的锚点 */
      /* v256b: 把球心对齐到英雄框的垂直中心(框在页面上部, 屏幕居中会让球下缘溢出框) */
      try{
        const hr = hero ? hero.getBoundingClientRect() : null;
        if(hr && hr.height > 40){
          const pxPerUnit = ch / (2 * zFit * FOV_T);     // r=1 对应的屏幕像素
          const rpx = SPH * pxPerUnit;
          /* v256g(作者: 球更大 + 再往下) —— 球体【贴框底】→ 尽量靠下;
             大小由 fitH 独立控制(框已加高到 900, 故"更大"与"更下"可兼得) */
          /* v257: 英雄框顶【冻结一次】——内容加载中 hr.top 会飘 ~10px, 导致 _baseY 微变 */
          if (typeof window.__cgHeroTopDoc !== 'number') { try { window.__cgHeroTopDoc = hr.top + _scrollTop; } catch (e) {} }
          const _heroTopDoc = (typeof window.__cgHeroTopDoc === 'number') ? window.__cgHeroTopDoc : (hr.top + _scrollTop);
          _baseY = (ch / 2 + rpx - (_heroTopDoc + heroRef * 1.135)) / pxPerUnit;   /* v257: 冻结框顶 + 固定参考高 → 位置恒定 */
          /* v259(作者 2026-10-06): 横屏改为【以 HUD 框中心】定位 ——
             框不对称: 左92/上90/右40/下40 → 框心比视口心偏 (+26,+25)px,
             这才是"位置不对"的根因(此前按视口中线摆, 偏左偏上)。
             竖屏保持 v257 原逻辑(手机端 HUD 框 display:none, 无框可对)。 */
          if (_deskFill) {
            /* v261(作者 2026-10-08): 地球+玻璃币盾【视口正中】 —
               v259 按 HUD 框中心 = 视口偏右26/下25px, 作者令「应该在中间」→ 归零。
               玻璃币/六边护盾均为 group 子节点 → 随球整体居中。 */
            _baseX = 0;
            _baseY = 0;
          }
          _baseY = Math.max(-1.8, Math.min(_baseY, 1.2));
        }
      }catch(e){}
      if(typeof group !== 'undefined' && group){
        group.position.set(_baseX, _baseY, 0);
        if(typeof cloudRotor !== 'undefined' && cloudRotor) cloudRotor.position.copy(group.position);
      }
      /* v262(作者 2026-10-08): 相机视线回正 —— 初始化 lookAt(0,0,0) 时相机在 y=0.26,
         留下 ~6.4° 俯角; _fitCam 只改 position.y/z 未重投视线 → 球心被顶到视口上方约133px。
         改为始终对准 group 实际位置, 保证球心投影落在视口正中(横屏/竖屏一致)。 */
      try{ camera.lookAt(_baseX, _baseY, 0); }catch(e){}
    }catch(e){}
  }
  _fitCam();
  const group = new THREE.Group();
  window.__cgEarthGroup = group;   /* v214: 旋转句柄(可交互自测/调试) */
  group.position.set(_baseX, _baseY, 0);  // v121: 由 _fitCam 按屏幕比例决定(横屏左偏/竖屏居中)
  scene.add(group);

  // ===== 背景天幕 v121(09-19 作者: 背景也要配套科幻数字风, 且要精细) =====
  // 数字风: 程序化天球 —— 深蓝黑渐层 + 全息经纬网 + 数字星云 + 哈希星点
  //   (不加载任何外部贴图; 与地球共用同一套"全息+数据"语言, 背景不再是死黑)
  // 真实风(?earth=real): 保留原 night_sky 全景图, 逐字未动
  if(DIGI){
    const skyMat = new THREE.ShaderMaterial({
      uniforms:{ uTime:{value:0} },
      vertexShader:[
        'varying vec3 vP;',
        'void main(){',
        '  vP = position;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader:[
        'uniform float uTime; varying vec3 vP;',
        // 稳定哈希(同方向永远同一颗星, 不会闪来闪去)
        'float h31(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }',
        'void main(){',
        '  vec3 d = normalize(vP);',
        '  float lat = asin(clamp(d.y,-1.0,1.0));',
        '  float lon = atan(d.z,d.x);',
        // ① 深空底: 极深的青蓝, 上下略分冷暖(有纵深, 不是一块平黑)
'  vec3 col = mix(vec3(0.032,0.029,0.023), vec3(0.006,0.006,0.006), smoothstep(0.0,1.0,abs(d.y)));',
        // ② 区块链六边晶格(远空) — 六边形=区块链的原生图形语言(区块/节点/地址图标)
        //    晶格随"出块扫描"逐格点亮 → 背景本身在跑链
        '  vec2 hxy = vec2(lon, lat) * vec2(8.6, 5.0);',
        '  vec2 HH = vec2(1.0, 1.7320508);',
        '  vec2 HA = mod(hxy, HH) - HH*0.5;',
        '  vec2 HB = mod(hxy - HH*0.5, HH) - HH*0.5;',
        '  vec2 HG = dot(HA,HA) < dot(HB,HB) ? HA : HB;',
        '  float hdist = max(abs(HG.x)*0.8660254 + abs(HG.y)*0.5, abs(HG.y));',
        '  float hline = smoothstep(0.355, 0.495, hdist);',
        '  float hcell = h31(vec3(floor(hxy), 4.2));',
        '  float hsweep = 0.5 + 0.5*sin(lon*2.6 + lat*1.5 - uTime*0.85);',
        '  col += vec3(0.74,0.62,0.33) * hline * 0.048;',
        '  col += vec3(0.92,0.80,0.48) * hline * pow(hsweep, 12.0) * hcell * 0.20;',
        // 链上数据流: 稀疏的竖直光带缓慢下行(交易在链间流动)
        '  float laneU = lon/3.14159265*36.0;',
        '  float laneId = floor(laneU);',
        '  float laneR = h31(vec3(laneId, 3.1, 7.7));',
        '  float laneX = abs(fract(laneU) - 0.5);',
        '  float laneCol = smoothstep(0.455, 0.5, laneX);',
        '  float laneT = fract(lat*0.14 + uTime*0.045 + laneR);',
        '  float laneHead = exp(-pow((laneT-0.5)*8.5, 2.0));',
        '  col += vec3(0.52,0.70,0.96) * laneCol * laneHead * step(0.74, laneR) * 0.42;',
        // ③ 数字星云: 两层低频噪声(青蓝/靛紫) → 深空有"数据云"质感
        '  float n1 = h31(floor(d*7.0));',
        '  float n2 = h31(floor(d*11.0)+7.3);',
        '  float n3 = h31(floor(d*19.0)+3.1);',
'  col += vec3(0.23,0.20,0.15)*pow(n1,2.6)*0.30;',
'  col += vec3(0.17,0.14,0.10)*pow(n2,3.2)*0.24;',
        '  col += vec3(0.04,0.09,0.11)*pow(n3,4.0)*0.16;',
        // ④ 星点: 网格哈希(密度稳定, 尺度分层: 密微星 + 稀疏亮星)
        //    v121b(09-19 实测: 原130格/半径0.055 → 亚像素, 1440p 下几乎看不见,
        //    亮于40的像素从33.9%掉到22.4%) → 降频扩径提亮, 星点真正可见
        '  vec3 sp = d*72.0;',
        '  vec3 id = floor(sp);',
        '  float h = h31(id);',
        '  vec3 f = fract(sp)-0.5;',
        '  float dd = length(f);',
        '  float sr = 0.10 + h*0.10;',
        '  float star = (1.0 - smoothstep(sr*0.25, sr, dd)) * step(0.90, h);',
        // 亮星层(更疏, 更大, 带十字辉光)
        '  vec3 sp2 = d*30.0;',
        '  vec3 id2 = floor(sp2);',
        '  float h2 = h31(id2+11.7);',
        '  vec3 f2 = fract(sp2)-0.5;',
        '  float d2 = length(f2);',
        '  float sr2 = 0.13 + h2*0.12;',
        '  float big = (1.0 - smoothstep(sr2*0.22, sr2, d2)) * step(0.955, h2);',
        '  float spike = max(0.0, 1.0-abs(f2.x)*10.0)*max(0.0,1.0-abs(f2.y)*1.8)',
        '              + max(0.0, 1.0-abs(f2.y)*10.0)*max(0.0,1.0-abs(f2.x)*1.8);',
        // 逐星极缓呼吸(幅度±12%, 相位由哈希决定 → 不同步闪烁)
        '  float tw = 0.88 + 0.12*sin(uTime*(0.5+h*0.9) + h*6.2831);',
'  col += vec3(0.92,0.95,1.0) * star * tw * 2.0;',
'  col += vec3(1.0,1.0,1.0) * big * tw * 2.5;',
'  col += vec3(0.88,0.92,1.0) * big * spike * 0.80;',
        // ⑤ 整幕极缓明暗(有"活着"的观感, 幅度很小不催眠)
        '  col *= 0.94 + 0.06*sin(uTime*0.31);',
        '  gl_FragColor = vec4(col,1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide, depthWrite:false
    });
    /* v127(09-19 作者: 现在的背景太粗, 换超高像素星空)
       → 程序化天幕下线; 改用 8192×4096 逐像素烘焙的星空天球
         (锐利星点 + 银河带 + 暖金/冷蓝星云 + 亮星衍射星芒) */
    (function(){
      try{
        /* v134(作者: 背景星空换一个, 现在这个太显眼了全是星星, 这个是数字虚拟世界)
           → 8192×4096 数字星幕(稀疏数据点 + 极淡坐标栅格 + 数据带), 不再是实拍满天星 */
        const st = new THREE.TextureLoader().load('vendor/starfield_digital.webp');
        st.encoding = THREE.sRGBEncoding;
        /* v127b 修复: 此处 _maxAniso 尚未定义(const 暂时性死区) → 原本静默抛错, 星空整块没加载 */
        st.anisotropy = 8;
        const _sky = new THREE.Mesh(new THREE.SphereGeometry(18, 64, 32),
          new THREE.MeshBasicMaterial({ map:st, side:THREE.BackSide, depthWrite:false }));
        scene.add(_sky);
        window.__cgSkyMesh = _sky;
      }catch(e){}
    })();
    window.__cgSkyMat = null;
  } else {
    // 真实星空天球(night-sky 全景图, 相机居中 BackSide)
    try {
      const skyTex = new THREE.TextureLoader().load('vendor/starfield_digital.webp');   // v134: 数字星幕
      skyTex.encoding = THREE.sRGBEncoding;
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(18, 32, 16),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite:false })
      );
      scene.add(sky);
      window.__cgSkyMesh = sky;
    } catch(e){}
  }

  // ===== 程序化星层(两层视差+暖色亮星, 逐星闪烁) v107.18 =====
  const starMats = [];
  function makeStarLayer(count, rMin, rMax, sizeMul, color, twSpeed){
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count*3), ph = new Float32Array(count), sz = new Float32Array(count);
    for(let i=0;i<count;i++){
      const u = Math.random()*2-1, a = Math.random()*Math.PI*2;
      const s = Math.sqrt(1-u*u), r = rMin + Math.random()*(rMax-rMin);
      p[i*3]=r*s*Math.cos(a); p[i*3+1]=r*u; p[i*3+2]=r*s*Math.sin(a);
      ph[i]=Math.random()*Math.PI*2; sz[i]=(0.35+Math.random()*0.75)*sizeMul;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p,3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph,1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz,1));
    const m = new THREE.ShaderMaterial({
      uniforms:{ uTime:{value:0}, uColor:{value:new THREE.Color(color)} },
      vertexShader:[
        'attribute float aPhase; attribute float aSize; varying float vA;',
        'uniform float uTime;',
        'void main(){',
        // v107.19: 闪烁幅度收敛到±10%(真实星几乎不眨), 点径系数 240→42(光晕不再糊成大球)
        '  float twk = 0.90 + 0.10*sin(uTime*'+twSpeed+'+aPhase);',
        '  vA = twk;',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  gl_PointSize = aSize * twk * (42.0 / -mv.z);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader:[
        'uniform vec3 uColor; varying float vA;',
        'void main(){',
        // v107.19: 锐核+极淡晕圈(真实星点观感, 告别大光球)
        '  float d = length(gl_PointCoord - vec2(0.5));',
        '  float core = smoothstep(0.16, 0.03, d);',
        '  float halo = pow(smoothstep(0.5, 0.0, d), 3.5) * 0.28;',
        '  gl_FragColor = vec4(uColor, (core + halo) * vA);',
        '}'
      ].join('\n'),
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
    });
    starMats.push(m);
    return new THREE.Points(g, m);
  }
  /* v121(09-19 作者): 数字风已由程序化天幕自带星点/星云/网格
     → 旧程序化星层(220颗)在数字风下冗余且尺度不统一, 只保留给真实地球版(?earth=real) */
  const stars1 = DIGI ? null : makeStarLayer(220, 9, 14, 0.85, 0xcfe0ff, 0.6);
  if(stars1) scene.add(stars1);

  // 灯光: 只用太阳方向光(夜面无环境光 → 夜面云全黑, 只有城市灯光)
  // 云层光照: 与地球 shader 太阳同方向(夜面无光 → 云夜面净黑)
  const sun = new THREE.DirectionalLight(0xeef3fb, 0.45);   // v158(2026-09-26 作者: 太空不需要这么亮): 0.95→0.45 主光再砍半
  sun.position.set(3.4, 1.8, 3.6);
  scene.add(sun);
  const amb = new THREE.AmbientLight(0x141d33, 0.050);   /* v158: 0.095→0.050 环境提亮再收, 太空要暗 */
  scene.add(amb);
  /* v128.2(作者: 玻璃质感拉满·盾币一体) —— 双点光:
     ① 冷白锐高光: flatShading 下每个六边切面按法线各自接光 → 满球"碎钻"镜面热点(方向光给不了)
     ② 能量青侧后光: 与护盾同源色, 给币缘染一层青 → 玻璃币与能量盾视觉同为一体 */
  const glint = new THREE.PointLight(0xeaf4ff, 0.18, 0, 2);   /* v158: 0.42→0.18 碎钻高光再收 */
  glint.position.set(2.3, 2.5, 3.1);
  scene.add(glint);
  const rimCyan = new THREE.PointLight(0x38c8ff, 0.18, 0, 2);   /* v158(作者: 太空不需要这么亮): 0.38→0.18 */
  rimCyan.position.set(-2.6, -1.5, -1.6);
  scene.add(rimCyan);

  // 地球: 完整昼夜着色器(昼/夜 + 地形凹凸 + 海洋耀斑 + 城市灯光)
  // v120.9 (09-19): 贴图升 4K/2K — 原 day 仅 1024x512, 整页背景放大后欠采样 8x 发糊
  const _maxAniso = (()=>{try{return renderer.capabilities.getMaxAnisotropy()}catch(e){return 8}})();
  const _mkTex=(url,enc,aniso)=>{const t=new THREE.TextureLoader().load(url);t.anisotropy=Math.min(aniso||_maxAniso,_maxAniso);if(enc&&THREE.sRGBEncoding!==undefined)t.encoding=THREE.sRGBEncoding;if('minFilter' in t)t.minFilter=THREE.LinearMipmapLinearFilter;return t};
  const dayTex = _mkTex('vendor/earth_day_2k.webp',true,_maxAniso);
  const ngtTex = _mkTex('vendor/earth_night_4k.webp',true,_maxAniso);
  const watTex = _mkTex('vendor/earth_water_2k.webp',false,_maxAniso);
  const topoTex = _mkTex('vendor/earth_topo_2k.webp',false,_maxAniso);
  // v120.10 (09-19): 真实地形法线 + 海洋高光图(线性空间, 不加 sRGB 编码)
  const nrmTex  = _mkTex('vendor/earth_normal_2k.webp',false,_maxAniso);
  const specTex = _mkTex('vendor/earth_spec_2k.webp',false,_maxAniso);
  const SUN_W = new THREE.Vector3(0.62, 0.35, 0.70).normalize(); // 太阳: 相机同侧偏右(晨昏线可见)
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: dayTex }, ngtTex: { value: ngtTex },
      watTex: { value: watTex }, topoTex: { value: topoTex },
      nrmTex: { value: nrmTex }, specTex: { value: specTex },
      uNrmScale: { value: 24.0 },
      sunDirW: { value: SUN_W },
      // v121(09-19 作者: 科幻数字地球) 数字全息风格开关与配色
      uDigital: { value: DIGI ? 1.0 : 0.0 },
      uTime: { value: 0 },
      uOceanCol: { value: new THREE.Color(0x02101f) },
      /* v124(作者: 整体冒蓝光 — 真凶在此!) ——
         内层「数字科幻地球」原本是**亮青色**: 陆地 0x4dd7ff / 网格 0x1aa0e8。
         它透过半透玻璃币盘透出来 → 整颗球罩一层蓝光(面板/护盾都不是主因)。
         改为**冷银灰**数字地球: 保留科幻全息感, 但不再发蓝; 并交给 uEarthMood 随市态变色。 */
      uGridCol: { value: new THREE.Color(0x3d4e5e) },   /* v124b: 网格 0x2b3742→0x3d4e5e */
      uLandCol: { value: new THREE.Color(0xa8b6c4) },   /* v124b: 陆地色 0x8b98a5→0xa8b6c4 */
      uEdgeCol: { value: new THREE.Color(0xf0b429) },
      /* v124: 情绪色调入口(由 __hexMood 写入) */
      uEarthMood: { value: new THREE.Color(1.0, 1.0, 1.0) },
      uEarthMoodK: { value: 0.0 }
    },
    vertexShader: [
      'varying vec2 vUv;', 'varying vec3 vN;', 'varying vec3 vV;', 'varying vec3 vT;',
      'void main(){',
      '  vUv = uv;',
      '  vN = normalize(normalMatrix * normal);',
      // v120.11: 球面切线(沿经度) 在顶点阶段算出 —— 不依赖 dFdx(该渲染器下会退化)
      '  vT = normalize(normalMatrix * normalize(cross(vec3(0.0,1.0,0.0), position) + vec3(1e-4,0.0,0.0)));',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vV = mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D dayTex;', 'uniform sampler2D ngtTex;',
      'uniform sampler2D watTex;', 'uniform sampler2D topoTex;',
      'uniform sampler2D nrmTex;', 'uniform sampler2D specTex;',
      'uniform float uNrmScale;',
      'uniform vec3 sunDirW;',
      'uniform float uDigital;',
      'uniform float uTime;',
      'uniform vec3 uOceanCol;',
      'uniform vec3 uGridCol;',
      'uniform vec3 uLandCol;',
      'uniform vec3 uEarthMood;',
      'uniform float uEarthMoodK;',
      'uniform vec3 uEdgeCol;',
      'varying vec2 vUv;', 'varying vec3 vN;', 'varying vec3 vV;', 'varying vec3 vT;',
      'void main(){',
      // ===== v121 科幻数字地球: 全息经纬网 + 陆地数字点阵 + 金色海岸线 + 扫描带 =====
      // 陆地掩膜复用 specTex(海洋=1 / 陆地=0), 不新增贴图请求
'  /* ==============================================================',
'     v123(09-19 作者): 地球 = 黑白数字科幻操作台',
'     语言: 全息灰度 + 数据点阵 + 等深线 + 扫描; 颜色只留给持仓信标',
'     ① 陆地 = 冷灰玻璃 + 冷白点阵(明暗随海拔, 山脊读得出)',
'     ② 海洋 = 近黑镜面 + 冷灰读数网格 + 等深线(基准层)',
'     ③ 海岸线 = 亮白描边(数据边界感)',
'     ④ 扫描带 + 纬向光环 + CRT 细线 = 设备正在运行的证据',
'     ============================================================== */',
'  if(uDigital > 0.5){',
'    vec3 N2 = normalize(vN);',
'    vec3 V2 = normalize(-vV);',
'    vec3 S2 = normalize(mat3(viewMatrix) * sunDirW);',
'    float ndl2 = dot(N2, S2);',
'    float dayF2 = smoothstep(-0.34, 0.62, ndl2);',
'    float maskR = texture2D(specTex, vUv).r;',
'    float land = smoothstep(0.42, 0.62, 1.0 - maskR);',
'    float ocean = 1.0 - land;',
'    float elev = texture2D(topoTex, vUv).r;',
'    /* 海岸线: 多半径采样取最外缘 -> 高亮白描边 */',
'    float stp = 1.4 / 2048.0;',
'    float nsum = texture2D(specTex, vUv + vec2(stp, 0.0)).r',
'               + texture2D(specTex, vUv - vec2(stp, 0.0)).r',
'               + texture2D(specTex, vUv + vec2(0.0, stp*2.0)).r',
'               + texture2D(specTex, vUv - vec2(0.0, stp*2.0)).r',
'               + texture2D(specTex, vUv + vec2(stp*0.7, stp*1.4)).r',
'               + texture2D(specTex, vUv - vec2(stp*0.7, stp*1.4)).r;',
'    float nAvg = nsum / 6.0;',
'    float coast = land * smoothstep(0.40, 0.56, nAvg);',
'    float coastIn = land * smoothstep(0.28, 0.46, nAvg);',
'    /* 经纬网格: 30deg主格 / 10deg次格 / 5deg细格(基准坐标系) */',
'    vec2 gf = abs(fract(vUv * vec2(72.0, 36.0)) - 0.5);',
'    float gMinor = smoothstep(0.475, 0.5, max(gf.x, gf.y));',
'    vec2 gm2 = abs(fract(vUv * vec2(36.0, 18.0)) - 0.5);',
'    float gMid = smoothstep(0.472, 0.5, max(gm2.x, gm2.y));',
'    vec2 gf2 = abs(fract(vUv * vec2(12.0, 6.0)) - 0.5);',
'    float gMajor = smoothstep(0.468, 0.5, max(gf2.x, gf2.y));',
'    /* 数据点阵: 双层(细密底阵 + 稀疏亮块), 疏密随海拔 -> 地理信息感 */',
'    vec2 dg1 = fract(vUv * vec2(200.0, 100.0)) - 0.5;',
'    float d1 = smoothstep(0.30, 0.08, length(dg1));',
'    vec2 dg2 = fract(vUv * vec2(100.0, 50.0)) - 0.5;',
'    float d2 = smoothstep(0.26, 0.06, length(dg2));',
'    float dens = mix(0.55, 1.0, elev);',
'    float breathe = 0.72 + 0.28 * sin(uTime*1.35 + (vUv.x*2.6 + vUv.y*1.8)*16.0);',
'    float breathe2 = 0.70 + 0.30 * sin(uTime*1.05 - (vUv.x*1.4 + vUv.y*2.4)*13.0 + 1.7);',
'    /* 等深线: 海洋按水深分层 -> 深海等高线(操作台的读数层) */',
'    float depth = texture2D(watTex, vUv).r;',
'    float iso = abs(fract(depth * 14.0) - 0.5);',
'    float contour = smoothstep(0.47, 0.5, iso) * ocean;',
'    /* 扫描带(自上而下) + CRT 细扫线 + 纬向光环 */',
'    float sy = fract(vUv.y - uTime*0.05);',
'    float scan = exp(-pow(sy*2.0 - 1.0, 2.0) * 26.0);',
'    float scanLine = exp(-pow(fract(vUv.y*60.0 - uTime*0.55)*2.0 - 1.0, 2.0) * 40.0) * 0.09;',
'    float hline = 0.5 + 0.5*sin(vUv.y*1400.0);',
'    float ring = exp(-pow((vUv.y - fract(uTime*0.045)) * 6.0, 2.0));',
'    /* -- 装配: 冷黑玻璃基底 -- */',
'    vec3 col2 = vec3(0.013, 0.017, 0.026);   /* v126c: 基底又压一档 → 暗部更深, 亮部更跳 */',
      /* v151(作者: 地球经纬线去除 黑白点也去除) —— 经纬网/数据点阵/等深线 全部下线:
         地球只留「海洋暗底 + 亮白海岸线 + 边缘勾边 + 一道柔和扫描光」
         = 干净的数字轮廓球(不再有格/点阵噪声, 不与外围币格抢视觉) */
      '    col2 += vec3(0.34,0.39,0.48) * ocean * 0.140;   /* v126c: 海洋读数层 0.125→0.140 */',
'    /* 陆地: 冷灰底(保留地形明暗, 大陆有厚度但不画点阵) */',
'    col2 += vec3(0.262,0.278,0.310) * land;   /* v124b: 陆地 0.130→0.235 大幅提亮 */',
'    col2 += vec3(0.128,0.138,0.160) * land * (1.0 - elev);   /* v126c: 陆地暗部 0.165→0.128 拉大陆地明暗落差 */',
'    /* 海岸线: 主描边(亮白) + 内侧次描边(冷灰) */',
'    col2 += vec3(0.99,1.00,1.00) * coast * 1.70;   /* v124b: 海岸线 1.05→1.35 更锐 */',
'    col2 += vec3(0.70,0.76,0.86) * coastIn * 0.44;   /* v124b: 内侧次描边 0.20→0.30 */',
'    /* 菲涅尔: 边缘冷白勾边(球体轮廓立住) */',
'    float fres2 = pow(1.0 - max(dot(N2, V2), 0.0), 3.0);',
'    col2 += vec3(0.92,0.96,1.00) * fres2 * 0.24;   /* v124b: 边缘勾边 0.09→0.15 球体立住 */',
'    /* 扫描带 + 纬向光环 + CRT 细线 */',
'    col2 += vec3(0.88,0.92,1.00) * scan * 0.155;   /* v124b: 扫描带 0.115→0.155 */',
'    /* v151: 纬向光环 + CRT 密集细线去掉(同属"黑点/黑线"噪声) */',
'    col2 *= (0.972 + 0.028*hline);',
'    /* 昼夜: 夜面压暗但保留点阵与轮廓(全息设备夜里也在跑) */',
'    col2 *= mix(0.37, 1.40, dayF2);   /* v126c(作者: 对比度再拉高些) 夜0.58→0.37 / 昼1.18→1.40 —— 拉开昼夜跨度=全局对比度主推动; 夜面仍保留轮廓不发死 */',
'    col2 += vec3(0.045,0.055,0.075) * fres2 * (1.0 - dayF2);',
'    col2 *= mix(vec3(1.0), uEarthMood, clamp(uEarthMoodK, 0.0, 1.0) * 0.55);',
      '    gl_FragColor = vec4(col2, 1.0);',
'    return;',
'  }',
      '  vec3 N = normalize(vN);',
      // 地形凹凸: 真实法线贴图(切线空间→视空间) + 海拔梯度大尺度兜底
      '  float h  = texture2D(topoTex, vUv).r;',
      '  float hx = texture2D(topoTex, vUv + vec2(0.0016, 0.0)).r;',
      '  float hy = texture2D(topoTex, vUv + vec2(0.0, 0.0032)).r;',
      '  vec3 nmv = texture2D(nrmTex, vUv).xyz * 2.0 - 1.0;',
      // 切线空间→视空间 (T=经度向, B=cross(N,T))
      '  vec3 T = normalize(vT);',
      '  vec3 B = cross(N, T);',
      '  vec3 nDir = normalize(mat3(T, B, N) * vec3(nmv.xy * uNrmScale, max(nmv.z, 0.05)));',
      '  vec3 Np = normalize(mix(N, nDir, 0.9) + vec3((h-hx)*26.0, (h-hy)*26.0, 0.0) * 0.5);',
      '  vec3 S = normalize(mat3(viewMatrix) * sunDirW);',
      '  vec3 V = normalize(-vV);',
      '  float ndl = dot(Np, S);',
      '  float dayF = smoothstep(-0.14, 0.5, ndl);',
      '  vec3 dayC = texture2D(dayTex, vUv).rgb;',
      '  vec3 ngtC = texture2D(ngtTex, vUv).rgb;',
      '  float ngtF = 1.0 - smoothstep(-0.06, 0.24, ndl);',
      // 海洋太阳耀斑: 用真实高光图(specTex 海洋=1/陆地=0), 只日面
      '  float wm = texture2D(specTex, vUv).r;',
      '  vec3 H = normalize(S + V);',
      '  float nh = max(dot(Np, H), 0.0);',
      // 海面宽柔镜面反光(大面积柔和) + 中心高光核(亮点)
      '  float specW = pow(nh, 14.0) * wm * smoothstep(0.0, 0.3, ndl);',
      '  float specC = pow(nh, 96.0) * wm * smoothstep(0.03, 0.32, ndl);',
      // 浮雕立体: 海拔调制亮度(山地明暗起伏), 海洋不受影响
      '  float wm2 = texture2D(watTex, vUv).r;',
      '  float relief = 1.0 + (h - 0.55) * 1.1 * (1.0 - wm2);',
      // 真实余弦光照(明暗渐变=立体) + 适度饱和
      '  float diff = 0.05 + 1.62 * max(ndl, 0.0);',
      '  vec3 col = dayC * diff * relief;',
      // 晨昏线暖色散射(日落带) v107.18
      '  float tw = exp(-pow((ndl-0.045)*7.5, 2.0));',
      '  col += vec3(0.95, 0.42, 0.12) * tw * 0.16 * smoothstep(-0.25, 0.05, ndl);',
      '  col += ngtC * ngtF * 1.6;',
      '  col += vec3(0.002, 0.005, 0.016) * (1.0 - dayF);',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
      '  col += vec3(1.0, 0.96, 0.86) * ((specW * 0.30 + specC * 0.65) * (0.4 + 0.6*fres));',
      // 昼侧大气边缘散射(蓝边) v107.18
      '  col += vec3(0.22, 0.48, 1.0) * fres * smoothstep(-0.05, 0.4, ndl) * 0.55;',
      '  gl_FragColor = vec4(pow(col, vec3(0.9)), 1.0);',
      '}'
    ].join('\n')
  });
  /* v124(09-19 参考 originkit.dev/components/globe): 海洋=纯黑遮挡球
     真实陆地数据点阵/海岸线/经纬网 浮在其上 → 背面自动被挡, 不再靠纹理猜
     (旧方案用 2K 纹理采样判陆地 → 点阵糊、无轮廓、还依赖贴图) */
  /* v126(09-19 作者: 融入加密货币元素) — 地球本体 = 「区块链晶格球」
     陆地 = 六边形区块阵列(每格是一个"区块", 随出块扫描逐格点亮)
     海洋 = 近黑底 + 极淡六边底纹(链下世界的暗底)
     六边形是区块链的原生视觉语言: 区块/节点/钱包/地址图标全是六边形 */
  const earthBodyMat = new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0}, specTex:{value:specTex},
               uOcean:{value:new THREE.Color(0x04060b)},
               uGrid:{value:new THREE.Color(0x39485a)},
               uBlock:{value:new THREE.Color(0xe0bd63)} },
    vertexShader:[
      'varying vec2 vUv;',
      'void main(){ vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader:[
      'uniform float uTime; uniform sampler2D specTex;',
      'uniform vec3 uOcean; uniform vec3 uGrid; uniform vec3 uBlock;',
      'varying vec2 vUv;',
      'void main(){',
      /* v135(09-19 作者: 去除地球底部黑白六边形贴图, 整个地球就是币种组成的)
         → 球面只留 海洋/陆地 干净色底: 六边格/凹槽压暗/出块扫描 全部下线
         v143(09-20 作者: 陆地海洋区分清楚更细致) —— 用多采样把海岸线做细:
           ① 单点采样 → 邻域平均(海岸过渡带更准确, 不会一个像素跳变)
           ② 海岸带单独一档色 → 浅滩环
           ③ 海洋按"离岸距离"分层(深海→浅海渐变) */
      '  vec2 px = 1.0 / vec2(1024.0, 512.0);',
      '  float mask = texture2D(specTex, vUv).r;',
      '  float m1 = texture2D(specTex, vUv + vec2(px.x, 0.0)).r;',
      '  float m2 = texture2D(specTex, vUv - vec2(px.x, 0.0)).r;',
      '  float mAvg = (mask + m1 + m2) * 0.3333;',
      '  float mVar = abs(mask - mAvg);',
      /* 陆地(数值 0) / 海洋(数值 1); 收紧阈值 → 海岸线更干净 */
      '  float land  = smoothstep(0.44, 0.56, 1.0 - mask);',
      '  float ocean = 1.0 - land;',
      '  vec3 col = uOcean;',
      /* 海洋: 深海→浅海渐变(离岸越近越亮) */
      '  col += vec3(0.010, 0.030, 0.075) * ocean * smoothstep(0.62, 0.02, mask);',
      /* 海岸浅滩: 陆海过渡带 一圈微亮 */
      '  float coast = smoothstep(0.12, 0.30, mVar);',
      '  col += vec3(0.10, 0.24, 0.34) * coast * 0.55;',
      /* 陆地: 暖褐底 + 地形起伏高光(邻域方差大 = 地势变化大) */
      '  col += vec3(0.052, 0.044, 0.028) * land;',
      '  col += vec3(0.045, 0.038, 0.020) * land * smoothstep(0.06, 0.26, mVar);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });
  /* v150(作者: 球心里放回数字科幻地球) ——
     v124 的「近黑晶格球」(earthBodyMat)本身就是海洋纯黑底, 塞进玻璃球腔后
     读不出任何地理信息(一团黑, 已实测)。而 earthMat 里的数字全息分支
     (uDigital=1)才是作者要的「数字科幻地球」: 冷灰陆地 + 数据点阵 +
     亮白海岸线 + 等深线 + 扫描带。它此前是死代码(mesh 挂在 earthBodyMat 上,
     earthMat 无人引用) → 这里改挂 earthMat 并锁 uDigital=1。 */
  earthMat.uniforms.uDigital.value = 1.0;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.998, 96, 64), earthMat);
  window.__cgEarthBodyMat = earthBodyMat;
  window.__cgEarthMat = earthMat;   /* v124: 供情绪色调驱动(内层数字地球) */
  group.add(earth);

  // ===== 大气辉光壳(BackSide 菲涅尔, 日侧更亮) v107.18 =====
  const atmMat = new THREE.ShaderMaterial({
    uniforms:{ sunDirW:{ value: SUN_W }, uDigital:{ value: DIGI ? 1.0 : 0.0 },
      /* v122(09-19 作者: 实时行情×地球融合): 账户盈亏 → 行星边缘色 */
      uPnlCol:{ value: new THREE.Color(0.42,0.92,0.62) }, uPnlAmt:{ value: 0.0 } },
    vertexShader:[
      'varying vec3 vN;','varying vec3 vNw;',
      'void main(){',
      '  vN = normalize(normalMatrix * normal);',
      '  vNw = normalize(mat3(modelMatrix) * normal);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader:[
      'uniform vec3 sunDirW;','uniform float uDigital;','varying vec3 vN;','varying vec3 vNw;',
      'uniform vec3 uPnlCol;','uniform float uPnlAmt;',
      'void main(){',
      '  float rim = pow(max(0.66 - dot(vN, vec3(0.0,0.0,1.0)), 0.0), 3.4);',
      '  float sunF = 0.30 + 0.70 * max(dot(normalize(vNw), normalize(mat3(viewMatrix) * sunDirW)), 0.0);',
      // v121: 数字风→青蓝全息辉光(改金色边缘不抢 H 徽标); 旧版保持蓝紫
      '  vec3 c = uDigital > 0.5',
'         ? mix(vec3(0.44,0.37,0.26), vec3(1.0,0.94,0.79), sunF)',
      '         : mix(vec3(0.16,0.38,0.95), vec3(0.55,0.75,1.0), sunF);',
      // v122: 盈亏染色 — 盈则金绿/亏则红, 幅度越大越明显(行星随账户"呼吸")
      '  c = mix(c, uPnlCol, clamp(uPnlAmt,0.0,1.0) * 0.62);',
      '  gl_FragColor = vec4(c * rim * sunF * (uDigital > 0.5 ? 1.12 : 1.35), rim * sunF);',
      '}'
    ].join('\n'),
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent:true, depthWrite:false
  });
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 64), atmMat);   // v128.1(作者: 直径小一点离地球近一些): 1.10→1.06
  group.add(atm);
  // 真实卫星云层(Solar System Scope 云图, alpha=灰度, 受光暗面自然隐没)
  const cloudRotor = new THREE.Group();
  cloudRotor.position.copy(group.position);  // v107.16 (09-06): 云心始终对齐地球中心, 修复 v107.14 移球后云层错位成"双球" bug; 云仍独立于地表慢漂
  scene.add(cloudRotor);
  // v107.17 (09-06): 2K云图是JPG无alpha通道, 直接当map会变成不透明黑球挡住地球 → 改用alphaMap(亮度=透明度)
  // 初始 opacity=0 防贴图加载前闪白球, 载入后升到 0.9
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.016, 64, 64),
    // v121: 数字风下云层压到很淡(全息网格才是主体, 云只补一层大气流动的纵深)
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent:true, opacity:0, roughness:1, metalness:0, depthWrite:false })
  );
  cloudRotor.add(clouds);
  new THREE.TextureLoader().load('vendor/earth/earth_clouds_2k.webp', function(t){
    t.anisotropy = Math.min(_maxAniso,8);
    clouds.material.alphaMap = t;
    clouds.material.opacity = DIGI ? 0.0 : 0.9;
    clouds.material.needsUpdate = true;
  });

  // 全球信息源坐标
  const CITIES = [
    {n:'纽约',la:40.7,lo:-74.0},{n:'伦敦',la:51.5,lo:-0.1},{n:'东京',la:35.7,lo:139.7},
    {n:'北京',la:39.9,lo:116.4},{n:'新加坡',la:1.35,lo:103.8},{n:'香港',la:22.3,lo:114.2},
    {n:'迪拜',la:25.2,lo:55.3},{n:'苏黎世',la:47.4,lo:8.5},{n:'法兰克福',la:50.1,lo:8.7},
    {n:'硅谷',la:37.4,lo:-122.0},{n:'华盛顿',la:38.9,lo:-77.0},{n:'悉尼',la:-33.9,lo:151.2}];
  function ll2v(lat, lon, r){
    const phi = (90-lat)*Math.PI/180, th = (lon+180)*Math.PI/180;
    return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(th), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(th));
  }
  /* ══════════════════════════════════════════════════════════════
     v124(09-19 作者: 背景/地球样式重做 — 参考开源实现)
     参考: originkit.dev/components/globe (Natural Earth 陆地数据 → 点阵球)
       · 陆地 = 球面近似均匀点阵(纬度做 cos 补偿, 极点不堆叠)
       · 海岸线 = 真实国界折线(亮白描边)
       · 经纬网 = 15°(暗灰基准)
       · 海洋 = 纯黑(留白给数据, 不做假地球)
     数据: /vendor/globe_data.json (NE 110m 预处理, 362KB)
     ══════════════════════════════════════════════════════════════ */
  function _mkGlobeDots(pts, r, size, col){
    const n = pts.length/2;
    const arr = new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const v = ll2v(pts[i*2], pts[i*2+1], r);
      arr[i*3]=v.x; arr[i*3+1]=v.y; arr[i*3+2]=v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr,3));
    /* v126: 每个陆地点 = 一个六边形区块(不再是圆点), 带稳定随机相位 → 逐格"出块"脉冲 */
    const seed = new Float32Array(n);
    for(let i=0;i<n;i++) seed[i] = (Math.abs(Math.sin(i*12.9898)*43758.5453) % 1);
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed,1));
    const m = new THREE.ShaderMaterial({
      uniforms:{ uSize:{value:size}, uCol:{value:new THREE.Color(col)}, uTime:{value:0} },
      vertexShader:[
        'uniform float uSize; uniform float uTime;',
        'attribute float aSeed; varying float vS;',
        'void main(){',
        '  vS = aSeed;',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  gl_PointSize = clamp(uSize / -mv.z, 1.8, 8.5);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader:[
        'uniform vec3 uCol; uniform float uTime; varying float vS;',
        'void main(){',
        /* 六边形 SDF(flat-top): 点精灵内直接画六边形 → 陆地=区块阵列 */
        '  vec2 pc = gl_PointCoord - vec2(0.5);',
        '  float d = max(abs(pc.x)*0.8660254 + abs(pc.y)*0.5, abs(pc.y));',
        '  float fill = smoothstep(0.42, 0.30, d);',
        '  float rim  = smoothstep(0.28, 0.38, d) * smoothstep(0.50, 0.41, d);',
        /* 出块脉冲: 每格按自身相位缓慢呼吸(链在持续确认) */
        '  float mine = 0.72 + 0.28*sin(uTime*(0.7+vS*0.9) + vS*6.2831);',
        '  gl_FragColor = vec4(uCol, fill*0.26*mine + rim*0.62*mine);',   // v126B: 再降亮度 → 网格感, 不抢币牌
        '}'
      ].join('\n'),
      transparent:true, depthWrite:false, depthTest:true,
      blending:THREE.AdditiveBlending
    });
    return new THREE.Points(g, m);
  }
  /* ══════════════════════════════════════════════════════════════
     v142(2026-09-20 作者: 重构) —— 领土镶嵌地球  TERRITORY GLOBE
     ──────────────────────────────────────────────────────────────
     旧版(v126→v141)的结构性缺陷(不是调参能救的):
       ① 币块用 gl_PointCoord 屏幕空间点精灵 → 永远正对相机、没有球面透视
          缩短 → 币看起来"悬空"浮在球前面, 不像长在球上
       ② 13000 + 1900 个点随机散布 → 根本不是镶嵌, 币与币之间全是缝,
          拼不成"地球", 只是一层撒上去的砂
       ③ 强行"正十二边形"—— 球面在数学上无法用正十二边形无缝密铺,
          所以必然要么重叠要么留缝 (v141 的挤压就是在给这个矛盾擦屁股)
     重构方案: 球面 Voronoi 领土镶嵌 (离线 scripts/gen_territory.py 生成)
       · 种子 Fibonacci 均匀 + Lloyd 松弛 6 轮 → 942 块等面积领土
       · 每块领土 = 球面上真实的 3D 多边形 (5~7 边, 六边形为主)
         → 自带球面曲率, 天然贴合, 零悬空; 相邻边对边, 无缝无重叠
       · 每块领土显示自己币种的 logo (切平面局部坐标采样 → 无投影畸变)
       · 越热门/涨跌越猛的领土 "越大" —— 变大是把邻居的地盘占过来:
         越大的领土抬得越高(aShell), 靠深度关系自然遮挡/挤走邻居
       · 背面领土由地球实体自身遮挡 → 不再需要手工做球缘渐隐
     ══════════════════════════════════════════════════════════════ */
  /* ── 领土层标定(作者: 很多币种小到看不到了 → 保证最小可辨认尺寸) ── */
  /* 静态资源内容哈希(图集/数据一变 URL 就变 → 强刷浏览器/nginx 7天缓存) */
  const _COIN_A_V = 'hi128c_w1';   // coin_atlas_hi.webp (2026-10-09 作者全权: PNG→WebP q95, 11.9M→3.9M 降71% 提速; bump 强制重取防新旧混用)
  const _COIN_G_V = '81b658f8';   // coin_globe.json
  const _TERR_V   = 'hex1_19fc5c27';   // territory.json (v144 只有六边形: 990 六边形 + 12 五边形, 币种/涨跌已全去除)
  /* v145(2026-09-20 作者: 直接替换网站里的地球 = 六边形球) */
  const _HEX_V    = 'hex10r_e590fffd';       // hexsphere.json (Goldberg 六边形球几何)
  const D2R = Math.PI / 180;
  /* ── 领土层标定(作者: 蜂窝一样不重叠 + 币种都看得见) ──
     领土尺寸恒定(Voronoi 单元) → 所有币一样大全部可见;
     差异用「格内 logo 占比」+「微抬」表达, 绝不改边界 */
  /* v142d(作者: 币种外围光圈太大 / 名字也是) —— 币缩到格内一小块 */
  const _TS_MIN = 0.30, _TS_SPAN = 0.44, _TS_MAX = 0.74;   /* 格内 logo 占比 0.30 → 0.74 */
  const _TERR_SHELL0 = 1.0;                                /* 基础壳高 */
  const _SHELL_LIFT = 0.042;                               /* 越重要抬得越高(纯径向, 不改边界) */
  function _b64(b64, Type){
    const bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
    for(let i=0;i<n;i++) u8[i] = bin.charCodeAt(i);
    return new Type(u8.buffer);
  }
  /* 领土层: 一个 InstancedBufferGeometry 画出全部 942 块领土
     · 模板几何(共享)   = 每块领土的扇面(中心点 + 边界顶点), 存归一化切平面坐标
     · 实例属性(每领土) = 球心方向 / 切平面基 / 角半径 + 动态(尺寸/壳高/涨跌幅) */
  function _mkTerritoryLayer(d, atlasTex){
    const N = d.n;
    const V   = _b64(d.verts,  Float32Array);       // (nVert,3) 单位球顶点
    const rS  = _b64(d.rStart, Uint32Array);        // 领土 → 边界顶点 CSR
    const rI  = _b64(d.rIdx,   Uint16Array);
    const pR  = _b64(d.radius, Float32Array);       // 每块领土最大角半径(rad)
    const cla = _b64(d.clat,   Float32Array);
    const clo = _b64(d.clon,   Float32Array);
    const tI  = _b64(d.tile,   Int16Array);         // 图集序号
    const lnd = _b64(d.land,   Uint8Array);         // 海(0) / 陆(1)
    /* v143 新增: 水域占比(0..1) / 主流币 / 交界空格 */
    const wfr = d.waterFrac ? _b64(d.waterFrac, Float32Array) : null;
    const isM = d.isMain    ? _b64(d.isMain,    Uint8Array)  : null;
    const emt = d.isEmpty   ? _b64(d.isEmpty,   Uint8Array)  : null;
    const nS  = _b64(d.nStart, Uint32Array);        // 领土 → 邻居 CSR
    const nI  = _b64(d.nIdx,   Uint16Array);
    /* ① 领土中心(单位向量) + ② 切平面基(east/north) */
    const cen = new Float32Array(N*3), east = new Float32Array(N*3), nor = new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const la = cla[i]*D2R, lo = clo[i]*D2R, cl = Math.cos(la);
      const cx = cl*Math.cos(lo), cy = cl*Math.sin(lo), cz = Math.sin(la);
      cen[i*3]=cx; cen[i*3+1]=cy; cen[i*3+2]=cz;
      const ex = -Math.sin(lo), ey = Math.cos(lo);            // east = ∂/∂lon
      east[i*3]=ex; east[i*3+1]=ey; east[i*3+2]=0;
      nor[i*3]  = cy*0 - cz*ey;                                // north = cen × east
      nor[i*3+1]= cz*ex - cx*0;
      nor[i*3+2]= cx*ey - cy*ex;
    }
    /* ③ 模板几何: 每块领土 = 一个扇面(中心 + m 个边界顶点) */
    const locArr = [], edgeArr = [], idxArr = [];
    let vb = 0;
    for(let i=0;i<N;i++){
      const a = rS[i], b = rS[i+1], m = b - a, maxR = pR[i] || 1e-4;
      locArr.push(0, 0); edgeArr.push(0);                    /* 中心 (rr=0, 边距=0) */
      for(let k=a;k<b;k++){
        const vi = rI[k];
        const vx = V[vi*3], vy = V[vi*3+1], vz = V[vi*3+2];
        const c0 = Math.max(-1, Math.min(1, vx*cen[i*3] + vy*cen[i*3+1] + vz*cen[i*3+2]));
        const ang = Math.acos(c0);
        const de = vx*east[i*3] + vy*east[i*3+1] + vz*east[i*3+2];
        const dn = vx*nor[i*3]  + vy*nor[i*3+1]  + vz*nor[i*3+2];
        const w = Math.sqrt(de*de + dn*dn) || 1e-9;
        const rr = ang / maxR;                                 /* 归一化角半径(边界=1) */
        locArr.push(rr*de/w, rr*dn/w);                         /* (rr·cosφ, rr·sinφ) */
        edgeArr.push(1);                                       /* ★ 边界顶点: 蜂窝墙精确贴多边形边 */
      }
      for(let k=0;k<m;k++) idxArr.push(vb, vb+1+k, vb+1+((k+1)%m));
      vb += m + 1;
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vb*3), 3));  // 占位(边界球由 frustumCulled=false 兜底)
    g.setAttribute('aLocal', new THREE.BufferAttribute(new Float32Array(locArr), 2));
    g.setAttribute('aEdge',  new THREE.BufferAttribute(new Float32Array(edgeArr), 1));
    g.setIndex(idxArr);
    g.instanceCount = N;
    g.setAttribute('aCen',   new THREE.InstancedBufferAttribute(cen, 3));
    g.setAttribute('aEast',  new THREE.InstancedBufferAttribute(east, 3));
    g.setAttribute('aNorth', new THREE.InstancedBufferAttribute(nor, 3));
    g.setAttribute('aMax',   new THREE.InstancedBufferAttribute(pR, 1));
    /* 动态属性: 格内 logo 占比(aFill) / 壳高(aShell) / 涨跌幅(aChg) */
    const szA = new Float32Array(N), shA = new Float32Array(N), cgA = new Float32Array(N);
    const ldF = new Float32Array(N);
    /* v143b(严重修复: WebGL "Too many attributes") ——
       直接多加 aWater/aMain/aEmpty 会把顶点属性槽撑爆(超过 GPU 上限 16)
       → 着色器编译失败 → 整层领土不渲染 → 作者"看不到 logo"。
       改为打包进单个 vec4 aPack = (tile, water, flags, 0):
         flags bit0 = 主流币, bit1 = 交界空格, bit2 = 陆
       属性数 15 → 11, 安全回到上限内。 */
    const pkA = new Float32Array(N*4);
    for(let i=0;i<N;i++){
      szA[i] = _TS_MIN + _TS_SPAN*0.20;
      shA[i] = _TERR_SHELL0;
      ldF[i] = lnd[i] ? 1 : 0;
      const fl = (isM && isM[i] ? 1 : 0) | (emt && emt[i] ? 2 : 0) | (lnd[i] ? 4 : 0);
      pkA[i*4+0] = tI[i];
      pkA[i*4+1] = wfr ? wfr[i] : (lnd[i] ? 0 : 1);
      pkA[i*4+2] = fl;
      pkA[i*4+3] = 0;
    }
    g.setAttribute('aFill', new THREE.InstancedBufferAttribute(szA, 1));
    g.setAttribute('aShell',   new THREE.InstancedBufferAttribute(shA, 1));
    g.setAttribute('aChg',     new THREE.InstancedBufferAttribute(cgA, 1));
    g.setAttribute('aPack',    new THREE.InstancedBufferAttribute(pkA, 4));
    const m = new THREE.ShaderMaterial({
      uniforms:{
        uAtlas:{value:atlasTex}, uCols:{value:d.cols}, uRows:{value:d.rows},
        uAlpha:{value:0.0}, uTime:{value:0}, uN:{value:N}
      },
      vertexShader:[
        'precision highp float;',
        'attribute vec2 aLocal; attribute float aEdge;',
        'attribute vec3 aCen; attribute vec3 aEast; attribute vec3 aNorth;',
        'attribute float aMax; attribute float aFill; attribute float aShell;',
        'attribute float aChg; attribute vec4 aPack;',
        'uniform float uTime;',
        'varying vec2 vLoc; varying float vRR; varying float vTile; varying float vLand;',
        'varying float vChg; varying float vFacing; varying float vSeed; varying float vFill; varying float vEdge;',
        'varying float vWater; varying float vMain; varying float vEmpty;',
        'void main(){',
        /* v142b(作者: 不能冲突不能重叠 像蜂窝一样)
           ★ 领土边界 = Voronoi 单元边界, 永远不外扩 → 相邻领土边对边严丝合缝,
             既无重叠也无缝隙(蜂窝密铺)。
           ★ "大小"不再靠膨胀多边形(那必然压到邻居身上) —— 改为领土内部
             logo 的占比 aFill + 抬升 aShell。 */
        '  float rr  = length(aLocal);',
        '  vec2  dr  = rr > 1e-6 ? aLocal/rr : vec2(1.0, 0.0);',
        /* v142d(作者: 蜂窝一样镶嵌进地球) —— 每格收缩 0.915 后绘制
           → 相邻之间露出一条缝(缝里是地球本体) = 真正的蜂窝镶嵌 */
        '  float SH  = 0.915;',
        '  float ang = rr * aMax * SH;',
        '  vec3  p   = normalize(aCen*cos(ang) + (aEast*dr.x + aNorth*dr.y)*sin(ang));',
        '  vLoc = aLocal; vRR = rr; vTile = aPack.x; vChg = aChg; vFill = aFill; vEdge = aEdge;',
        '  vWater = aPack.y;',
        '  vMain  = mod(floor(aPack.z), 2.0);',
        '  vEmpty = mod(floor(aPack.z/2.0), 2.0);',
        '  vLand  = mod(floor(aPack.z/4.0), 2.0);',
        '  vSeed = fract(sin(aCen.x*127.1 + aCen.y*311.7 + aCen.z*74.7)*43758.5453);',
        /* 面向相机程度(球缘渐隐 + 名牌可见性共用) */
        '  vFacing = normalize((viewMatrix * vec4(p, 0.0)).xyz).z;',
        /* 壳高: 重要的领土微微抬起(纯径向 → 不改变边界, 不会压到邻居) */
        '  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * vec4(p*aShell, 1.0));',
        '}'
      ].join('\n'),
      fragmentShader:[
        'precision highp float;',
        'uniform sampler2D uAtlas; uniform float uCols; uniform float uRows;',
        'uniform float uAlpha; uniform float uTime;',
        'varying vec2 vLoc; varying float vRR; varying float vTile; varying float vLand;',
        'varying float vChg; varying float vFacing; varying float vSeed; varying float vFill; varying float vEdge;',
        'varying float vWater; varying float vMain; varying float vEmpty;',
        'void main(){',
        '  if(uAlpha < 0.01) discard;',
        '  float rr = clamp(vRR, 0.0, 1.0);',
        /* ---- v143(作者: 陆地海洋区分清楚更细致) ----
           逐格水域占比 vWater → 海陆不再是二元, 而是连续过渡。
           交界空格(vEmpty): 州界/海岸带不币种, 只留地形底色(刻意留白)。 */
        '  float water = clamp(vWater, 0.0, 1.0);',
        '  float landF = 1.0 - water;',
        '  vec3 landC  = vec3(0.455, 0.435, 0.290);',   /* 陆: 暖土色(更亮) */
        '  vec3 landH  = vec3(0.560, 0.520, 0.330);',   /* 高地/沙漠提亮 */
        '  vec3 oceanD = vec3(0.020, 0.050, 0.140);',   /* 深海 */
        '  vec3 oceanS = vec3(0.060, 0.170, 0.360);',   /* 浅海(海岸带) */
        '  vec3 ter = mix(oceanD, oceanS, smoothstep(0.55, 0.98, water));',
        '  vec3 lnd = mix(landC, landH, smoothstep(0.30, 0.95, landF));',
        '  vec3 base = mix(ter, lnd, smoothstep(0.08, 0.42, landF));',
        /* ---- v144(作者: 币种什么的都拿掉, 只要六边形组成的地球) ----
           不再采样图集、不再打涨跌色。每格就是一块干净的六边形地形砖。 */
        /* 每格轻微亮度差异 → 六边形一块一块清晰可辨(不然整片糊成一张皮) */
        '  base *= (0.86 + 0.26*vSeed);',
        /* 六边形描边: 边界一圈压暗 + 内侧一道亮线 → 蜂窝格边界锐利 */
        '  float rim  = smoothstep(0.70, 0.985, rr);',
        '  float rim2 = smoothstep(0.52, 0.72, rr) * (1.0 - smoothstep(0.74, 0.90, rr));',
        '  vec3 col = base;',
        '  col = mix(col, col*0.34, rim);',            /* 边界描黑 */
        '  col += vec3(0.055, 0.075, 0.10) * rim2 * (0.5 + 0.5*vSeed);',  /* 内侧亮线 */
        /* ---- 立体感(作者: 要有立体感) —— 中心凸起 + 左上高光 + 边缘凹槽 ---- */
        '  vec2 ldir = rr > 1e-4 ? vLoc/rr : vec2(0.0);',
        '  float lit  = dot(ldir, vec2(-0.45, 0.72));',
        '  float dome = 1.0 - rr*rr;',
        '  col *= (0.84 + 0.30*dome);',
        '  col *= (1.0 + 0.22*lit*(1.0 - smoothstep(0.20, 1.0, rr)));',
        '  col *= (1.0 - 0.42*smoothstep(0.80, 1.0, rr));',      /* 边缘凹槽(暗) */
        /* v143c(作者: 外圈发光) —— 删掉那圈亮色内沿(0.40,0.48,0.64), 它看起来就是每块币的外发光 */
        /* 球缘/背面渐隐; 半透明 → 不把地球挡死(作者) */
        '  float front = smoothstep(-0.12, 0.20, vFacing);',
        '  float a = uAlpha * front * mix(0.60, 0.86, landF);',
        '  gl_FragColor = vec4(col, a);',
        '}'
      ].join('\n'),
      /* v142c(作者: 太卡了) —— 性能关键改动:
         领土已证明零重叠(面积和 = 4π 偏差 0.0000%), 所以
         ① FrontSide  → 背面三角形直接剔除(省一半片元)
         ② depthWrite → 每像素只着色一次, 消除全屏重叠重绘(最大开销)
         旧版 DoubleSide + depthWrite:false 会把整颗球重绘两遍。 */
      transparent:true, depthWrite:true, depthTest:true, side:THREE.FrontSide
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;                                // 包围球无法从模板推算 → 不做视锥剔除
    mesh.renderOrder = 2;
    mesh.userData = {
      n:N, syms:d.syms, cen:cen, east:east, north:nor, rad:pR,
      nStart:nS, nIdx:nI,
      pk:pkA,
      /* v143b: 从 aPack 解包出的 CPU 侧视图(供名牌/交互判定) */
      mainA:(function(){ const a=new Float32Array(N); for(let i=0;i<N;i++) a[i]=Math.floor(pkA[i*4+2])%2; return a; })(),
      emptyE:(function(){ const a=new Float32Array(N); for(let i=0;i<N;i++) a[i]=Math.floor(pkA[i*4+2]/2)%2; return a; })(),
      waterW:(function(){ const a=new Float32Array(N); for(let i=0;i<N;i++) a[i]=pkA[i*4+1]; return a; })(),
      showChg:{},                                    /* v143: 允许显示涨跌百分比的币 */
      tgtSize:new Float32Array(N), tgtShell:new Float32Array(N), tgtChg:new Float32Array(N),
      sym2i:(function(){ const o={}; for(let i=0;i<N;i++) o[d.syms[i]]=i; return o; })(),
      mktReady:false, tagMap:null, hot:new Float32Array(N)
    };
    window.__terrMesh = mesh;
    return mesh;
  }

  /* ── 行情 → 领土 (movers: [{sym, chg_pct, vol, rv}]) ─────────── */
  window.__cgTerrMkt = function(movers){
    const mesh = window.__terrMesh; if(!mesh) return 0;
    const M = mesh.userData;
    const list = (movers||[]).filter(function(x){ return x && x.sym && M.sym2i[x.sym] != null; });
    if(!list.length) return 0;
    /* ① 排名归一(成交额) + 涨跌幅幅度 */
    const byVol = list.slice().sort(function(a,b){ return (+b.vol||0)-(+a.vol||0); });
    const rank = {}; byVol.forEach(function(x,i){ rank[x.sym]=i; });
    const nv = Math.max(byVol.length-1, 1);
    const S = M.tgtSize, H = M.tgtShell, C = M.tgtChg, HO = M.hot;
    const mktMap = {};
    for(let k=0;k<list.length;k++){
      const x = list[k], i = M.sym2i[x.sym];
      const chg = Number(x.chg_pct)||0;
      const nr = Math.pow(1 - (rank[x.sym]||0)/nv, 0.85);        // 成交额排名 → 0..1
      const am = Math.min(Math.abs(chg)/7.0, 1.0);               // 涨跌幅幅度 → 0..1
      /* 尺寸 = 热门底子(42%) + 行情波动(58%) —— 都只放大格内 logo 占比 */
      let sz = _TS_MIN + _TS_SPAN*(0.42*nr + 0.58*am);
      /* ② 邻域压制: 邻居更突出 → 自己的格内占比收一档(不碰边界, 绝不重叠) */
      const a = M.nStart[i], b = M.nStart[i+1];
      let press = 0;
      for(let q=a;q<b;q++){
        const j = M.nIdx[q];
        const sj = S[j] || _TS_MIN;
        if(sj > sz*1.06) press += Math.min((sj - sz)/sj, 0.6);
      }
      sz *= (1 - Math.min(press*0.30, 0.34));
      S[i] = Math.max(sz, _TS_MIN);
      HO[i] = nr;
      C[i] = chg;
      H[i] = _TERR_SHELL0 + _SHELL_LIFT*Math.max(S[i] - 1.0, 0);
      mktMap[x.sym] = x;
    }
    window.__cgMktMap = mktMap;      // 名牌读取最新涨跌幅
    M.mktReady = true;
    /* ③ 名牌候选: 重要度 = 成交额排名 + 涨跌幅度 → 前 34 个(正面稳定 12+ 个名字) */
    const byImp = list.slice().sort(function(a,b){
      const ia = 0.5*Math.pow(1-(rank[a.sym]||0)/nv,0.85) + 0.5*Math.min(Math.abs(+a.chg_pct||0)/10,1);
      const ib = 0.5*Math.pow(1-(rank[b.sym]||0)/nv,0.85) + 0.5*Math.min(Math.abs(+b.chg_pct||0)/10,1);
      return ib - ia;
    });
    const tg = {};
    /* v143: 主流币总是有名牌(不被热门榜排挤掉) + 重要度前 34 */
    for(let i=0;i<M.n;i++) if(M.mainA[i] > 0.5) tg[M.syms[i]] = 1;
    byImp.slice(0, 34).forEach(function(x){ tg[x.sym] = 1; });
    M.tagMap = tg;
    /* v143(作者: 只有主流币与热门币、涨跌幅排行榜的才显示涨跌幅百分比)
       → 名牌一直在, 但百分比文本只给: 主流币 ∪ 成交额前40 ∪ 涨跌幅榜前25 */
    const show = {};
    for(let i=0;i<M.n;i++) if(M.mainA[i] > 0.5) show[M.syms[i]] = 1;
    byVol.slice(0, 40).forEach(function(x){ show[x.sym] = 1; });
    list.slice().sort(function(a,b){
      return Math.abs(+b.chg_pct||0) - Math.abs(+a.chg_pct||0);
    }).slice(0, 25).forEach(function(x){ show[x.sym] = 1; });
    M.showChg = show;
    _terrTagsBuild(tg, mktMap);
    try{ window.__cgLegendPaint && window.__cgLegendPaint(); }catch(e){}
    return list.length;
  };
  /* 兼容旧入口(旧代码/探针可能仍在调用) */
  window.__cgCoinMkt = function(mv){ return window.__cgTerrMkt(mv); };

  /* ══════════════════════════════════════════════════════════════
     领土名牌 —— 币种名 + 涨跌幅, 钉在领土中心, 共面感由朝向决定
     ══════════════════════════════════════════════════════════════ */
  const _terrEls = {};
  let _terrTagBox = null, _terrFrame = 0;
  const _tv1 = new THREE.Vector3(), _tv2 = new THREE.Vector3(), _tvC = new THREE.Vector3();
  function _terrLayerEl(){ if(!_terrTagBox) _terrTagBox = document.getElementById('coinTagLayer'); return _terrTagBox; }
  function _terrTagsBuild(tg, mktMap){
    if(window.__cgHexMode) return;          /* v145: 六边形球模式下不再生成币种名牌 */
    const box = _terrLayerEl(); if(!box) return;
    for(const s in tg){
      if(_terrEls[s]) continue;
      const el = document.createElement('div');
      el.className = 'coin-tag';
      el.innerHTML = '<span class="ct-n"></span><span class="ct-c"></span>';
      el.firstChild.textContent = s;
      el.style.opacity = '0';
      box.appendChild(el);
      _terrEls[s] = el;
    }
    for(const s in _terrEls){
      if(!tg[s]){ try{ _terrEls[s].remove(); }catch(e){} delete _terrEls[s]; }
    }
  }
  function _terrTagSync(){
    const mesh = window.__terrMesh; if(!mesh) return;
    const M = mesh.userData; if(!M.mktReady || !M.tagMap) return;
    const box = _terrLayerEl(); if(!box) return;
    /* v142c(作者: 太卡了) —— 不再强制递归重算矩阵:
       renderer 每帧已更新 matrixWorld, 这里直接用即可
       (updateMatrixWorld(true) 会强制重算整个子树, 在 120Hz 的
        pointermove / 每次标签同步里调用 → 是本次卡顿的主因之一) */
    _tvC.setFromMatrixPosition(group.matrixWorld);              /* 球心(世界坐标) */
    const cam = camera.position, w = window.innerWidth, h = window.innerHeight;
    const pxPerUnit = (h*0.5) / Math.tan(camera.fov*0.5*D2R);   /* 单位球半径 → 屏幕像素 */
    const mk = window.__cgMktMap || {};
    const cand = [];
    for(const s in M.tagMap){
      const el = _terrEls[s]; if(!el) continue;
      const i = M.sym2i[s]; if(i == null) continue;
      _tv1.set(M.cen[i*3], M.cen[i*3+1], M.cen[i*3+2]).applyMatrix4(mesh.matrixWorld);
      /* 朝向: 领土法线(球心→领土) 与 视线方向 的夹角余弦 */
      const nx = _tv1.x-_tvC.x, ny = _tv1.y-_tvC.y, nz = _tv1.z-_tvC.z;
      const nl = Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      const vx = cam.x-_tv1.x, vy = cam.y-_tv1.y, vz = cam.z-_tv1.z;
      const vl = Math.sqrt(vx*vx+vy*vy+vz*vz)||1;
      const facing = (nx*vx+ny*vy+nz*vz)/(nl*vl);
      if(facing < 0.16) continue;                              /* 背面/球缘不上牌 */
      const clo = vl;
      /* 该领土的屏幕像素直径(蜂窝单元尺寸恒定 → 只按角半径算) */
      const px = 2 * M.rad[i] * (pxPerUnit/clo);
      if(px < 16) continue;                                    /* 太小不配名字(不糊) */
      _tv2.copy(_tv1).project(camera);
      const bx = (_tv2.x*0.5+0.5)*w, by = (-_tv2.y*0.5+0.5)*h;
      if(_tv2.z >= 1 || bx < 24 || bx > w-24 || by < 16 || by > h-16) continue;
      cand.push({ s:s, el:el, x:bx, y:by, px:px, facing:facing });
    }
    /* 大领土优先占地: 像素直径从大到小依次上牌, 冲突的让位 */
    cand.sort(function(a,b){ return b.px - a.px; });
    /* 先把本轮不在候选里的全部隐掉 */
    for(const s in _terrEls){ if(!cand.length || !cand.some(function(c){return c.s===s})) _terrEls[s].style.opacity = '0'; }
    const used = [];
    for(let ci=0; ci<cand.length; ci++){
      const c = cand[ci], el = c.el;
      const fs = Math.max(9, Math.min(12.5, c.px*0.20));   /* v142d: 名字调小(作者) */
      const ty = c.y + Math.max(c.px*0.5, 7) + 3;               /* 领土下方 */
      const md = mk[c.s] || {};
      const cg = Number(md.chg_pct)||0;
      const cEl = el.querySelector('.ct-c');
      const mkHas = !!(mk && mk[c.s]);            /* 该币本轮有行情数据? */
      if(cEl){
        /* v143(作者): 只给主流/热门/榜前币显示百分比, 其余只留币名;
           没有行情数据的币不显示 0.00%(假数据) */
        const allow = !!(M.showChg && M.showChg[c.s]) && mkHas;
        const txt = allow
          ? ((cg>=0?'+':'') + (Math.abs(cg)>=100 ? cg.toFixed(0) : cg.toFixed(2)) + '%')
          : '';
        if(cEl.textContent !== txt) cEl.textContent = txt;
      }
      /* 无行情数据 → 中立色(不用默认的涨色误导) */
      const cls = !mkHas ? 'flat' : (cg>=0 ? 'up' : 'dn');
      const want = 'coin-tag ' + cls + ((M.showChg && M.showChg[c.s] && mkHas) ? '' : ' bare');
      if(el.className !== want) el.className = want;
      const hw = ((c.s.length*0.64 + 6.5) * fs) * 0.5, hh = fs*0.72;
      let hit = false;
      for(let ui=0; ui<used.length; ui++){
        const u = used[ui];
        if(Math.abs(c.x-u.x) < (hw+u.hw) && Math.abs(ty-u.ty) < (hh+u.hh)){ hit = true; break; }
      }
      if(hit){ if(el.style.opacity !== '0') el.style.opacity = '0'; continue; }
      used.push({ x:c.x, ty:ty, hw:hw, hh:hh });
      el.style.left = c.x.toFixed(1)+'px';
      el.style.top  = ty.toFixed(1)+'px';
      el.style.fontSize = fs.toFixed(1)+'px';
      el.dataset.px = c.px.toFixed(1);
      if(el.style.opacity !== '1') el.style.opacity = '1';
    }
  }

  /* v140(作者: 全站红涨绿跌) —— ON=涨/盈利(红), OFF=跌/亏损(绿) */
  const _PB_ON = 0xf0616f, _PB_OFF = 0x0ecb81;
  /* ── 领土拾取(悬停 → 反向联动右侧行情卡) ───────────────────── */
  let _terrHover = null, _terrHlIdx = -1, _terrPickT = 0;
  const _tpA = new THREE.Vector3(), _tpB = new THREE.Vector3();   /* v142c: 预分配, 不在事件里 new */
  function _terrPick(cx, cy){
    const mesh = window.__terrMesh; if(!mesh) return null;
    const M = mesh.userData;
    const cam = camera.position, w = window.innerWidth, h = window.innerHeight;
    const pxPerUnit = (h*0.5)/Math.tan(camera.fov*0.5*D2R);
    const c = _tpA, v = _tpB;
    /* v142c: 不再强制递归重算矩阵(渲染循环已更新) */
    _tvC.setFromMatrixPosition(group.matrixWorld);
    let best = null, bd = 30;
    for(const s in M.tagMap){
      const i = M.sym2i[s]; if(i == null) continue;
      c.set(M.cen[i*3], M.cen[i*3+1], M.cen[i*3+2]).applyMatrix4(mesh.matrixWorld);
      const nx=c.x-_tvC.x, ny=c.y-_tvC.y, nz=c.z-_tvC.z, nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      const vx=cam.x-c.x, vy=cam.y-c.y, vz=cam.z-c.z, vl=Math.sqrt(vx*vx+vy*vy+vz*vz)||1;
      if((nx*vx+ny*vy+nz*vz)/(nl*vl) < 0.16) continue;
      const px = 2*M.rad[i]*(pxPerUnit/vl);
      v.copy(c).project(camera);
      if(v.z >= 1) continue;
      const sx = (v.x*0.5+0.5)*w, sy = (-v.y*0.5+0.5)*h;
      const d = Math.hypot(sx-cx, sy-cy) - px*0.5;
      if(d < bd){ bd = d; best = s; }
    }
    return best;
  }
  window.addEventListener('pointermove', function(e){
    if(!window.__earth3d) return;
    /* v142c: 节流到 ~12Hz —— 拾取只是改高亮, 不需要跟着 120Hz 鼠标跑 */
    const now = performance.now();
    if(now - _terrPickT < 80) return;
    _terrPickT = now;
    try{
      const s = _terrPick(e.clientX, e.clientY);
      if(s === _terrHover) return;
      try{ window.dispatchEvent(new CustomEvent('hwblock:hover',{detail:_terrHover})) }catch(err){}
      _terrHover = s;
      const M = window.__terrMesh && window.__terrMesh.userData;
      if(M) M.hlIdx = (s && M.sym2i[s] != null) ? M.sym2i[s] : -1;
      try{ window.dispatchEvent(new CustomEvent('hwblock:hover',{detail:s})) }catch(err){}
    }catch(err){}
  }, {passive:true});
  /* ── 每帧驱动: 尺寸/壳高/涨跌色 缓动 + 名牌同步 ──────────────── */
  window.__cgTerrFrame = function(dt, tt){
    const mesh = window.__terrMesh; if(!mesh) return;
    const M = mesh.userData, g = mesh.geometry;
    if(!M.mktReady) return;
    const S = g.attributes.aFill.array, H = g.attributes.aShell.array, C = g.attributes.aChg.array;
    const TS = M.tgtSize, TH = M.tgtShell, TC = M.tgtChg;
    const hl = M.hlIdx == null ? -1 : M.hlIdx;
    let moved = false;
    for(let i=0;i<M.n;i++){
      const want = TS[i] + (i===hl ? 0.10 : 0);
      const d1 = want - S[i];
      if(d1 > 1e-4 || d1 < -1e-4){ S[i] += d1*Math.min(1, dt*2.4); moved = true; }
      const d2 = TH[i] - H[i];
      if(d2 > 1e-5 || d2 < -1e-5){ H[i] += d2*Math.min(1, dt*2.0); moved = true; }
      const d3 = TC[i] - C[i];
      if(d3 > 0.02 || d3 < -0.02){ C[i] += d3*Math.min(1, dt*1.8); moved = true; }
    }
    if(moved){
      g.attributes.aFill.needsUpdate = true;
      g.attributes.aShell.needsUpdate = true;
      g.attributes.aChg.needsUpdate = true;
    }
    if(mesh.material.uniforms.uTime) mesh.material.uniforms.uTime.value = tt;
    /* v142c: 标签同步降到 ~10fps(每 6 帧) —— 名字不需要 20fps */
    if((_terrFrame = (_terrFrame + 1) % 6) === 0) _terrTagSync();
  };
  /* ── 地球旋转聚焦(点行情卡 → 转到该币领土) ─────────────────── */
  function _terrFocus(sym){
    try{
      const mesh = window.__terrMesh; if(!mesh) return false;
      const M = mesh.userData, i = M.sym2i[sym];
      if(i == null) return false;
      const x = M.cen[i*3], z = M.cen[i*3+2];
      const ang = Math.atan2(x, z);
      window.__cgFocus = { target: group.rotation.y - ang, until: performance.now()+2200 };
      return true;
    }catch(e){ return false }
  }
  window.__cgFocusSym = _terrFocus;
  function _terrHighlight(sym, on){
    try{
      const mesh = window.__terrMesh; if(!mesh) return 0;
      const M = mesh.userData, i = M.sym2i[String(sym||'').toUpperCase()];
      if(i == null) return 0;
      M.hlIdx = on ? i : -1;
      return 1;
    }catch(e){ return 0 }
  }
  /* ── 对外门面(保持旧 API 形状, 内部全部指向领土层) ──────────── */
  window.__cgEarthMkt = {
    sync: function(mv){ return window.__cgTerrMkt(mv); },
    count: function(){ const M=window.__terrMesh&&window.__terrMesh.userData; return M&&M.mktReady?M.n:0; },
    sig: function(){ const M=window.__terrMesh&&window.__terrMesh.userData; return M&&M.mktReady?('terr:'+M.n):''; }
  };
  window.__cgEarthPos = {
    sync: function(){ return 0; },                       /* v142: 地球不再按持仓显示 */
    setPnl: function(upnl){
      try{
        const n = Number(upnl)||0;
        atmMat.uniforms.uPnlAmt.value = Math.min(Math.abs(n)/300, 1);
        atmMat.uniforms.uPnlCol.value.setHex(n>=0?_PB_ON:_PB_OFF);
        /* v157: 能量护盾跟着账户盈亏一起染色(与球心大气同源) */
        if(window.__cgHexShield && window.__cgHexShield.material.uniforms.uPnlAmt){
          window.__cgHexShield.material.uniforms.uPnlAmt.value = Math.min(Math.abs(n)/300, 1);
          window.__cgHexShield.material.uniforms.uPnlCol.value.setHex(n>=0?_PB_ON:_PB_OFF);
        }
      }catch(e){}
    },
    focus: _terrFocus,
    highlight: _terrHighlight,
    count: function(){ const M=window.__terrMesh&&window.__terrMesh.userData; return M&&M.mktReady?M.n:0; },
    keys: function(){ const M=window.__terrMesh&&window.__terrMesh.userData; return M?Object.keys(M.tagMap||{}):[]; },
    dbg: function(){
      const M = window.__terrMesh && window.__terrMesh.userData;
      if(!M) return { ready:false };
      const S = window.__terrMesh.geometry.attributes.aFill.array;
      let mn=1e9, mx=-1e9, sum=0;
      for(let i=0;i<M.n;i++){ const v=S[i]; if(v<mn)mn=v; if(v>mx)mx=v; sum+=v; }
      const keys = Object.keys(M.tagMap||{}).slice(0,8);
      return {
        ready:M.mktReady, n:M.n,
        sizeMin:+mn.toFixed(3), sizeMax:+mx.toFixed(3), sizeAvg:+(sum/M.n).toFixed(3),
        beacons: keys.map(function(s){ const i=M.sym2i[s]; const mk=(window.__cgMktMap||{})[s]||{};
          return { k:s, sz:+(S[i]||0).toFixed(3), chg:+(mk.chg_pct||0) }; })
      };
    }
  };

  function _mkGlobeLines(pts, seg, r, col, opacity){
    const arr = [];
    for(let k=0;k<seg.length-1;k++){
      const a = seg[k], b = seg[k+1];
      for(let i=a;i<b-1;i++){
        const v1 = ll2v(pts[i*2], pts[i*2+1], r);
        const v2 = ll2v(pts[(i+1)*2], pts[(i+1)*2+1], r);
        arr.push(v1.x,v1.y,v1.z, v2.x,v2.y,v2.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr),3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color:col, transparent:true, opacity:opacity, depthWrite:false,
      blending:THREE.AdditiveBlending }));
  }
  /* ══════════════════════════════════════════════════════════════
     v135(09-19 作者: 地球不再按持仓显示, 改按实时热门主流 + 涨跌幅排行榜
          — 整个地球就是币种组成的, 有大有小(涨跌幅% + 热门主流大一点))
     把 /dash/market 的 movers 回写到球面币种层的 aChg/aHot 属性:
       aChg = 该币 24h 涨跌幅%   → 尺寸增益 + 涨绿跌红染色
       aHot = 热门度 0..1(成交额排名幂次归一) → 主流币底尺寸更大
     ══════════════════════════════════════════════════════════════ */
  if(DIGI){
    /* v143(作者: 去除地球经纬线) —— 经纬网(graticule)不再加入场景;
       海岸线保留为地理参照(已弱化, 只帮眼睛认出大陆轮廓) */
    fetch('vendor/coin_globe.json?v='+_COIN_G_V).then(function(r){ return r.json(); }).then(function(d){
      if(window.__cgHexMode) return;          /* v145: 六边形球模式 → 海岸线不再入场景 */
      if(!d) return;
      if(d.coast) group.add(_mkGlobeLines(d.coast.pts, d.coast.seg, 1.0075, 0xe0bd63, 0.30));
      window.__globeData = d;
    }).catch(function(){});
    /* v142(作者: 十二边形领土组成地球 / 不要悬空) —— 领土镶嵌地球
       territory.json = 942 块球面 Voronoi 领土(离线 gen_territory.py 生成):
       每块都是球面上真实的 3D 多边形 → 边对边无缝, 天然贴合球面, 零悬空 */
    fetch('vendor/territory.json?v='+_TERR_V).then(function(r){ return r.json(); }).then(function(td){
      if(window.__cgHexMode) return;   /* v145: 六边形球模式 → 旧领土层根本不建(早先只隐藏会因加载竞态漏掉) */
      if(!td || !td.verts) return;
      const _atlasTex = new THREE.TextureLoader().load('vendor/coin_atlas_hi.webp?v='+_COIN_A_V, function(){
        try{ if(window.__terrMesh) window.__terrMesh.material.uniforms.uAlpha.value = 1.0; }catch(e){}
      });
      _atlasTex.flipY = false;
      /* v143c(作者: 币种图片很模糊 + 外圈发光 + 卡顿) —— 三个都是这里造成的:
         ① 模糊: THREE 默认 generateMipmaps=true + LinearMipmapLinearFilter。
            图集是 32x32 格, 缩放时高 mip 层会把相邻格子的像素混进来
            → logo 一团糊。关掉 mipmap, 直接单层线性采样 = 锐利。
         ② 卡顿: anisotropy=8 在缩小时每像素最多采 8 次;
            关掉 mipmap 后各向异性也没有意义 → 设 1。
         ③ 外圈发光: 见 fragment 着色器(已删亮环 + 收紧 logo 软边)。 */
      _atlasTex.generateMipmaps = false;
      _atlasTex.minFilter = THREE.LinearFilter;
      _atlasTex.magFilter = THREE.LinearFilter;
      _atlasTex.anisotropy = 1;
      /* v143c(作者: 模糊) —— 色彩空间修正:
         renderer.outputEncoding = sRGB, 而图集纹理默认是 LinearEncoding
         → 输出时被再做一次 gamma 编码 → 币图被"提亮 / 洗白"、对比度下降,
         看起来就是发白发糊。标成 sRGB 后色彩正确、边缘对比拉回来 → 锐。 */
      if(THREE.sRGBEncoding !== undefined) _atlasTex.encoding = THREE.sRGBEncoding;
      _atlasTex.needsUpdate = true;
      const mesh = _mkTerritoryLayer(td, _atlasTex);
      window.__terrMesh = mesh;
      group.add(mesh);
      _renderEarthLegend();
    }).catch(function(){});

    /* ════════════════════════════════════════════════════════════════
       v145 (2026-09-20 作者: 直接替换现在网站里的地球, 我要直接看见)
         → 旧地球本体 / 大气辉光 / 云层 / 旧领土 **全部退场**,
           换成一颗纯六边形砖块拼成的球 (Goldberg 多面体)。
         · 几何: /vendor/hexsphere.json  (scripts/gen_hexsphere.py 生成)
            真二十面体细分 → 取对偶: 12 个五边形 + 1650 个六边形
            = 99.29% 六边形; 每条边恰好 2 格共享 → 不重复 / 不冲突 / 零缝隙
         · 每格是带厚度的六棱砖, 朝自己中心缩 GAP → 格与格之间露出一道均匀缝
           (蜂窝感), 砖块之间永不交叠。
       ════════════════════════════════════════════════════════════════ */
    window.__cgHexMode = true;
    /* ══ v149(作者: 所有币种 logo 贴进六边形) ══
       图集纹理: coin_atlas_hi.webp 32x32 格 / 每格 64px / 942 枚(生成时每格内缩 4px 留透明边)
       纹理参数与旧领土层同口径(关 mipmap / 线性 / sRGB → logo 锐利不发糊) */
    const _hexAtlasTex = new THREE.TextureLoader().load('vendor/coin_atlas_hi.webp?v='+_COIN_A_V);
    _hexAtlasTex.flipY = false;
    _hexAtlasTex.generateMipmaps = false;
    _hexAtlasTex.minFilter = THREE.LinearFilter;
    _hexAtlasTex.magFilter = THREE.LinearFilter;
    _hexAtlasTex.anisotropy = 1;
    if(THREE.sRGBEncoding !== undefined) _hexAtlasTex.encoding = THREE.sRGBEncoding;
    const _hexAtlasCfg = { cols:32, rows:32, cell:64, sym2idx:null, symOrder:[] };
    fetch('vendor/coin_atlas_hi.json?v='+_COIN_A_V).then(function(r){ return r.json(); }).then(function(a){
      if(!a) return;
      _hexAtlasCfg.cols = a.cols || 32; _hexAtlasCfg.rows = a.rows || 32;
      _hexAtlasCfg.cell = a.cell || 64; _hexAtlasCfg.sym2idx = a.sym2idx || null;
      _hexAtlasCfg.symOrder = a.vol || Object.keys(a.sym2idx || {});   /* v149e: 图集币序(补全用) */
      /* 图集清单就绪 → 立刻补投最近一次行情(解决时序) */
      try{
        const raw = window.__cgMktLastRaw || window.__cgHexMkt.last;
        if(raw && window.__cgHexMkt) window.__cgHexMkt(raw);
      }catch(e){}
    }).catch(function(){});

    fetch('vendor/hexsphere.json?v='+_HEX_V).then(function(r){ return r.json(); }).then(function(hd){
      if(!hd || !hd.verts || !hd.cells) return;
      const hex = _mkHexSphere(hd);
      if(!hex) return;
      window.__hexMesh = hex;
      group.add(hex);
      /* ── v150(作者: 币悬浮于地球外围 —— 球心里放回数字科幻地球) ──
         地球/大气缩到 0.55 倍塞进玻璃球腔(内腔 0.962 → 地球 0.549 / 大气 0.605);
         地球本体着色器 uDigital=1 ⇒ 数字科幻风, 直接复用不重写。
         renderOrder: 大气(1) → 玻璃砖(2) → 砖叠在地球之上但仍透光。 */
      try{
        earth.visible = true; earth.scale.setScalar(0.54);
        atm.visible = true;   atm.scale.setScalar(0.53); atm.renderOrder = 1;
      }catch(e){}
      try{ clouds.visible = false; }catch(e){}
      try{ if(window.__cgSkyMesh) window.__cgSkyMesh.visible = false; }catch(e){}
      try{ if(window.__terrMesh) window.__terrMesh.visible = false; }catch(e){}
      try{ _renderEarthLegend(); }catch(e){}
      /* ── v145(作者: 币种/浮亏地图等全都删干净) ──
         地球区域只留六边形球: 币种名牌层 / 读数图例 / 情报点 / 热力环 全部退场 */
      try{ document.querySelectorAll('#coinTagLayer, .coin-tag-layer, #aiEarthLegend, .ai-earth-legend, #aiEarthPos, .earth-pos-layer').forEach(function(n){ n.remove(); }); }catch(e){}
      try{ if(window.__cgHeatRingObj && window.__cgHeatRingObj.parent) window.__cgHeatRingObj.parent.remove(window.__cgHeatRingObj); }catch(e){}
      try{ if(window.__cgEarth && window.__cgEarth.clear) window.__cgEarth.clear(); }catch(e){}
      try{ document.querySelectorAll('.coin-tag, .el-h, .el-v').forEach(function(n){ n.remove(); }); }catch(e){}
      try{
        /* v149: 网格就绪 → 补投最近一次行情(此时若图集清单也到了, 币立刻出现) */
        const raw = window.__cgMktLastRaw;
        if(raw && window.__cgHexMkt) window.__cgHexMkt(raw);
      }catch(e){}
      try{ window.__cgHexReady = true; }catch(e){}
    }).catch(function(e){ try{ console.error('[hex] 构建失败: ' + (e && e.message || e)); window.__cgHexErr = String(e && e.stack || e); }catch(x){} });

    /* 六边形球专用补光(仅球体模式用) */
    const hexGroupLights = [];

    /* 六边形球构建器: 模板顶点 → 三角面(顶面扇 + 侧壁 + 底面) */
    function _mkHexSphere(hd){
      const RV = 0.995;            /* 球面半径 */
      /* v153(作者: 玻璃薄薄的一层) —— 砖厚 RV-RT: 0.033 → 0.018 */
      /* v157b(作者: 现在玻璃太厚了 有一点点就可以了) ——
         上一版放到 0.043 太厚。取中间值 0.023。
         厚度感主要交给「侧壁自发光」(玻璃切口)传达, 不靠砖体变厚 —— 本体保持通透。 */
      /* v126(作者: 厚度再薄) —— 壁高 = R_FACE_E(0.99848) - RT。
         原 0.972 ⇒ 壁高 0.0265, 在半径≈1 的球上 ≈2.65% 半径, 视觉上是一圈"厚砖"。
         抬到 0.9845 ⇒ 壁高 0.0139(约半), 砖变薄片, 更像薄玻璃切片。 */
      const RT = 0.9845;           /* 砖底半径(壁高 0.0139) */
      const VS = hd.verts;
      const N  = hd.cells.length;  /* ★ 格数 (不是顶点数) */
      const _v = function(i){ return new THREE.Vector3(VS[i][0], VS[i][1], VS[i][2]); };

      /* 海陆数据(earth_map.png 面积加权采样) */
      const water = hd.water ? (function(){
        const bin = atob(hd.water), n = bin.length, u8 = new Uint8Array(n);
        for(let i=0;i<n;i++) u8[i] = bin.charCodeAt(i);
        return new Float32Array(u8.buffer);
      })() : null;

      /* ── 程序化环境贴图: 金属必须有东西可反射(零外部依赖) ──
         v147: 反射压淡 —— 高光带收窄压暗, 金属感来自\"冷钢底色 + 边缘反光\",
         而不是一块过曝白斑。 */
      const envTex = (function(){
        try{
          const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
          const g2 = cv.getContext('2d');
          /* v124(作者: 目前整体冒蓝光 → 降蓝降饱和, 偏银灰冷钢) ——
             原蓝调 (#26496b 主轴) 是「整颗球冒蓝光」的重要来源之一。
             改为中性银灰钢: 保留金属反射的层次, 但不再偏蓝。 */
          /* v128.2(作者: 玻璃质感拉满) —— 环境贴图是玻璃反光的灵魂:
             天顶/地平带整体提亮 → 上缘有天光、中圈有层次 */
          const grd = g2.createLinearGradient(0, 0, 0, 256);
          grd.addColorStop(0.00, '#121720');
          grd.addColorStop(0.38, '#252d39');
          grd.addColorStop(0.50, '#4d5766');
          grd.addColorStop(0.62, '#151a22');
          grd.addColorStop(1.00, '#05070b');
          g2.fillStyle = grd; g2.fillRect(0, 0, 512, 256);
          const hl = g2.createLinearGradient(0, 0, 512, 0);
          hl.addColorStop(0.00, 'rgba(150,158,170,0)');
          hl.addColorStop(0.30, 'rgba(200,208,220,0.16)');
          hl.addColorStop(0.47, 'rgba(255,255,255,0.44)');
          hl.addColorStop(0.58, 'rgba(234,240,248,0.26)');
          hl.addColorStop(0.72, 'rgba(164,172,186,0.09)');
          hl.addColorStop(1.00, 'rgba(96,104,116,0)');
          g2.fillStyle = hl; g2.fillRect(0, 114, 512, 18);
          /* v128.2 盾币一体: 能量青反光带 —— 玻璃反射里带护盾同款青, 两层视觉同源 */
          const cy = g2.createLinearGradient(0, 0, 512, 0);
          cy.addColorStop(0.00, 'rgba(139,125,255,0)');
          cy.addColorStop(0.38, 'rgba(139,125,255,0.10)');
          cy.addColorStop(0.66, 'rgba(139,125,255,0.17)');
          cy.addColorStop(1.00, 'rgba(139,125,255,0)');
          g2.fillStyle = cy; g2.fillRect(0, 136, 512, 11);
          const t = new THREE.CanvasTexture(cv);
          if(THREE.EquirectangularReflectionMapping !== undefined) t.mapping = THREE.EquirectangularReflectionMapping;
          if(THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
          t.needsUpdate = true;
          return t;
        }catch(e){ return null; }
      })();

      const POS=[], NRM=[], COL=[];
      /* ── v149(作者: 所有币种 logo 贴进六边形表面) ──
         逐顶点附带 5 组数据, 由着色器直接消费(不额外画一层, 零 draw call 增量):
           aUV   格内切平面 2D 坐标(格心=0,0 / 面缘≈1) → logo 采样与圆形遮罩
           aTile 图集序号(-1 = 本格不放币)
           aChg  24h 涨跌幅(%) → 外壳光圈颜色(涨绿 / 跌红)
           aCell 格号 → 悬浮拾取(射线只认格号, 不遍历 23 万顶点)
           aZone 层区(0=面板心 1=面缘 2=外壳顶 3=侧壁底) → 光圈只画在外壳那一圈 */
      const UVARR=[], TILEARR=[], CHGARR=[], CELLARR=[], ZONEARR=[], CNARR=[], PANARR=[];
      const col = new THREE.Color();
      const _Z0 = { x:0, y:0 };
      let _mTile = -1.0, _mChg = 0.0, _mCell = -1.0;
      /* 悬浮抬升必须沿「格心法线」整格平移 —— 若用面法线(各三角面朝向不同),
         同一格会被拉散(六边形撕裂)。aCN = 本格格心方向, 整格一致。 */
      let _mCNx = 0, _mCNy = 1, _mCNz = 0;
      let _mPanel = 0;
      /* ★ v149 关键: aTile/aChg 是「逐顶点」属性, 必须写到该格的每一个顶点上。
         只按下标 i 写(旧写法)会写错顶点 → 只有极少数格碰巧显示, 其余全是底色。
         CELLVIDX[i] = 第 i 格的全部顶点下标。 */
      const CELLVIDX = new Array(N);
      /* v149g: 三角形序号 → 格号。悬浮拾取改成「射线打真实三角面」,
         拿到 faceIndex 直接查表 → 命中格与鼠标位置严格一致
         (旧的「球面近似 + 最近格心」在大格/球缘会偏到隔壁格)。 */
      const TRI2CELL = [];
      const _tri = function(a,b,c,r,g,bl, zA,zB,zC, uvA,uvB,uvC){
        TRI2CELL.push(_mCell);
        if(_mCell >= 0){
          const vb = POS.length/3;
          if(!CELLVIDX[_mCell]) CELLVIDX[_mCell] = [];
          CELLVIDX[_mCell].push(vb, vb+1, vb+2);
        }
        const e1x=b.x-a.x, e1y=b.y-a.y, e1z=b.z-a.z;
        const e2x=c.x-a.x, e2y=c.y-a.y, e2z=c.z-a.z;
        let nx=e1y*e2z-e1z*e2y, ny=e1z*e2x-e1x*e2z, nz=e1x*e2y-e1y*e2x;
        const L=Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=L; ny/=L; nz/=L;
        POS.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
        /* v149h: 面板那一层(zA=1)统一用「格心法线」——
           flatShading 下每个三角面各算各的法线, 面板虽是平的也会出现
           放射状折痕(logo 盘上能看到三角形接缝)。整层共用一个法线后,
           面板变成一块完整平面镜, logo 干净无折痕; 外壳/侧壁仍用逐面法线
           保留硬朗的板甲质感。 */
        if(zA === 1){
          NRM.push(_mCNx,_mCNy,_mCNz, _mCNx,_mCNy,_mCNz, _mCNx,_mCNy,_mCNz);
        } else {
          NRM.push(nx,ny,nz, nx,ny,nz, nx,ny,nz);
        }
        COL.push(r,g,bl, r,g,bl, r,g,bl);
        const z0 = (zA===undefined)?0:zA, z1 = (zB===undefined)?z0:zB, z2 = (zC===undefined)?z0:zC;
        const u0 = uvA||_Z0, u1 = uvB||_Z0, u2 = uvC||_Z0;
        ZONEARR.push(z0,z1,z2);
        CNARR.push(_mCNx,_mCNy,_mCNz, _mCNx,_mCNy,_mCNz, _mCNx,_mCNy,_mCNz);
        PANARR.push(_mPanel,_mPanel,_mPanel);
        UVARR.push(u0.x,u0.y, u1.x,u1.y, u2.x,u2.y);
        TILEARR.push(_mTile,_mTile,_mTile);
        CHGARR.push(_mChg,_mChg,_mChg);
        CELLARR.push(_mCell,_mCell,_mCell);
      };
      const _hash = function(x,y,z){
        const h = Math.sin(x*127.1 + y*311.7 + z*74.7) * 43758.5453;
        return h - Math.floor(h);
      };
      const _hash2 = function(x,y,z){
        const h = Math.sin(x*269.5 + y*183.3 + z*246.1) * 24634.6345;
        return h - Math.floor(h);
      };

      const _v3a = new THREE.Vector3(), _v3b = new THREE.Vector3();
      let hexN = 0, pentN = 0;
      const sizeArr = new Float32Array(N);        /* 供后续按币种定大小 */
      const faceArr = new Uint8Array(N);          /* 0=上半球 1=下半球 */
      const faceWArr = new Float32Array(N);       /* 面内权重 1=面心 0=面缘 */
      const dirArr = new Float32Array(N*3);       /* 每格单位朝向(后续挂币种/投影用) */

      /* ── v147c 单格几何(作者: 每个多边形都有一层外壳 / 立体圆润) ──
         ★ 旧版致命错误: 只画了「环带+侧壁」, **中心没画面** → 六边形中心是个洞,
           看到的是背后的深色金属壳。所以海陆色根本无从显示, 整球看着一片深蓝。
         现在每格 = 三层:
           ① 面板 face : 从格心到面缘的扇形 → 海/陆底色(主体, 面积最大)
           ② 外壳 crest: 面缘向外抬升的一圈亮边 → 金属外壳
           ③ 侧壁 wall : 外壳落到砖底的竖壁 → 让每块砖有厚度
         格心略微拱起(dome) → 单块微凸, 整球更圆润立体。 */
      /* v149g(作者: logo 中央又太高) —— 原先面板从面缘 1.0035 拱到格心 1.0155
         (拱高 0.012), flatShading 下每个三角面法线不同 → logo 圆盘上出现
         明显的放射状折痕/中间鼓包。压平到 0.0025 拱高后:
         面板视觉上是平的镜面, logo 不再"顶起来", 折痕消失;
         3D 立体感由外壳唇边(R_CREST)+ 侧壁(R_WALL)继续提供。 */
      const R_FACE_C = RV * 1.0060;   /* 格心(仅微拱, 避免折痕) */
      const R_FACE_E = RV * 1.0035;   /* 面缘 */
      /* v150(作者: 去边框) —— 唇边(R_CREST 原比面缘高 0.010)正是每格那圈"边框"
         的几何来源。压平到与面缘同高 → 格与格之间只剩细缝, 没有凸起描边。 */
      const R_CREST  = R_FACE_E;      /* 外壳顶 = 面缘(去唇边) */
      const R_WALL   = RT;            /* 侧壁底 */

      for(let i=0;i<N;i++){
        const cell = hd.cells[i];
        const m = cell.length;
        if(m < 3) continue;
        if(m === 6) hexN++; else pentN++;

        const nrm = _v3a.set(0,0,0);
        for(let k=0;k<m;k++) nrm.add(_v(cell[k]));
        nrm.normalize();

        const h1 = _hash(nrm.x*3.1, nrm.y*3.1, nrm.z*3.1);
        const h2 = _hash2(nrm.x*5.7+1.3, nrm.y*5.7+1.3, nrm.z*5.7+1.3);

        /* ── v148c(作者: 不要俯瞰, 大的要面对我, 球向右转) ──
           两面 = 前/后两个半球, 以 ±Z 轴为面心。
             ±Z 与自转轴 Y **垂直** → 球向右自转时, 两面会轮流转到镜头正面,
             每转 180° 就有一整面「由中心最大向四周递减」的大块正对着你;
             而北极/南极永远只是普通格, 不会出现俯瞰感。
           dNorm 用 pow 0.80 缓入 → 面心一大片都是大块(「大的集中一些」),
           只在接近面缘(赤道大圈)时才收碎。
           faceId: 0=前半面, 1=后半面 —— 后续两面可各自挂一组数据。 */
        const dFace = Math.abs(nrm.z);              /* 0=面缘, 1=面心 */
        const dNorm = Math.pow(dFace, 0.80);
        dirArr[i*3] = nrm.x; dirArr[i*3+1] = nrm.y; dirArr[i*3+2] = nrm.z;
        faceArr[i] = nrm.z >= 0 ? 0 : 1;
        /* 面内权重: 1=面心, 0=面缘 —— 后续涨跌幅映射直接乘这个 */
        faceWArr[i] = dNorm;

        /* ── v149i(作者: 间隔框一致粗细 / 只有六边形大小不一) ──
           旧做法: 面板内缩 = ang*inFace, 而 inFace 随 gapK(面心→面缘)在
                   0.006~0.34 之间大幅变化 → 小格的内缩占比大、框粗, 大格框细。
           新做法: 内缩量改成「恒定角量」——
             ① 面板边: 从本格边界再往里收 IN_PANEL(=0.012 rad ≈ 恒定弧长)
             ② 外壳/侧壁: 基本贴着本格边界(IN_EDGE≈0.0016)
           相邻两格各收 IN_PANEL → 它们之间的可见缝隙处处 = 2*IN_PANEL,
           与格子大小无关 → 框宽恒定。
           格子尺寸差异改由几何 warp 提供(面心格比面缘格大 4 倍),
           于是「大小不一 + 框宽一致」两者同时成立。 */
        /* v149l(作者: 形状要规整 / 间隔框一致粗细 / 只有六边形大小不一) ——
           几何已回归规整(f=10 均匀, 内角偏差仅 2°), 大小差异改由「面板(logo 盘)」
           承载, 六边形网格本身保持规整、缝宽恒定:
             · inEdge 恒定 → 相邻格各收同样多 → 可见缝宽处处相等(框一致) ✅
             · inFace 随面心权重变化(面心 0.0065 → 面缘 0.0275) →
               面心格的 logo 盘几乎顶满, 面缘格的小一圈, 直径差约 1.9 倍
               → 有大小层次, 但不动网格骨架(形状规整) ✅ */
        const IN_EDGE = 0.0035;
        const inFace = 0.0065 + (1.0 - dNorm) * 0.0210;
        const inEdge = IN_EDGE;
        /* 兼容旧字段: sizeArr 记「等效尺寸比」供排序/调试 */
        sizeArr[i] = 1.0;

        /* 海陆(earth_map.png 面积加权) */
        const w = water ? Math.max(0, Math.min(1, water[i])) : (h1 > 0.5 ? 0 : 1);
        const landF = 1.0 - w;
        let tR,tG,tB;
        if(landF > 0.5){
          /* v155(作者: 没有 logo 的地方全透明) —— 空格不再用海陆彩色底,
             全部压到接近黑的一点点冷调: 这样才能靠 alpha 做「全透明」,
             彩色底会给透明玻璃染上一层灰 (旧值 0.118/0.024 就是"灰蒙蒙"的主因) */
          col.setHSL(0.560, 0.14, 0.030 + h1*0.020);
        } else {
          col.setHSL(0.610, 0.16, 0.022 + h1*0.018);
        }
        /* 尺寸 → 亮度联动(弱化, 不再靠彩色区分格子) */
        const szLift = dNorm * 0.010;
        tR = Math.min(1, col.r + szLift); tG = Math.min(1, col.g + szLift); tB = Math.min(1, col.b + szLift);

        /* 外壳色(v155): 同样压到极淡(透明玻璃的边, 不靠颜色区分海陆) */
        if(landF > 0.5) col.setHSL(0.560, 0.10, 0.055 + h2*0.030);
        else            col.setHSL(0.610, 0.12, 0.045 + h2*0.025);
        const cR = col.r, cG = col.g, cB = col.b;
        /* v157(作者: 看不出厚度与质感) —— 旧侧壁色几乎是黑(w = t*0.10+0.004),
           砖再厚也看不出来。改成可读的冷钢/冰玻璃色: 侧壁是「玻璃的切口」,
           它一亮, 每块砖就有实体厚度。亮度随格高微抖, 不呆板。 */
        const wR = 0.058 + h2*0.030, wG = 0.092 + h2*0.040, wB = 0.148 + h2*0.058;

        /* 顶点: 心 / 面缘环 / 外壳环 / 侧壁底环 */
        const ct = nrm.clone().multiplyScalar(R_FACE_C);
        const fe = [], cr = [], wb = [];
        for(let k=0;k<m;k++){
          const p = _v(cell[k]);
          const ang = Math.acos(Math.max(-1, Math.min(1, p.dot(nrm))));
          const dir = _v3b.subVectors(nrm, p); const dl = dir.length() || 1;
          dir.multiplyScalar(1/dl);
          /* v149i: 内缩用恒定角量(不再乘 ang/占比) → 每个格从自己的边界
             往里收同样多 → 相邻格之间缝隙宽度处处相等。小格(半径 0.024)
             收 0.012 后仍留一半以上面积, 不会被吃光。 */
          const shP = Math.min(inFace, ang*0.62);   /* 安全上限: 不超格半径 62% */
          const shE = Math.min(inEdge, ang*0.20);
          fe.push(p.clone().addScaledVector(dir, shP).normalize().multiplyScalar(R_FACE_E));
          cr.push(p.clone().addScaledVector(dir, shE).normalize().multiplyScalar(R_CREST));
          wb.push(p.clone().addScaledVector(dir, shE).normalize().multiplyScalar(R_WALL));
        }
        /* v149: 本格切平面基(east/north) + 逐顶点局部 2D 坐标
           —— 六边形内任一点用 (rr·cosφ, rr·sinφ) 表达, logo 采样即在此平面上做 */
        _mTile = -1.0; _mChg = 0.0; _mCell = i;      /* 默认本格不放币, 行情到达后回填 */
        _mCNx = nrm.x; _mCNy = nrm.y; _mCNz = nrm.z;
        const _bE = new THREE.Vector3(), _bN = new THREE.Vector3();
        const _up = (Math.abs(nrm.y) > 0.92) ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
        _bE.crossVectors(_up, nrm).normalize();
        _bN.crossVectors(nrm, _bE).normalize();
        let _maxA = 1e-6;
        const _pA = new Array(m);
        for(let k=0;k<m;k++){
          const _p = _v(cell[k]);
          const _a = Math.acos(Math.max(-1, Math.min(1, _p.dot(nrm))));
          _pA[k] = _a; if(_a > _maxA) _maxA = _a;
        }
        /* 面缘(面板外沿) = 角距 ang*(1-inFace) → 归一化 rr=ang/maxA;
           外壳/侧壁       = 角距 ang*(1-inEdge) → rr 按同一把尺子折算 */
        /* v149i: aUV 与上面的恒定内缩同口径 —— 面板边在 rr=(A-Δ)/A,
           外壳边在 rr=(A-ε)/A。这样 logo 圆盘与「同心光圈」的半径关系
           与格子大小无关, 视觉上每个格都一样。 */
        const uvFE = new Array(m), uvCE = new Array(m);
        for(let k=0;k<m;k++){
          const _p = _v(cell[k]);
          const _de = _p.dot(_bE), _dn = _p.dot(_bN);
          const _w = Math.sqrt(_de*_de + _dn*_dn) || 1e-9;
          const _a = Math.max(1e-6, _pA[k]);
          const _shP = Math.min(inFace, _a*0.62);
          const _shE = Math.min(inEdge, _a*0.20);
          const _rP = (_a - _shP) / _maxA;
          const _rE = (_a - _shE) / _maxA;
          uvFE[k] = { x:_rP*_de/_w, y:_rP*_dn/_w };
          uvCE[k] = { x:_rE*_de/_w, y:_rE*_dn/_w };
        }
        for(let k=0;k<m;k++){
          const k2 = (k+1)%m;
          /* ① 面板(海陆底色) —— 主体 (aPanel=1: logo 只贴在这一层) */
          _mPanel = 1;
          _tri(ct, fe[k], fe[k2], tR,tG,tB, 0,1,1, _Z0, uvFE[k], uvFE[k2]);
          _mPanel = 0;
          /* ② 外壳环(亮边) —— ★ 光圈只画这一圈(zA=1 → zB/zC=2) */
          _tri(fe[k], cr[k], cr[k2], cR,cG,cB, 1,2,2, uvFE[k], uvCE[k], uvCE[k2]);
          _tri(fe[k], cr[k2], fe[k2], cR,cG,cB, 1,2,1, uvFE[k], uvCE[k2], uvFE[k2]);
          /* ③ 侧壁(厚度) */
          _tri(cr[k], wb[k], wb[k2], wR,wG,wB, 2,3,3, uvCE[k], uvCE[k], uvCE[k2]);
          _tri(cr[k], wb[k2], cr[k2], wR,wG,wB, 2,3,2, uvCE[k], uvCE[k2], uvCE[k2]);
        }
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(POS, 3));
      g.setAttribute('normal',   new THREE.Float32BufferAttribute(NRM, 3));
      g.setAttribute('color',    new THREE.Float32BufferAttribute(COL, 3));
      /* v149: 币种层逐顶点属性 */
      g.setAttribute('aUV',   new THREE.Float32BufferAttribute(UVARR, 2));
      g.setAttribute('aTile', new THREE.Float32BufferAttribute(TILEARR, 1));
      g.setAttribute('aChg',  new THREE.Float32BufferAttribute(CHGARR, 1));
      g.setAttribute('aCell', new THREE.Float32BufferAttribute(CELLARR, 1));
      g.setAttribute('aZone', new THREE.Float32BufferAttribute(ZONEARR, 1));
      g.setAttribute('aCN',   new THREE.Float32BufferAttribute(CNARR, 3));
      g.setAttribute('aPanel',new THREE.Float32BufferAttribute(PANARR, 1));
      /* v149b(作者: 压低高光整体效果) —— 金属镜面反射是"整体发亮/油光"的主因:
         metalness 0.44→0.16(去金属反射) · roughness 0.60→0.82(粗糙散射)
         envMapIntensity 0.38→0.13(几乎不吃环境反射) → 哑光质感, 高光收掉 */
      /* v149d(作者: 整体压暗 科幻深色金属感) ——
         color 给冷钢 tint(乘在顶点色上 → 顺带整体压暗 ≈30%),
         metalness 0.16→0.46 / roughness 0.82→0.56 找回「金属」,
         但 envMapIntensity 仍压在 0.20 → 有金属反光而不泛白高光。 */
      /* v149j(作者: 玻璃水晶质感) ——
         MeshPhysicalMaterial + clearcoat 是「水晶」最省的做法:
           roughness 0.16(细腻镜面) · metalness 0.0(非金属→不吸光发灰)
           clearcoat 1.0 / clearcoatRoughness 0.06(表面一层硬壳清漆 = 水晶表层)
           envMapIntensity 1.25(吃环境反射 → 有玻璃的通透反光, 不是死黑)
         flatShading 保留: 每个小面各自反光 → 像多面切割的水晶棱面。
         仍不新增 draw call。 */
      /* v150(作者: 透明度拉高 别太厚 现在灰蒙蒙一片 + 去边框) ——
         · transparent + 着色器写 diffuseColor.a(面板 0.20) → 玻璃通透
         · side 改 FrontSide: 背面半球的砖被剔除 → 不再透出第二层"灰纱"
         · depthWrite:false: 相邻砖交界不做深度写入, 缝里干净
         · envMapIntensity 2.10→1.15: 保玻璃反光, 不收成高光斑 */
      const mat = new THREE.MeshPhysicalMaterial({
        color:0xd8e0ea, vertexColors:true,
        /* v112(作者: 能量玻璃币 + 科幻金属融合) —— 纯玻璃偏"水", 纯金属会发死, 取 0.14。
           v124(作者: 玻璃与立体质感拉满) —— 再抬一档到 0.20 + 叠 iridescence(薄瞑干涉),
           真玻璃的"色散"感(掠射时透出淡淡的青/紫), 质感更实。 */
        /* v126b(作者: 玻璃还是有点磨砂) —— ★关键发现: three.js 是 **r128**,
           而 `iridescence` / `iridescenceIOR` / `iridescenceThicknessRange`
           是 r132+ 才有的属性 → 从 v124 加进来起就是**静默失效的死参数**
           (控制台 3 条 "is not a property of this material" 警告可证)。
           之前按它"调质感"等于调了个空气。现按 r128 真实能力重配:
             · iridescence 全删  → 消除 3 条控制台警告 + 去掉无效配置干扰
             · metalness 0.06    → 玻璃非金属, 否则反射发灰
             · ior 1.52          → 真实玻璃折射率(空气1.0/水1.33/玻璃≈1.5)
             · reflectivity 0.5  → 保留菲涅尔反射(掠射亮、正视透 = 玻璃的灵魂)
             · clearcoat 0.55    → 一层薄清漆, 不糊成奶白壳
           roughness 极低(0.045) + 切边菲涅尔 → 干净通透的薄玻璃。 */
        /* v128(作者: 玻璃币质感加强 · 亮高光而不是哑光) —— 仍只用 r128 真支持的属性
           (iridescence/specularIntensity 是 r132 死参数, v126b 已踩过坑):
             · envMapIntensity 1.30→2.10  吃环境反射 → 真·亮高光(哑光主因就是它低)
             · clearcoat 0.55→1.00 + clearcoatRoughness 0.030→0.016 → 硬壳镜面热点
             · roughness 0.045→0.028 反射更锐 · metalness 0.06→0.16 微金属增反
             · reflectivity 0.5→0.62 掠射菲涅尔更亮(玻璃的灵魂) */
        /* v128.2(作者: 玻璃质感拉满·综合一体) —— 拉满但仍只用 r128 真属性:
           roughness 0.028→0.018(更镜) · envMapIntensity 2.10→2.60(吃满升级后的env)
           reflectivity 0.62→0.70(掠射更亮) · clearcoatRoughness 0.016→0.006(清漆热点更锐) */
        /* v-fix(2026-09-26 作者: 玻璃币太亮 logo 曝光看不清) —— 高光收敛, 保留玻璃感:
           envMapIntensity 2.60→1.45(环境反射减半) · reflectivity 0.70→0.55(降菲涅尔白边)
           roughness 0.018→0.030(镜面热点略柔) · clearcoat 0.006→0.020(清漆热点变软)
           目的: 拿走「镜面白斑」, 让每格的 logo 恢复本色可读, 而不是被高光冲白。 */
        /* v253-rollback(2026-09-30): 蓝图高光直方图实测证明收 clearcoat 反而过曝
           (过曝像素 11695→22080, +88.8%) —— 去掉清漆层⇒底层 roughness 0.030/metalness 0.16
           裸奔, 在更大角度撒高光。现回滚到 v-fix(09-26) 验证过的参数。
           白斑真因仍待定, 下一轮改用【冻结同帧 + 单变量】法定位。 */
        metalness:0.16, roughness:0.030, envMapIntensity:1.45,
        ior:1.52, reflectivity:0.55,
        clearcoat:1.0, clearcoatRoughness:0.020,
        flatShading:true, side:THREE.FrontSide,
        transparent:true, depthWrite:false
      });
      if(envTex) mat.envMap = envTex;
      /* ══ v149(作者: 所有币种 logo 贴进六边形 / 涨绿跌红细光圈 / 悬浮浮空) ══
         在标准材质上注入三件事(不新增一层, 不新增 draw call):
           ① 面板: 按 aUV 采样图集 → 格心贴币 logo(圆形软边), 不放币的格保持海陆底色
           ② 外壳: 只在外壳那一圈(aZone 1→2)按 aChg 上色 —— 涨=绿光 / 跌=红光,
                   极细一圈(用 zZone 宽度归一化), 不糊满整格
           ③ 悬浮: uHover 命中格号 → 该格沿法线抬起 + 轻微提亮(浮空感)
         图集: 32x32 格 / 每格 64px, 纹理已 flipY=false → 行序与 sym2idx 一致 */
      mat.userData.hex = true;
      mat.onBeforeCompile = function(sh){
        mat.userData.sh = sh;
        sh.uniforms.uAtlas   = { value: _hexAtlasTex };
        sh.uniforms.uCols    = { value: (_hexAtlasCfg.cols || 32) };
        sh.uniforms.uRows    = { value: (_hexAtlasCfg.rows || 32) };
        sh.uniforms.uCellPx  = { value: 1.0 / (_hexAtlasCfg.cell || 64) };
        sh.uniforms.uHover   = { value: -1.0 };
        sh.uniforms.uHoverK  = { value: 0.0 };
        sh.uniforms.uLift    = { value: 0.030 };
        sh.uniforms.uTime    = { value: 0.0 };
        /* v156(作者: 音乐律动) —— uMusic = 低频能量 0..1, uBeat = 节拍冲击 0..1 */
        sh.uniforms.uMusic   = { value: 0.0 };
        sh.uniforms.uBeat    = { value: 0.0 };
        /* v161(2026-09-29 作者: 玻璃币活起来) —— 常驻律动强度 / 入场汇聚进度
           (由 主模块 末尾的 #hex-alive 驱动器写入, 与音乐互不干扰) */
        sh.uniforms.uAlive   = { value: 0.0 };
        sh.uniforms.uForm    = { value: 0.0 };
        sh.uniforms.uScatter = { value: 0.0 };   /* v258: 散开量(1=满天星空, 0=聚成球) */
        /* v152(玻璃可调) —— 作者可随时拧这几个旋钮(控制台):
           __hexGlass(a面板透明度, b侧壁/外壳, dia logo直径比例, bandA光圈不透明度, bandW光圈宽度)
           例: __hexGlass(0.05, 0.25, 0.46) → 更透 + logo 更小 */
        /* v159(2026-09-26 作者: 六边形看不清形状 → 改良) ——
           v158 把面板 0.098→0.022、侧壁 0.150→0.045、白光边全关、补光 0.42→0.14、
           并把缝中桁架默认关闭 → 六边形**所有形状线索同时归零**, 整球糊成一片光滑壳,
           只剩 logo 可读、格子边界彻底消失。
           修法: 面板/侧壁抬回「能看见一片片玻璃」的水位(仍属通透, 不是厚壳),
           并恢复每格切边亮线(rim) —— 亮线是六边形轮廓的主载体。 */
        sh.uniforms.uGlassA  = { value: 0.085 };   /* v159: 0.022→0.085 面板可见但不浑(dia 0.58 处仍透) */
        sh.uniforms.uSideA   = { value: 0.150 };   /* v159: 0.045→0.150 侧壁=玻璃切口, 让每片有边界 */
        sh.uniforms.uDia     = { value: 0.58 };   /* v130(作者: 币图不能放大 变形了): 0.62→0.58 退回原尺寸 */
        sh.uniforms.uBandA   = { value: 0.52 };   /* v129(作者: 光圈一段段): 0.72→0.52 降晕 */
        sh.uniforms.uBandW   = { value: 0.20 };
        /* v124(作者: 动态颜色多变, 但不要太花里胡哨, 根据市场情绪波动变幻) ——
           情绪色由全局 __hexMood(regime) 写入, 逐帧平滑过渡(不跳变)。
           uMood 作用于「侧壁切口自发光 + 涨跌光圈」的色调; 中性值 = 不改变原色。 */
        sh.uniforms.uMood    = { value: new THREE.Color(1.0, 1.0, 1.0) };
        sh.uniforms.uMoodK   = { value: 0.0 };
        sh.vertexShader = 'attribute vec2 aUV;\nattribute float aTile;\nattribute float aChg;\n'
          + 'attribute float aCell;\nattribute float aZone;\nattribute vec3 aCN;\n'
          + 'attribute float aPanel;\n'
          + 'uniform float uHover;\nuniform float uHoverK;\nuniform float uLift;\nuniform float uTime;\n'
          + 'uniform float uMusic;\nuniform float uBeat;\n'
          + 'uniform float uAlive;\nuniform float uForm;\nuniform float uScatter;\n'
          + 'varying vec2 vUV2;\nvarying float vZone;\nvarying float vTile;\nvarying float vChg;\n'
          + 'varying float vHov;\nvarying float vPanel;\nvarying float vFace;\n'
          + sh.vertexShader
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>\n'
            + '  vUV2 = aUV; vZone = aZone; vTile = aTile; vChg = aChg; vPanel = aPanel;\n'
            + '  vHov = (abs(aCell - uHover) < 0.5) ? 1.0 : 0.0;\n'
            /* v154(作者: 积雾/太厚) —— 球缘那圈"糊"是边缘的格几乎侧对镜头,
               几百个半透玻璃叠在一起 alpha 饱和了。把「本格正对相机的程度」
               传给片元 → 越侧视越淡 ⇒ 球缘不再堆出一圈亮雾。
               必须用未抬起的 position 算朝向(用 transformed 会让悬浮格自己变淡)。 */
            + '  vec3 _cnv = normalize(mat3(modelViewMatrix) * aCN);\n'
            + '  vec3 _vpv = (modelViewMatrix * vec4(position, 1.0)).xyz;\n'
            + '  vFace = clamp(dot(_cnv, normalize(-_vpv)), 0.0, 1.0);\n'
            /* 悬浮: 整格沿自身法线抬起 —— 六边形一起走, 不会撕开 */
            + '  transformed += aCN * (uHoverK * vHov * uLift);\n'
            /* ══ v156(作者: 所有币种随音乐律动自己浮空) ══
               低频(uMusic)决定「整颗球一起呼吸」, 节拍(uBeat)给每格一个
               带随机相位的冲击 → 像声波一圈圈扫过。只有放了币的格参与
               (空格全透明, 跟着动会看到空壳在抖)。 */
            + '  float mk = step(-0.5, aTile);\n'
            + '  float ph = fract(sin(aCell*12.9898)*43758.5453) * 6.2831;\n'
            + '  float wob = sin(uTime*2.1 + ph) * 0.5 + 0.5;\n'
            /* ══ v161(2026-09-29 作者: 玻璃币太死板, 要活起来) ══
               常驻微律动(不依赖音乐): 每格按自身相位慢速漂浮 + 呼吸,
               → 整片壳像活的鳞甲在轻轻起伏, 而不是焊死的死壳。
               amp 在着色器内自动让位给音乐(放歌时淡出, 避免叠加过火)。 */
            + '  float wave = sin(uTime*1.05 - (aCN.y*3.5 + aCN.z*2.0) + ph*0.6) * 0.5 + 0.5;\n'
            + '  float ambK = uAlive * (1.0 - clamp(uMusic*2.5 + uBeat*1.2, 0.0, 1.0));\n'
            + '  transformed += aCN * mk * ambK * (0.012 + 0.030 * wave);\n'
            /* 音乐律动(原逻辑) */
            + '  transformed += aCN * mk * (uMusic * 0.012 + uBeat * wob * 0.030);\n'
            /* 入场汇聚: 币自外层飞入就位(uForm 0→1, 每格错落) */
            + '  transformed += aCN * mk * (1.0 - uForm) * (0.10 + 0.16 * fract(sin(aCell*7.31)*24634.63));'
            /* ══ v258(作者 2026-10-05: 「散是满天星空·聚是数字化地球」) ══
               uScatter=1 → 每格按伪随机方向散开成星空云(对相机 +Z 偏置) ·
               uScatter=0 → 聚回球面(即现成的玻璃币球)。仅顶点位移, 不新增 draw call。 */
            + '  float _h1 = fract(sin(aCell*12.9898)*43758.5453);'
            + '  float _h2 = fract(sin(aCell*78.233)*12345.6789);'
            + '  float _h3 = fract(sin(aCell*37.719)*24634.6345);'
            + '  vec3 _rnd = vec3(_h1,_h2,_h3)*2.0 - 1.0;'
            + '  transformed += mk * uScatter * (_rnd * 1.5 + vec3(0.0, 0.0, 0.75));')
          .replace('#include <color_fragment>', '#include <color_fragment>');
        sh.fragmentShader = 'uniform sampler2D uAtlas;\nuniform float uCols;\nuniform float uRows;\n'
          + 'uniform float uCellPx;\nuniform float uHover;\nuniform float uHoverK;\nuniform float uTime;\n'
          + 'uniform float uGlassA;\nuniform float uSideA;\nuniform float uDia;\n'
          + 'uniform float uBandA;\nuniform float uBandW;\n'
          + 'uniform vec3 uMood;\nuniform float uMoodK;\n'
          + 'varying vec2 vUV2;\nvarying float vZone;\nvarying float vTile;\nvarying float vChg;\n'
          + 'varying float vHov;\nvarying float vPanel;\nvarying float vFace;\n'
          + sh.fragmentShader
          .replace('#include <color_fragment>',
            '#include <color_fragment>\n'
            + '  float faceW = smoothstep(0.38, 0.80, vFace);\n'   /* v126d: 0.30/0.72→0.38/0.80 球缘淡出更早 */
            + '  float rrF = length(vUV2);\n'
            + '  float rim = smoothstep(uDia*0.978, uDia*0.978 + 0.032, rrF)\n'
            + '            * (1.0 - smoothstep(uDia*1.030, uDia*1.030 + 0.055, rrF));\n'
            /* v130: 断环主因是下方 hasLogo 门控越格采样(非宽度); 此处加宽 0.012→0.032
               容忍 vUV2 线性插值误差, 环再无微断 */
            + '  float hasTile = step(-0.5, vTile);\n'
            /* v157(作者: 看不出厚度与质感) ——
               faceW(掠射变淡 v154 加的, 治球缘积雾)原本一体适用于「面板+外壳+侧壁」。
               但球缘处侧壁恰恰是正对镜头的那一面, 被 faceW 压掉 → 厚度直接抹平。
               现拆开: 面板/外壳继续吃 faceW(治积雾), **侧壁不吃** → 球缘能看见砖的厚度。
               wallF: vZone 2→3 是侧壁段, 1→2 是外壳段。 */
            + '  float wallF = smoothstep(2.05, 2.95, vZone);\n'
            + '  float faceDim = mix(mix(0.045, 1.0, faceW), 1.0, wallF);\n'   /* v126d: 下限 0.10→0.045 球缘砖近乎隐去 */
            + '  float baseA = (vPanel > 0.5) ? uGlassA : uSideA;   /* v128.7(作者: 空白格不是删除): 恢复可见(普通玻璃格), 由挑格移到底极藏起 */\n'
            + '  diffuseColor.a = baseA * faceDim;\n'
            /* v124(作者: 整体冒蓝光 + 光根据市场情绪波动变幻) ——
               ① 把情绪色调**也**作用于玻璃面(原先只作用于厚边) → 换市态时整颗球能看出变色;
               ② 强度克制(×0.45), 不抢 logo 本身颜色, 不花里胡哨。 */
            + '  vec3 faceMood = mix(vec3(1.0), uMood, clamp(uMoodK, 0.0, 1.0) * 0.45);\n'
            + '  diffuseColor.rgb *= faceMood;\n'
            + '  float hasLogo = 0.0;   /* v128.6(作者: 无logo空白格): 本格真有logo像素才画托底/切边白圈 */\n'
            + '  if(vTile >= 0.0 && vPanel > 0.5){\n'
            /* 图集 UV: vUV2 是「面板半径归一化」坐标(0=格心, ≈1=六边形顶点)。
               ① 每格在图中占 1/uCols × 1/uRows; 图集(v2)已归一化: 每个 logo 按 bbox 裁切→
                  等比缩至 90% 占比→居中, 即四周内容边距恰为 5%(=(1-0.90)/2)。
                  故采样内缩须取 5%: 6.4/128=0.05 (uCellPx=1/cell)。
                  ※ 2026-10-05 校正: 原写 4px 内缩(旧 64px 格口径=6.25%; 128px 格下只剩 3.125%)
                    → 窗口比图集内容大 ~4% → logo 被放大且贴边不齐。改 6.4 与图集精确对齐。
               ② logo 半径取 0.52 面板半径(六边形内切圆 0.866) → 币图铺满格内,
                  四周留一圈底色, 不会顶到格边。 */
            + '    vec2 cellUvSize = vec2(1.0/uCols, 1.0/uRows);\n'
            + '    vec2 cellUv = vec2(mod(vTile, uCols), floor(vTile / uCols));\n'
            + '    vec2 inset = cellUvSize * (6.4 * uCellPx);   /* 2026-10-05: 5% (6.4/128) 精确匹配归一化图集 */\n'
            + '    vec2 spanUv = cellUvSize - inset*2.0;\n'
            + '    float dia = uDia;\n'
            + '    vec2 t = vUV2 / dia;\n'
            + '    float rr2 = length(t);\n'
            /* v149f(作者: 注意 logo 方向别反了倒了) —— 朝向推导:
               本格切向基 _bE=up×nrm / _bN=nrm×_bE, 对正面格得 _bE=+X(屏幕右)、
               _bN=+Y(屏幕上) ⇒ aUV.y 向「屏幕上方」增大。
               而图集按 PIL 自上而下逐行写入, 纹理 flipY=false ⇒ v 小 = 图集顶行 = 图标顶部。
               若直接 (t*0.5+0.5) 映射: 屏幕上→v 大→取到图标下半 ⇒ 整片 logo 上下倒置。
               故 V 取反: 屏幕上 → v 小 → 取图标顶部。U 无需取反(已对齐, 不镜像)。 */
            + '    vec2 tS = vec2(t.x, -t.y);\n'
            + '    vec2 uv = cellUv*cellUvSize + inset + (tS*0.5 + 0.5)*spanUv;\n'
            + '    vec4 lg = texture2D(uAtlas, uv);\n'
            /* v130(作者: logo外圈红绿圈一段段断了) —— ★真凶:
               旧 hasLogo 直接拿本片段 lg.a 门控, 而光环半径(rr2≈1.0~1.1)已超出本格
               图集裁剪区 → 采到邻格像素/格缝透明区 → 门控随角度时开时断 → 环被切虚线。
               改「圆心探针」: 采样点夹回 logo 圆心附近(≤0.3半径)判有无币 → 整格恒定。 */
            + '    vec2 tC = t * min(1.0, 0.30 / max(length(t), 1e-4));\n'
            + '    vec2 tSC = vec2(tC.x, -tC.y);\n'
            + '    vec4 lgC = texture2D(uAtlas, cellUv*cellUvSize + inset + (tSC*0.5 + 0.5)*spanUv);\n'
            + '    hasLogo = step(0.02, lgC.a);\n'
            + '    float mask = (1.0 - smoothstep(0.955, 1.0, rr2)) * lg.a;   /* v128.6: 0.90→0.955 圆形遮罩更锐 */\n'
            /* ① 底色: logo 只贴色, 亮度跟随所在格的明暗(不额外提亮) */
            + '    float logoHalo = step(1.04, rr2) * (1.0 - smoothstep(1.04, 1.46, rr2)) * hasLogo;\n'
            + '    diffuseColor.rgb *= mix(1.0, 0.70, logoHalo);   /* v130: 0.78→0.70 衬环微加深(提可读性, 不靠提亮) */\n'
            + '    diffuseColor.rgb = mix(diffuseColor.rgb, min(lg.rgb*1.10, vec3(1.0)), clamp(mask*1.0, 0.0, 1.0));   /* v254(2026-09-30 白斑A/B实测) 1.06→0.86 不再把纯白logo削顶到255 */\n'
            + '    diffuseColor.a = mix(diffuseColor.a, (lg.a > 0.02 ? 0.88 : diffuseColor.a), mask);   /* v254(2026-09-30 白斑真因) 1.00→0.72: 满不透明度让相邻白logo糊成白斑 */\n'
            /* v149c(作者: logo 本身不发光) —— 原先给 logo 加了 0.34 自发光,
               夜间/暗面会自己"亮起来", 像贴纸浮在球面上, 影响观感。
               现完全去掉: logo 完全是哑光贴色, 与所在格一起受光/变暗。 */
            + '  }'
            /* ★ 外壳光圈(作者: 涨则绿光/跌则红光, 光很细就一圈)
               aZone: 面板0 → 面缘1 → 外壳顶2 → 侧壁底3
               band = sin(π(z-1)) 只在 z∈(1,2) 即「外壳那一圈」非零:
                 面板/侧壁恒 0, 外壳圈峰在 1.5 → 一条窄亮环, 不会糊满整格。
               无币格(aTile<0)不发光。 */
            /* v149j(玻璃水晶): 面板边缘的菲涅尔亮线 ——
               视线越掠射(格子边缘/球缘)越亮, 模拟水晶切边的高光。
               只加在 vPanel(面板层), 不影响外壳/侧壁。 */
            + '\n  if(vPanel > 0.5 && hasLogo > 0.5){   /* v128.6(作者: 空白格): 无logo不画托底/切边白圈 → 空白格彻底隐形 */\n'
            /* ══ v153(作者: 每一块圆润些 / 玻璃薄薄的一层 / 发光不能宽) ══
               ① 圆润: 面板按圆盘衰减收边(六边形棱角淡出) → 每块像圆润的玻璃鹅卵石,
                      不再是硬邦邦的六边形片
               ② 薄玻璃: 只剩极淡的一层通透底, 没有"厚壳/灰蒙蒙"感
               ③ 光圈: 只留紧贴 logo 的一圈细线(rr 宽 0.03~0.055) = 玻璃包边,
                      删掉原先的内圈+外圈+宽晕 → 不再有一圈粗光糊住格子 */
            + '    float roundMask = 1.0 - smoothstep(0.94, 1.01, rrF);   /* v128.6(作者: 棱角不够明显): 0.62/0.96圆润化→0.94/1.01 还原六边形锐角 */\n'
            /* v126d: 球缘光圈同样要淡 —— 它是纯白, 几百个叠起来就是那条白带 */
            + '    float wallDim2 = 0.25 + 0.75*faceW;\n'
            + '    diffuseColor.a *= roundMask;\n'
            /* v155: 薄玻璃托底 + 细包边 —— 有厚度感但不挡背后地球
               v124(作者: 整体冒蓝光) —— 托底/核心光原来是**蓝色**(0.17,0.29,0.42 / 0.30,0.42,0.56),
               这是“整颗球冒蓝光”的主源之一; 改为**中性银白** + 情绪色接管 → 不再冒蓝。 */
            + '    vec3 panelMood = mix(vec3(1.0), uMood, clamp(uMoodK, 0.0, 1.0));\n'
            + '    totalEmissiveRadiance += vec3(0.72,0.74,0.76) * panelMood * (roundMask * 0.0 * faceW);   /* v158(作者: 壳只要涨跌红绿光圈): 白色托底 0.045→0 关闭 */\n'
            + '    totalEmissiveRadiance += vec3(0.94,0.96,1.00) * panelMood * (rim * 0.0 * faceW);   /* v158: 白色切边高光 0.55→0 关闭(白光会雾), 光圈改由下方红绿带承担 */\n'
            + '    diffuseColor.a = max(diffuseColor.a, rim * uBandA * faceW * wallDim2);\n'
            + '    float core = 1.0 - smoothstep(0.0, uDia, rrF);\n'
            + '    totalEmissiveRadiance += vec3(0.74,0.76,0.78) * panelMood * (core * 0.0);   /* v158: 中心白芯 0.026→0 关闭 */\n'
            + '  }'
            /* ══ v157(作者: 看不出厚度与质感) —— 玻璃切口/厚边 ══
               侧壁就是每块砖的「玻璃切口」。给它一层冷青自发光:
               越靠格底(远离面板)越亮 → 像光在玻璃里向下折射沉淀,
               球缘那圈砖立刻有了「厚度」而不是一张纸片。
               只有放了币的格发光(空格按作者要求保持全透明)。 */
            + '\n  if(vPanel < 0.5 && wallF > 0.001 && vTile >= 0.0){\n'
            + '    float gw = 0.52 + 0.48*wallF;\n'
            /* v126c(作者: 磨砂/厚) —— ★球缘那条白带的真凶:
               v157 为"看得见厚度"刻意让侧壁**不吃 faceW**, 于是球缘几百块
               侧壁全亮 → 叠成一条白雾带(实测砖块关掉后左缘峰值 144→89)。
               现给侧壁加"部分"衰减: 掠射保留 30%(仍能看出厚度), 正视不受影响。 */
            + '    float wallDim = 0.30 + 0.70*faceW;\n'
            + '    vec3 wallMood = mix(vec3(1.0), uMood, clamp(uMoodK, 0.0, 1.0));\n'
            /* v112(作者: 看不出厚度与质感) —— 侧壁(玻璃切口)增强 0.22→0.34,
               并叠一丝能量青 → 厚度更明确。
               v124: 再乘情绪色调 wallMood → 整颗球的「玻璃厚度光」随市态变色。 */
            /* v124(作者: 整体冒蓝光 — 找到真凶了!) ——
               侧壁基底色原来是**强蓝** vec3(0.34,0.60,0.92) 与 vec3(0.52,0.88,1.00),
               这是“整颗球冒蓝光”的真正主源(面板/护盾都不是)。
               改为中性银白 → 不再冒蓝, 且情绪色才显出来(mood 乘上去才看得出来)。 */
            + '    totalEmissiveRadiance += vec3(0.76,0.79,0.83) * wallMood * (wallF * 0.18 * gw * wallDim);   /* v159(作者: 六边形看不清形状): 0→0.18 恢复腹壁切口微光——每一片的边界线 */\n'
            + '    totalEmissiveRadiance += vec3(0.92,0.94,0.97) * wallMood * (wallF * wallF * 0.08 * wallDim);   /* v159: 0→0.08 底层微光, 给边界一点厚度感 */\n'
            + '  }'
            /* ══ v159(2026-09-26 作者: 六边形看不清形状) ══
               最直接的修法: 给每个六边形的**真实边界**描一条冷调细线。
               几何上 vZone 0→1 是「面板」、1→2 是「外壳」、2→3 是「侧壁」,
               故 vZone≈1 就是「面板↔外壳」交界 = 每格的六边形轮郭。
               关键: 不再用 hasLogo/vPanel 门控 —— 全部格都描,
               否则没有 logo 的格依旧是无形状的黑块(旧版就卡在这里)。
               细、冷、克制(0.30), 只勾形状不做成金属网架。 */
            + '\n  {\n'
            + '    float edgeLine = smoothstep(0.86, 0.99, vZone) * (1.0 - smoothstep(1.01, 1.14, vZone));\n'
            + '    float edgeK = edgeLine * (0.30 + 0.70*faceW);\n'
            + '    totalEmissiveRadiance += vec3(0.58, 0.72, 0.92) * edgeK * 0.30;\n'
            + '    diffuseColor.a = max(diffuseColor.a, edgeK * 0.55);\n'
            + '  }'
            + '\n  if(vTile >= 0.0){\n'
            /* v149g: chg=-999 = 无行情哨兵(不过滤会被当"跌"且 mag 拉满 → 整格爆红) */
            + '    float hasD = step(-500.0, vChg);\n'
            + '    float up = step(0.0, vChg);\n'
            /* 颜色加饱和(作者: 光的颜色太淡) —— 用纯色而非灰调 */
            + '    vec3 gc = mix(vec3(1.00,0.16,0.32), vec3(0.00,1.00,0.62), up);\n'
            + '    gc = mix(vec3(0.46,0.52,0.60), gc, hasD);\n'
            + '    float mag = mix(0.45, clamp(abs(vChg)/5.0, 0.55, 1.0), hasD);\n'
            /* v153: 涨跌光束 = 上面那圈窄包边本身(同一根 rim) → 一定细, 不会糊满格 */
            + '    float band = (vPanel > 0.5) ? rim : 0.0;\n'
            + '    float pulse = 0.92 + 0.08*sin(uTime*2.4 + vTile*0.7);\n'
            + '    totalEmissiveRadiance += gc * (band * mag * pulse * (1.05 + 0.45*vHov));   /* v129: 1.55→1.05 光圈不再刺眼 */\n'
            + '    diffuseColor.a = max(diffuseColor.a, band * min(1.0, uBandA*1.5));\n'
            /* v128.7(作者: 不需要两道光圈) —— 删掉 v128.6 新增的外缘第二圈, 只留 logo 外围这一道(已加强) */
            + '  }');
      };
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;   /* v150: 玻璃砖在球心地球(不透明)之后混合 */
      mesh.userData = { n:N, hex:hexN, pent:pentN, kind:'hexsphere',
                        size:sizeArr, face:faceArr, faceW:faceWArr, dir:dirArr,
                        zone:ZONEARR, tile:TILEARR, chg:CHGARR, cell:CELLARR, uv:UVARR };

      /* ── 金属内壳: 半径略低于砖面 → 格与格之间露出的是金属面, 不是空洞 ── */
      const R_SHELL = RV * 0.9945;
      /* v149b(作者: 金属框改哑光深色) —— 内壳同走哑光深色, 不再镜面反光 */
      const shellMat = new THREE.MeshStandardMaterial({
        color:0x0e1726, metalness:0.58, roughness:0.36, envMapIntensity:0.52,   /* v124b: 反射 0.30→0.52 质感立起来 */
        emissive:0x070d1a, emissiveIntensity:0.14   /* v124b: 内壳自发光 0.10→0.14 */
      });
      if(envTex) shellMat.envMap = envTex;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(R_SHELL, 128, 80), shellMat);
      shell.frustumCulled = false;

      /* ── 缝中桁架(外壳下层): 沿每条缝走一道压深的冷钢槽 ──
         每条边只取一次 → 不重复不冲突。 */
      const eset = {}, FPOS = [], FNRM = [];
      const FW = 0.0042;
      const _fan = function(a,b,c,nx,ny,nz){
        FPOS.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
        FNRM.push(nx,ny,nz, nx,ny,nz, nx,ny,nz);
      };
      const _side = new THREE.Vector3(), _mid = new THREE.Vector3(), _dir = new THREE.Vector3();
      const R_TR = RV * 0.9985;
      for(let i=0;i<N;i++){
        const c = hd.cells[i], m = c.length;
        if(m < 3) continue;
        for(let k=0;k<m;k++){
          const u = c[k], w2 = c[(k+1)%m];
          const key = u < w2 ? (u+'_'+w2) : (w2+'_'+u);
          if(eset[key]) continue;
          eset[key] = 1;
          const p1 = _v(u).multiplyScalar(R_TR);
          const p2 = _v(w2).multiplyScalar(R_TR);
          _mid.copy(p1).add(p2).normalize();
          _dir.copy(p2).sub(p1).normalize();
          _side.crossVectors(_mid, _dir).normalize().multiplyScalar(FW);
          const a1 = p1.clone().add(_side), a2 = p1.clone().sub(_side);
          const b1 = p2.clone().add(_side), b2 = p2.clone().sub(_side);
          _fan(a1,a2,b2, _mid.x,_mid.y,_mid.z);
          _fan(a1,b2,b1, _mid.x,_mid.y,_mid.z);
        }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(FPOS, 3));
      fg.setAttribute('normal',   new THREE.Float32BufferAttribute(FNRM, 3));
      /* v149b(作者: 金属框改哑光深色) —— 原为亮蓝钢(0x7fb0d6 + 镜面 0.96),
         它正是球面那层"亮金属网"的来源。改为哑光深灰(0x232a33):
         metalness 0.96→0.10 · roughness 0.30→0.92 · envMapIntensity 0.80→0.06
         emissive 0x0f2740→0x070a0e / 0.60→0.12 → 暗色细缝, 只勾轮廓不抢高光 */
      const frameMat = new THREE.MeshStandardMaterial({
        color:0x232a33, metalness:0.10, roughness:0.92, envMapIntensity:0.06,
        emissive:0x070a0e, emissiveIntensity:0.12, side:THREE.DoubleSide
      });
      if(envTex) frameMat.envMap = envTex;
      const frame = new THREE.Mesh(fg, frameMat);
      frame.frustumCulled = false;

      /* ── 黑色星空背景(程序化, 零依赖) ── */
      const starGeo = new THREE.BufferGeometry();
      const SP = [], SC = [];
      const sr = function(seed){
        const x = Math.sin(seed*12.9898)*43758.5453; return x - Math.floor(x);
      };
      for(let i=0;i<1400;i++){
        const u = sr(i*1.7) * 2 - 1, th = sr(i*3.3+0.7) * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - u*u));
        const R = 42 + sr(i*5.1+1.9) * 26;
        SP.push(r*Math.cos(th)*R, u*R, r*Math.sin(th)*R);
        const b = 0.28 + sr(i*7.7+2.3) * 0.72;
        SC.push(b*0.82, b*0.90, b);
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
      starGeo.setAttribute('color',    new THREE.Float32BufferAttribute(SC, 3));
      const starMat = new THREE.PointsMaterial({
        size:0.30, sizeAttenuation:true, vertexColors:true,
        transparent:true, opacity:0.85, depthWrite:false
      });
      const starField = new THREE.Points(starGeo, starMat);
      starField.frustumCulled = false;

      const hexHemi = new THREE.HemisphereLight(0x4a7cb0, 0x04060c, 0.22);   // v159(作者: 六边形看不清形状): 0.14→0.22 给玻璃片一点体积受光(仍属低调补光)

      const hexGroup = new THREE.Group();
      hexGroup.scale.setScalar(0.86);   /* v130(作者: 整个玻璃球缩小, 里面的地球不要动) —— 0.94→0.86; 地球/大气在独立 group(非本组), 零改动 */
      hexGroup.add(hexHemi);
      /* v150(作者: 去边框 + 球心要露出来) —— 黑色内壳既是"灰蒙蒙"的大头,
         又把球心彻底挡死。默认不入场景; 对象保留, 需要时 __hexShell(true) 拉回。 */
      var _hexShellOn = false;
      window.__hexShell = function(on){
        var want = (on === undefined) ? !_hexShellOn : !!on;
        if(want === _hexShellOn) return _hexShellOn;
        _hexShellOn = want;
        if(want){ if(shell.parent !== hexGroup) hexGroup.add(shell); }
        else { hexGroup.remove(shell); }
        return _hexShellOn;
      };
      hexGroup.add(mesh);
      /* ══════════════════════════════════════════════════════════════
         v157(作者: 这些币种悬浮在外面看不出厚度与质感 / 最好有一点能量护盾的感觉)
         在玻璃球外层再包一层「能量护盾」—— 给整颗球一个明确的外壳边界,
         一眼看出「有壳、有厚度、有能量」, 而不是一堆贴片浮在空中。

         四项叠加(仍只多 1 个 mesh):
           ① 菲涅尔边缘辉光 —— 掠射最亮 ⇒ 球缘一圈能量壳; 正对镜头处 ≈ 0
              (关键: 中心必须几乎为零, 否则又把币洗成"灰蒙蒙")
           ② 缓慢流动的六边能量网格 —— 与币种六边形同构, 同一套语言
           ③ 自赤道向两极扫过的能量脉冲波
           ④ 音乐律动 —— uMusic 呼吸增亮 + uBeat 节拍闪击(与币种浮空同步)

         渲染: FrontSide + AdditiveBlending + depthWrite:false
           ⇒ 加法叠加发光, 不遮挡背后任何东西; renderOrder 3 在玻璃砖(2)之后
       */
      const shieldMat = new THREE.ShaderMaterial({
        uniforms:{
          uTime:{ value:0.0 }, uMusic:{ value:0.0 }, uBeat:{ value:0.0 },
          uShieldA:{ value:0.03 },   /* v158(2026-09-26 作者: 壳只要涨跌红绿光圈, 其余透明): 0.19→0.03 能量盾近乎隐去 */
          /* v124(作者: 整体冒蓝光 / 光做到极致且动态颜色多变, 根据市场情绪波动变幻) ——
             默认改为**中性银青**(不再是冷蓝) → 不再"整颗球冒蓝光";
             真实颜色由 __hexMood(regime) 按市态写入(uColA/uColB), 逐帧平滑过渡。 */
          uColA:{ value:new THREE.Color(0.30, 0.55, 1.00) },   /* v128.3 默认主色: 站点 accent 蓝 #8B7DFF(与UI同族) */
          uColB:{ value:new THREE.Color(0.37, 0.82, 1.00) },   /* v128.3 默认副色: 站点 energy 青 #8B7DFF */
          uPnlCol:{ value:new THREE.Color(0.42, 0.92, 0.62) }, /* v122: 账户盈亏染色 */
          uPnlAmt:{ value:0.0 }
        },
        vertexShader:[
          'varying vec3 vN; varying vec3 vNw; varying vec3 vP;',
          'void main(){',
          '  vN  = normalize(normalMatrix * normal);',
          '  vNw = normalize(mat3(modelMatrix) * normal);',
          '  vP  = normalize(position);',
          '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
          '}'
        ].join('\n'),
        fragmentShader:[
          'uniform float uTime, uMusic, uBeat, uShieldA, uPnlAmt;',
          'uniform vec3 uColA, uColB, uPnlCol;',
          'varying vec3 vN; varying vec3 vNw; varying vec3 vP;',
          'const vec2 HEXH = vec2(1.0, 1.7320508);',
          'vec2 _hexCell(vec2 p){',
          '  vec2 a = mod(p, HEXH) - HEXH*0.5;',
          '  vec2 b = mod(p - HEXH*0.5, HEXH) - HEXH*0.5;',
          '  return dot(a,a) < dot(b,b) ? a : b;',
          '}',
          'float _hexDist(vec2 p){',
          '  p = abs(p);',
          '  return max(p.x*0.8660254 + 0.5*p.y, p.y);',
          '}',
          'void main(){',
          '  vec3 N = normalize(vN);',
          '  vec3 V = vec3(0.0, 0.0, 1.0);',
          /* v112b: BackSide 下朝外的法线指向背离镜头一侧(dot<0),
             取 abs → 背盘中心 |dot|≈1 → fres≈0(不亮), 球缘 |dot|≈0 → fres≈1。
             若不取 abs, clamp(dot,0,1)=0 → 整个背半球全亮 = 大光球洗白币格。 */
          '  float ndv = abs(dot(N, V));',
          '  float inv = 1.0 - ndv;',
          '  float fres = pow(inv, 6.5);',   /* v126: 4.2→6.5 边缘光更薄更利落 */
          '  float lon = atan(vP.z, vP.x) / 6.2831853;',
          '  float lat = asin(clamp(vP.y, -1.0, 1.0)) / 3.1415927;',
          '  vec2 gp = vec2(lon*24.0 + uTime*0.022, lat*24.0 - uTime*0.007);',
          '  float hd = _hexDist(_hexCell(gp));',
          '  float grid = smoothstep(0.34, 0.50, hd) * 0.34;',
          '  float core = 1.0 - smoothstep(0.0, 0.30, hd);',
          '  float wave = sin(lat*9.4248 - uTime*0.72) * 0.5 + 0.5;',
          '  wave = pow(wave, 4.0);',
          /* v126(作者: 一点点科幻数字感) —— 极细的横向数据扫描线, 缓慢上移;
             只在护盾上, 幅度很小(0.13) → 像数据流拂过, 不抢戏。 */
          '  float scan = smoothstep(0.86, 1.0, sin((lat*128.0 - uTime*0.50)*3.14159)) * 0.22;',
          /* v126c(作者: 一点点科幻数字感) —— 极细的等纬"数据环", 缓慢切向流动;
             只 3 条主环 + 细刻度, 克制不张扬。 */
          '  float rings = smoothstep(0.93, 1.0, sin(lat*22.0*3.14159 + uTime*0.16)) * 0.30;',
          '  float ticks = step(0.965, sin((lon*180.0 + uTime*0.35)*3.14159)) * 0.10;',
          '  float rimW = pow(inv, 2.4);',   /* v126: 1.15→2.4 边缘光带收窄 */
          /* v126b(作者: 一点点科幻数字感) —— 六边能量网格是"数字感"的载体,
             从近乎隐形抬到可辨(0.13→0.30), 与扫描线一起构成护盾上的数据流纹理。 */
          '  float pat = (grid*0.30 + wave*0.15 + core*0.035 + scan + rings + ticks) * (0.09 + 0.91*rimW);',
          '  float live = 1.0 + uMusic*0.70 + uBeat*1.05;',
          /* v126d(逐层隔离实测): 护盾对球缘白带贡献 38/144。
             fres 指数拉到 6.5 后边缘已窄, 但 2.35 的系数又把亮度顶回去 →
             降到 1.35: 边缘剩一层"能看见但不刺"的薄能量壳。 */
          '  float amt = (fres*1.35 + pat) * live * uShieldA;',
          '  float sunF = 0.42 + 0.58*clamp(vNw.y*0.42 + 0.62, 0.0, 1.0);',
          /* v-fix(2026-09-26 作者: 去除网站地球能量盾的颜色) ——
             原:  vec3 c = mix(uColA, uColB, 情绪波) → 再混 uPnlCol(盈亏染色)
             ⇒ 护盾随市态(bull金/bear红/panic蓝…)与账户盈亏变色。
             现:  改为中性纯白 → 护盾只剩无色的能量亮壳, 不再有任何色相。
             注: 仅改护盾; 玻璃厚度光(mat uMood)与地球芯(uEarthMood)的颜色不受影响。 */
          '  vec3 c = vec3(1.0);',
          '  float a = clamp(amt*sunF, 0.0, 1.0);',
          '  gl_FragColor = vec4(c * a, a * 0.90);',
          '}'
        ].join('\n'),
        side: THREE.BackSide, blending: THREE.AdditiveBlending,
        transparent:true, depthWrite:false
      });
      /* v112b(自查): 改 BackSide + 半径 1.12 —— 护盾只在球体**背后/外缘**发光,
         不再以加法叠加在币格上把细节抹平(前一版球盘 std 49.3→40.3 = 洗白币格)。 */
      /* v126(作者: 能量罩不可能这么厚) —— ★真凶: 护盾球半径 1.12, 而币球面才 ≈1.00,
         中间空出 0.12 的间隙 → 球缘看到一圈"悬空厚壳"。注释里写 1.085 但代码没跟上。
         收到 1.045(仅比砖面高 0.045) ⇒ 能量罩贴着球面, 只剩最外缘一层薄光。
         v128.1(作者: 不是变薄, 是直径小一点离地球近一些): 1.045→1.025,
         **只改几何半径**(贴砖面间隙 0.045→0.025), 强度/透明度/着色器一律不动。 */
      /* v130(作者: 能量盾与玻璃应该同一图层, 不能在外或在内) ——
         砖面半径: 格心 R_FACE_C=1.0010 / 面缘 R_FACE_E=0.9985;
         旧盾 1.025 悬空 0.024 在玻璃**外面**看见一圈壳 → 收到 1.002:
         仅比格心高 0.001 ⇒ 盾光恰好贴在玻璃表面 = 同一层(不在外悬空, 也不埋进玻璃)。 */
      const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.002, 96, 64), shieldMat);
      shieldMesh.frustumCulled = false;
      shieldMesh.renderOrder = 3;    /* 玻璃砖(2)之后叠加 */
      window.__cgHexShield = shieldMesh;
      /* v157a(作者: 最外围是什么 怎么多了一层 不需要) ——
         护盾球(半径 1.15)是包在整颗球外面的「壳」, 作者要的是「币块自身有厚度质感」,
         不是外面再罩一层。默认**不加入场景**;
         对象仍保留, 需要时控制台 __cgHexShieldOn(true) 拉回 / (false) 拿掉。 */
      /* v112(作者: 最好有一点能量护盾的感觉) ——
         护盾球早已实现但默认关闭(v157a 作者曾说“怎么多了一层 不需要”)。
         当时问题是它太实(壳感重); 现改为**克制能量场**后重新开启:
           · 半径 1.15 → 1.085 (紧贴球体, 不再像“外套”)—— 已同步在下方几何
           · 菲涅尔指数 3.2 → 4.6 (只留最边缘一圈薄光, 正对镜头几乎为零)
           · 六边网格降为背景纹理(grid*0.62 → 0.30), 核心点拉弱(core 0.16 → 0.08)
           · 扫描波保留但变缓 → “场在缓慢流动”而非“闪烁”
         默认开启, 仍可用 __cgHexShieldOn(false) 拿掉 / __hexShield(0~2) 调强度 */
      var _hexShieldOn = true;
      /* v126 修复: 开关默认 true, 但此前**从未真正 add 进场景** → 护盾一直没显示,
         "默认开启"只是注释说法。按开关状态补上初始挂载。 */
      if(_hexShieldOn) hexGroup.add(shieldMesh);
      window.__cgHexShieldOn = function(on){
        var want = (on === undefined) ? !_hexShieldOn : !!on;
        if(want === _hexShieldOn) return _hexShieldOn;
        _hexShieldOn = want;
        if(want){ if(shieldMesh.parent !== hexGroup) hexGroup.add(shieldMesh); }
        else { hexGroup.remove(shieldMesh); }
        return _hexShieldOn;
      };
      /* 护盾旋钮: __hexShield() 读当前强度 / __hexShield(0~2) 设强度(0=不可见) */
      window.__hexShield = function(a){
        if(a === undefined) return shieldMat.uniforms.uShieldA.value;
        shieldMat.uniforms.uShieldA.value = Math.max(0, Math.min(2, Number(a)||0));
        return shieldMat.uniforms.uShieldA.value;
      };
      /* ══════════════════════════════════════════════════════════════════
         v124(作者: 整体冒蓝光 / 光做到极致且动态颜色多变, 但不要太花里胡哨,
               最好根据市场情绪波动变幻)
         情绪色系统 —— 按市态(regime)切换整颗球的「玻璃厚度光 + 能量护盾色」:
           牛市 bull     → 暖金 + 青绿芯   (向上、有热度但不刺眼)
           熊市 bear     → 铜红 + 暗金     (压住, 不刺红)
           震荡 range    → 中性钢银      (默认; 去掉满屏蓝)
           恐慌 panic    → 深靖蓝紫      (冷、暗、收)
           狂热 euphoria → 品红紫罗兰  (暖, 但不俗)
         全部走**低饱和 + 平滑过渡**(不跳变), 克制为主。
         调节: __hexMood('bull') / __hexMood() 读当前 / __mwHexMoodK(0~1) 色调权重
      ══════════════════════════════════════════════════════════════════ */
      var _HEX_MOOD = {
        /* v128.3(作者: 能量盾颜色改成与the site搭配) —— 五态全部收敛到站点设计令牌同族:
           品牌金 / 涨绿#00e0a8 / 跌红#ff4d6b / accent蓝#8B7DFF / energy青#8B7DFF / cyan#8B7DFF,
           不再引入站外色(原品红/钢银/铜红全部退役), 与UI面板/按钮/KPI同一套光语言 */
        bull:     { a:[0.99,0.82,0.33], b:[0.00,0.88,0.66], k:0.88 },  /* 品牌金 → 涨绿 */
        bear:     { a:[1.00,0.30,0.42], b:[0.30,0.55,1.00], k:0.85 },  /* 跌红 → accent蓝 */
        range:    { a:[0.30,0.55,1.00], b:[0.37,0.82,1.00], k:0.75 },  /* accent蓝 → energy青(站点默认观感) */
        panic:    { a:[0.20,0.40,0.88], b:[0.25,0.71,0.83], k:0.88 },  /* 深accent蓝 → cyan(冷收) */
        euphoria: { a:[0.30,0.55,1.00], b:[0.99,0.82,0.33], k:0.92 }   /* accent蓝 → 品牌金(站内冷暖双主色) */
      };
      var _hexMoodCur = 'range';
      var _hexMoodLastMs = 0;
      var _hexMoodTgt = {
        a:new THREE.Color(0.30,0.55,1.00), b:new THREE.Color(0.37,0.82,1.00), k:0.75
      };
      /* v-fix(2026-09-26 作者: 地球颜色干净一些, 现在有点发绿) ——
         中性冷银白常量: 地球芯/玻璃厚度光的目标色。
         之前二者吃 情绪色(a,b) 的**中值**, bull 态 = 金+绿 中值 ≈ 绿 ⇒ 整球发绿。
         改用此常量后, 地球主体固定为“黑白数字”的冷银基调, 不再随市态染色。 */
      var _HEX_NEUTRAL_C = new THREE.Color(0.93, 0.955, 1.0);
      window.__hexMood = function(regime){
        if(regime === undefined) return _hexMoodCur;
        var m = _HEX_MOOD[regime] || _HEX_MOOD.range;
        _hexMoodCur = _HEX_MOOD[regime] ? regime : 'range';
        _hexMoodTgt.a.setRGB(m.a[0], m.a[1], m.a[2]);
        _hexMoodTgt.b.setRGB(m.b[0], m.b[1], m.b[2]);
        _hexMoodTgt.k = m.k;
        return _hexMoodCur;
      };
      /* 色调权重旋钮(0=不变色, 1=完全市态色) */
      window.__mwHexMoodK = function(v){
        if(v === undefined) return _hexMoodTgt.k;
        _hexMoodTgt.k = Math.max(0, Math.min(1, Number(v)||0));
        return _hexMoodTgt.k;
      };
      /* v149c(作者: 去除外围金属框) —— frame 是沿每条六边形缝铺的"钢槽桁架",
         它正是盖在球面外层的那张金属网格。默认不再加入场景。
         对象与材质保留, 需要时可 __hexGrid(true) 拉回 / __hexGrid(false) 再拿掉。 */
      var _hexGridOn = false;
      window.__hexGrid = function(on){
        var want = (on === undefined) ? !_hexGridOn : !!on;
        if(want === _hexGridOn) return _hexGridOn;
        _hexGridOn = want;
        if(want){ if(frame.parent !== hexGroup) hexGroup.add(frame); }
        else { hexGroup.remove(frame); }
        return _hexGridOn;
      };
      hexGroup.add(starField);
      hexGroupLights.forEach(function(L){ scene.add(L); });
      scene.add(starField);

      /* 发光接口(后续可调): v = 0 熄 / 1 微光 / 2 高亮 */
      window.__hexFrame = {
        tri2cell:TRI2CELL,
        shell:shell, frame:frame, tiles:mesh, stars:starField,
        shellMat:shellMat, frameMat:frameMat, tileMat:mat, envTex:envTex,
        edges:(FPOS.length/18), size:sizeArr, face:faceArr, faceW:faceWArr, dir:dirArr,
        cam:camera, group:group,
      };
      window.__hexGlow = function(v){
        /* v149b: 基调改哑光深色 —— 加亮时只抬自发光强度, 不再把色相拉回亮金属 */
        const k = Math.max(0, Math.min(2, Number(v)||0));
        shellMat.emissiveIntensity = 0.08 + k*0.24;
        shellMat.emissive.setHex(k > 0.6 ? 0x0d2136 : 0x03060a);
        frameMat.emissiveIntensity = 0.12 + k*0.42;
        frameMat.emissive.setHex(k > 0.6 ? 0x1d3d57 : 0x070a0e);
        frameMat.color.setHex(0x232a33);
        return k;
      };
      /* v152(玻璃旋钮) —— 控制台实时调: __hexGlass(面板α, 侧壁α, logo直径, 光圈α, 光圈宽)
         例: __hexGlass(0.04, 0.22, 0.44) = 更透 + logo 更小 + 光圈更细 */
      window.__hexGlass = function(a, b, dia, bandA, bandW){
        const sh = mat.userData.sh;
        if(!sh) return 'not-ready';
        const u = sh.uniforms;
        if(a     !== undefined) u.uGlassA.value = a;
        if(b     !== undefined) u.uSideA.value  = b;
        if(dia   !== undefined) u.uDia.value    = dia;
        if(bandA !== undefined) u.uBandA.value  = bandA;
        if(bandW !== undefined) u.uBandW.value  = bandW;
        return { uGlassA:u.uGlassA.value, uSideA:u.uSideA.value, uDia:u.uDia.value,
                 uBandA:u.uBandA.value, uBandW:u.uBandW.value };
      };
      /* ══════════════════════════════════════════════════════════════
         v149(2026-09-20 作者) 币种层
           ① 所有币种 logo 贴进六边形表面
           ② 主流 / 热门 / 涨幅榜 / 跌幅榜 —— 每组都「从大到小」铺:
              最大的格 ← 组里最靠前的币(格的大小由面心权重决定, 面心最大)
           ③ 外壳一圈细光圈: 涨=绿 / 跌=红
           ④ 鼠标指到的格 → 整块浮空 + 显示 币名 + 涨跌幅
         ══════════════════════════════════════════════════════════════ */
      const _HEX_MAIN = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','TRX','LINK','AVAX',
                         'TON','SUI','DOT','LTC','BCH','UNI','NEAR','APT','ARB','OP',
                         'INJ','FIL','AAVE','PEPE','WLD','HYPE','ONDO','TRUMP','TAO','ENA'];
      const _hexTileAttr = g.attributes.aTile, _hexChgAttr = g.attributes.aChg;
      let _hexSymOf = null, _hexMktMap = {}, _hexCount = 0;
      /* ── 币种落格: 均匀铺满全球面, 组内从大到小 ──
         坑: 直接按面心权重取前 M 格 → 全部挤在面心一小块(球面大部分空着)。
         做法: 先按「大小降序」尝试, 与已选格角距 > 9.5° 才采纳
               → 既优先占大格, 又被角距约束摊平到整个球面(≈530 格);
               排序保持降序 → pool[0](BTC) 落最大格, 组内严格从大到小。 */
      /* 按「面心权重」降序的格序(大格在前) */
      const _hexOrder = (function(){
        const a = new Array(N);
        for(let i=0;i<N;i++) a[i] = i;
        a.sort(function(p,q){
          const d = faceWArr[q] - faceWArr[p];
          if(Math.abs(d) > 1e-6) return d;
          return faceArr[p] - faceArr[q];
        });
        return a;
      })();
      /* v149c(作者: 把其他币种也进去) —— 原来固定 9.5° 最小夹角 → 只挑得出 ~325 格,
         其余币种全被丢掉(球面大片空着)。改成「按需求量自适应间距」:
         从 9.5° 起逐档收紧, 直到挑出的格数 ≥ 需要的币数 →
         币多时自动铺得更密, 币少时仍保持大间距、优先占大格。 */
      const _hexSelCache = {};
      const _hexPickCells = function(need){
        if(need >= N) return _hexOrder;
        const key = need | 0;
        if(_hexSelCache[key]) return _hexSelCache[key];
        let deg = 9.5, sel = _hexOrder;
        while(deg > 1.1){
          const MIN_COS = Math.cos(deg*Math.PI/180);
          sel = [];
          for(let k=0;k<_hexOrder.length;k++){
            const ci = _hexOrder[k];
            const x=dirArr[ci*3], y=dirArr[ci*3+1], z=dirArr[ci*3+2];
            let ok = true;
            for(let q=0;q<sel.length;q++){
              const cj = sel[q];
              if(x*dirArr[cj*3] + y*dirArr[cj*3+1] + z*dirArr[cj*3+2] > MIN_COS){ ok=false; break; }
            }
            if(ok) sel.push(ci);
          }
          if(sel.length >= need) break;
          deg *= 0.86;
        }
        _hexSelCache[key] = sel;
        return sel;
      };
      window.__cgHexMkt = function(payload){
        window.__cgHexMkt.last = payload || null;
        if(!payload) return 0;
        const uni = payload.universe || payload.movers || [];
        if(!uni || !uni.length) return 0;
        const a2i = _hexAtlasCfg.sym2idx;
        if(!a2i) return 0;
        const rows = [];
        for(let k=0;k<uni.length;k++){
          const x = uni[k]; let sym, chg, vol;
          if(Array.isArray(x)){ sym=x[0]; chg=+x[1]||0; vol=+x[2]||0; }
          else { sym=x.sym; chg=+(x.chg_pct)||0; vol=+(x.vol)||0; }
          if(!sym || a2i[sym] == null) continue;
          rows.push({ sym:sym, chg:chg, vol:vol, tile:a2i[sym] });
        }
        if(!rows.length) return 0;
        const byVol = rows.slice().sort(function(a,b){ return b.vol - a.vol; });
        const mainSet = {}; for(let k=0;k<_HEX_MAIN.length;k++) mainSet[_HEX_MAIN[k]] = 1;
        const pool = [], used = {};
        const push = function(list){
          for(let k=0;k<list.length;k++){ const r = list[k];
            if(used[r.sym]) continue; used[r.sym] = 1; pool.push(r); }
        };
        push(byVol.filter(function(r){ return mainSet[r.sym]; }));            /* ① 主流 */
        push(byVol.slice(0, 90));                                            /* ② 热门 */
        push(rows.slice().sort(function(a,b){ return b.chg - a.chg; }).slice(0, 70));  /* ③ 涨幅榜 */
        push(rows.slice().sort(function(a,b){ return a.chg - b.chg; }).slice(0, 70));  /* ④ 跌幅榜 */
        push(byVol);                                                         /* ⑤ 补满 */
        /* ⑥ v149e(作者: 把其他币种也进去) —— OKX 只有 467 个合约, 但图集有 942 枚
           (含币安/火币)。把图集里其余币种也补上, 无行情 → chg 置哨兵 -999
           (不着色/不显示百分比, 只出 logo), 避免伪造成 0.00% 的假数据。 */
        const _usedSet = used;
        for(let k=0;k<_hexAtlasCfg.symOrder.length;k++){
          const sy = _hexAtlasCfg.symOrder[k];
          if(_usedSet[sy]) continue;
          _usedSet[sy] = 1;
          pool.push({ sym:sy, chg:-999, vol:0, tile:a2i[sy], nd:1 });
        }
        const cellA = _hexTileAttr.array, chgA = _hexChgAttr.array;
        for(let k=0;k<cellA.length;k++){ cellA[k] = -1; chgA[k] = 0; }
        /* v128.7(作者: 无logo空白格不是删除, 而是移到看不见的角度) ——
           球只绕 Y 轴自转 + 相机在赤道上方 → 「底极」是永不可见区域。
           币多时(≥55%格)自顶向下铺 → 空白格全部落底极, 正面永远看不到;
           币少时仍走均匀散铺(防币全挤顶帽)。 */
        const cells = (pool.length >= N * 0.55)
          ? Array.from({length:N}, function(_,i){ return i; })
              .sort(function(p,q){ return dirArr[q*3+1] - dirArr[p*3+1]; })
              .slice(0, pool.length)
          : _hexPickCells(pool.length);
        const nPut = Math.min(pool.length, cells.length), symOf = new Array(N);
        for(let i=0;i<nPut;i++){
          const ci = cells[i], r = pool[i];
          const vs = CELLVIDX[ci];
          if(!vs) continue;
          for(let q=0;q<vs.length;q++){ cellA[vs[q]] = r.tile; chgA[vs[q]] = r.chg; }
          symOf[ci] = r.sym;
        }
        _hexTileAttr.needsUpdate = true; _hexChgAttr.needsUpdate = true;
        _hexSymOf = symOf; _hexCount = nPut;
        _hexMktMap = {};
        for(let i=0;i<nPut;i++){ if(!pool[i].nd) _hexMktMap[pool[i].sym] = pool[i]; }
        try{ window.__cgHexFrame && window.__cgHexFrame(); }catch(e){}
        return nPut;
      };
      window.__cgHexMkt.count = function(){ return _hexCount; };
      window.__cgHexMkt.symAt = function(c){ return (_hexSymOf && _hexSymOf[c]) || null; };
      /* v214: 屏幕坐标 → 币种(轻点选币) */
      window.__cgHexMkt.pickAt = function(x, y){ return window.__cgHexPickAt ? window.__cgHexPickAt(x, y) : null; };
      window.__cgHexMkt.posOf = function(sym){
        if(!_hexSymOf) return null;
        for(let i=0;i<N;i++) if(_hexSymOf[i] === sym) return i;
        return null;
      };

      /* ── 悬浮: 射线打在地球上 → 取最近格心的那一格 ── */
      const _hexRay = new THREE.Raycaster(), _hexNdc = new THREE.Vector2();
      const _hexSphereHit = new THREE.Sphere(new THREE.Vector3(0,0,0), RV);
      const _hexHitPt = new THREE.Vector3(), _hexCtr = new THREE.Vector3();
      let _hexMouse = null, _hexHoverCell = -1, _hexHoverTgt = -1, _hexHoverK = 0;
      const _hexTip = document.createElement('div');
      _hexTip.id = 'hexCoinTip';
      _hexTip.style.cssText = 'position:fixed;z-index:9;pointer-events:none;display:none;'
        + 'transform:translate(-50%,-124%);padding:5px 9px;border-radius:8px;white-space:nowrap;'
        + 'font:700 12px/1.35 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.4px;'
        + 'background:rgba(8,8,14,.82);backdrop-filter:blur(6px);'
        + 'border:1px solid rgba(139,125,255,.40);color:#e8f2ff;'
        + 'box-shadow:0 6px 22px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.10)';
      (document.body || document.documentElement).appendChild(_hexTip);
      window.addEventListener('pointermove', function(e){
        _hexMouse = { x:e.clientX, y:e.clientY };
        _hexPickDirty = true;              /* v149g: 标脏 → 下一帧做一次精确拾取 */
      }, {passive:true});
      window.addEventListener('pointerleave', function(){ _hexMouse = null; _hexPickDirty = true; });
      /* v149g: 精确拾取(射线打真实三角面 → TRI2CELL) —— 每帧最多一次, 开销可控 */
      const _hexPick = new THREE.Raycaster();
      let _hexPickDirty = false, _hexHitCell = -1;
      function _hexDoPick(){
        _hexPickDirty = false;
        if(!_hexMouse){ _hexHitCell = -1; return; }
        const r = cvs.getBoundingClientRect();
        if(!r.width) return;
        _hexNdc.x = ((_hexMouse.x - r.left)/r.width)*2 - 1;
        _hexNdc.y = -((_hexMouse.y - r.top)/r.height)*2 + 1;
        _hexPick.setFromCamera(_hexNdc, camera);
        const hits = _hexPick.intersectObject(mesh, false);
        if(!hits.length){ _hexHitCell = -1; return; }
        const f = hits[0].faceIndex;
        const t2c = window.__hexFrame && window.__hexFrame.tri2cell;
        _hexHitCell = (t2c && f >= 0 && f < t2c.length) ? t2c[f] : -1;
      }
      /* v214: 对外暴露拾取(供英雄区轻点选币) */
      window.__cgHexPickAt = function(x, y){
        try{
          _hexMouse = { x:x, y:y }; _hexPickDirty = true; _hexDoPick();
          return (_hexHitCell >= 0 && _hexSymOf) ? (_hexSymOf[_hexHitCell] || null) : null;
        }catch(e){ return null; }
      };

      /* 逐帧: 悬浮判定 + 浮空缓动 + 名牌跟随 */
      window.__cgHexFrame = function(){
        /* v157: 能量护盾时钟(与玻璃砖同一时钟) */
        if(window.__cgHexShield && window.__cgHexShield.material.uniforms.uTime){
          window.__cgHexShield.material.uniforms.uTime.value = performance.now()/1000;
        }
        /* v124(作者: 根据市场情绪波动变幻) —— 逐帧**平滑**把护盾色/玻璃色调
           朝目标市态色缓动(每秒约 3% 差距), 换市态时是渐变而非跳变;
           同时给一点极慢的色相漂移 → “动态多变但不花里胡哨”。 */
        const _sU = window.__cgHexShield && window.__cgHexShield.material.uniforms;
        if(_sU){
          /* 基于时间的指数平滑(与帧率无关): ~0.9s 收敛一半, 换市态约 2~3s 渐变到位 */
          const _nowMs = performance.now();
          const _dt = Math.min((_nowMs - (_hexMoodLastMs || _nowMs)) / 1000, 0.25);
          _hexMoodLastMs = _nowMs;
          const _lf = 1.0 - Math.pow(0.10, _dt);
          _sU.uColA.value.lerp(_hexMoodTgt.a, _lf);
          _sU.uColB.value.lerp(_hexMoodTgt.b, _lf);
          /* v124: 内层数字地球同步吃情绪色 → 换市态时“地球芯”先变色 */
          const _eU = window.__cgEarthMat && window.__cgEarthMat.uniforms;
          if(_eU && _eU.uEarthMood){
            /* v-fix(2026-09-26 作者: 发绿) —— 原取 a/b 中值(bull≈绿) ⇒ 地球芯发绿;
               现恒为冷银白 → 回到中性数字基调。 */
            _eU.uEarthMood.value.lerp(_HEX_NEUTRAL_C, _lf);
            _eU.uEarthMoodK.value = _hexMoodTgt.k;
          }
          const _sh = mat.userData.sh;
          if(_sh && _sh.uniforms.uMood){
            const _k = _hexMoodTgt.k;
            /* v-fix(2026-09-26 作者: 发绿) —— 玻璃厚度光原吃情绪色中值,
               bull 态实测 glassMood=90e091(绿) ⇒ 球缘棱角整圈发绿;
               现恒为冷银白 → 只留玻璃本身的冷灰反光, 无色相。 */
            _sh.uniforms.uMood.value.lerp(_HEX_NEUTRAL_C, _lf);
            _sh.uniforms.uMoodK.value = _k;
          }
        }
        const sh = mat.userData.sh;
        if(!sh) return;
        /* 只在六边形模式下工作 */
        /* v149g: 拾取换成真实三角面射线(每帧最多一次) → 命中格与鼠标严格一致。
           只认「该格确实有币」的格, 空格不浮空不弹牌。 */
        if(_hexPickDirty) _hexDoPick();
        if(!_hexMouse || dragging){ _hexHoverTgt = -1; }
        else { _hexHoverTgt = (_hexHitCell >= 0 && _hexSymOf && _hexSymOf[_hexHitCell]) ? _hexHitCell : -1; }
        /* 浮空缓动: 换格先落回再抬(不会瞬移) */
        if(_hexHoverTgt !== _hexHoverCell){
          _hexHoverK += (0 - _hexHoverK)*0.24;
          if(_hexHoverK < 0.03){ _hexHoverCell = _hexHoverTgt; _hexHoverK = 0; }
        } else {
          _hexHoverK += ((_hexHoverTgt >= 0 ? 1 : 0) - _hexHoverK)*0.24;
        }
        sh.uniforms.uHover.value = _hexHoverCell;
        sh.uniforms.uHoverK.value = _hexHoverK;
        sh.uniforms.uTime.value = performance.now()/1000;
        /* 名牌: 钉在该格中心的屏幕位置 */
        const sym = (_hexHoverCell >= 0 && _hexHoverK > 0.25) ? (_hexSymOf && _hexSymOf[_hexHoverCell]) : null;
        if(sym){
          const t = _hexMktMap[sym] || null;      /* v149e: null = 无行情 */
          const chg = t ? ((+t.chg)||0) : 0, up = chg >= 0;
          const e = mesh.matrixWorld.elements, i = _hexHoverCell;
          const lx = dirArr[i*3], ly = dirArr[i*3+1], lz = dirArr[i*3+2];
          const wx = e[0]*lx+e[4]*ly+e[8]*lz+e[12];
          const wy = e[1]*lx+e[5]*ly+e[9]*lz+e[13];
          const wz = e[2]*lx+e[6]*ly+e[10]*lz+e[14];
          const v = new THREE.Vector3(wx,wy,wz).multiplyScalar(RV*1.06).project(camera);
          const r2 = cvs.getBoundingClientRect();
          const sx = r2.left + (v.x*0.5+0.5)*r2.width, sy = r2.top + (-v.y*0.5+0.5)*r2.height;
          _hexTip.style.display = 'block';
          _hexTip.style.left = sx.toFixed(1)+'px';
          _hexTip.style.top = sy.toFixed(1)+'px';
          if(t){
            _hexTip.style.borderColor = up ? 'rgba(60,220,160,.55)' : 'rgba(255,110,125,.55)';
            _hexTip.innerHTML = '<span>'+sym+'</span><span style="margin-left:6px;color:'
              + (up ? '#3fd39a' : '#ff6b76') + '">' + (up?'+':'') + chg.toFixed(2) + '%</span>';
          } else {
            /* v149e: 无行情币 → 只出币名(冷灰), 不显示 0.00% 假数据 */
            _hexTip.style.borderColor = 'rgba(139,125,255,.40)';
            _hexTip.innerHTML = '<span style="color:#c3d3e6">'+sym+'</span>'
              + '<span style="margin-left:6px;color:#7d8ea3">—</span>';
          }
        } else {
          _hexTip.style.display = 'none';
        }
      };

      try{ console.log('[hex] 六边形球: ' + N + ' 格 = ' + hexN + ' 六边形 + ' + pentN
        + ' 五边形 · 缝 ' + (FPOS.length/18) + ' 条 · 星空 ' + (SP.length/3) + ' 颗'); }catch(e){}
      return hexGroup;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     v125.1 地球读数面板 — 让地球能说话(数据全真实: 热力环 + 持仓信标)
     位置: 地球左下角; 语言与全站统一(等宽 + 中文标签)
     ══════════════════════════════════════════════════════════════ */
  function _renderEarthLegend(){
    if(window.__cgHexMode) return;          /* v145: 币牌读数图例已下线 */
    const box=document.getElementById('aiEarthLegend'); if(!box) return;
    box.style.display='';
    /* v127(09-19 作者: 外圈光环不需要了) → 图例只留币牌读数 */
    box.innerHTML=
      '<span class="el-h">'+t('涨跌榜币牌')+'</span><span class="el-v" id="elBeaconV">--</span>';
    window.__cgLegendPaint();
  }
  window.__cgLegendPaint=function(){
    const bv=document.getElementById('elBeaconV');
    if(bv){
      const n=(window.__cgEarthMkt&&window.__cgEarthMkt.count)?window.__cgEarthMkt.count()
             :((window.__cgEarthPos&&window.__cgEarthPos.count)?window.__cgEarthPos.count():0);
      bv.textContent=__cgLang==='en'?(n+' live'):(n+' 个');
    }
  };
  window.__cgEarthLegend=_renderEarthLegend;   // v125: 语言切换时重建图例

  /* ══════════════════════════════════════════════════════════════
     v125(09-19 作者: fully blended with the site / 行情显示不行)
     24h 交易热力环 —— 让行情真正长在地球上
     the dashboard feed 的 hours[24] → 赤道 24 根径向数据柱
       · 高度 = 该小时 开仓+平仓 笔数 (作者一眼看出when activity peaks)
       · 色阶 = 青 → 蓝 → 红 (与页面 24h 热力图**同一套色**, 一眼对得上)
       · 归零不显示(无交易时段留白, 不做假数据)
     ══════════════════════════════════════════════════════════════ */
  let hwLandDots = null;   // v126: 供主循环推进六边形点阵的出块脉冲
  const heatRing = new THREE.Group();
  const _heatBars = [];
  let _heatBand = null;
  const _HEAT_N = 24, _HEAT_R0 = 1.006, _HEAT_R1 = 1.032;   // v126C: 紧贴地表 → 前弧可见/后弧被球体遮挡(自然读作球面上的数据带)
  function _mkHeatRing(){
    /* v127(09-19 作者: 外圈光环就不需要了) → 热力环下线, 保留函数以兼容旧调用 */
    return;
    if(_heatBars.length) return;
    /* 环带: 24 段(每段=1小时) — 用顶点色, 数据到达时就地改色, 不重建几何 */
    const pos=[], idx=[], col=[];
    for(let i=0;i<_HEAT_N;i++){
      /* v126: 每格收窄 30% 留缝 → 24 个独立格, 不再连成一条横穿地球的带子 */
      const cell=_HEAT_N, gap=0.30;
      const a0=(i+gap*0.5)/cell*Math.PI*2, a1=(i+1-gap*0.5)/cell*Math.PI*2;
      const c0=Math.cos(a0), s0=Math.sin(a0), c1=Math.cos(a1), s1=Math.sin(a1);
      const b=pos.length/3;
      pos.push(_HEAT_R0*c0,_HEAT_R0*s0,0, _HEAT_R1*c0,_HEAT_R1*s0,0,
               _HEAT_R1*c1,_HEAT_R1*s1,0, _HEAT_R0*c1,_HEAT_R0*s1,0);
      idx.push(b,b+1,b+2, b,b+2,b+3);
      for(let k=0;k<4;k++) col.push(0.045,0.062,0.090);   // v126: 基准=链路深蓝(与晶格球同源)
    }
    const bg=new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    bg.setIndex(idx);
    bg.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
    _heatBand=new THREE.Mesh(bg, new THREE.MeshBasicMaterial({
      vertexColors:true, transparent:true, opacity:0.62,
      blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
    heatRing.add(_heatBand);
    /* v126: 径向光柱 → 六边形热力格(每格=1小时; 一个区块=一段行情)
       格子在环平面内朝外排布, 强度 → 尺寸 + 亮度(不再靠"高度"表达) */
    for(let i=0;i<_HEAT_N;i++){
      const a=i/_HEAT_N*Math.PI*2;
      const dir=new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      const g=new THREE.CylinderGeometry(1, 1, 0.010, 6);   // 单位六边板, 靠 scale 控制
      const m=new THREE.MeshBasicMaterial({ color:0x3d8bff, transparent:true,
        opacity:0.7, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
      const bar=new THREE.Mesh(g, m);
      bar.position.copy(dir.clone().multiplyScalar(_HEAT_R1));
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
      bar.scale.set(0.001, 1, 0.001);
      heatRing.add(bar); _heatBars.push(bar);
    }
    heatRing.rotation.x = 0.22;    // v126C: 小倾角 → 环绕球体的数据环(整圈可见, 带一点透视), 不再是斜插画面的带子
    scene.add(heatRing);           // 挂 scene: 不跟球自转 → 读数稳定不晃
    window.__cgHeatRingObj = heatRing;
  }
  /* 数据入口: renderHwMarkets 每次拿到 mkt 就喂一次(真实数据驱动) */
  window.__cgHeatRing = function(hours){
    if(!hours || !hours.length || !_heatBars.length) return false;
    let mx = 0;
    hours.forEach(h=>{ mx = Math.max(mx, (h.opens||0)+(h.closes||0)); });
    window.__cgHeatMax = mx;
    window.__cgHeatHours = hours;
    try{ window.__cgLegendPaint&&window.__cgLegendPaint(); }catch(e){}
    if(mx<=0) return false;
    const COLD=new THREE.Color(0x2fd8b0), MID=new THREE.Color(0x3d8bff), HOT=new THREE.Color(0xff4d6b);
    const cAttr=_heatBand&&_heatBand.geometry.attributes.color;
    hours.forEach(function(h,i){
      const t=((h.opens||0)+(h.closes||0))/mx;
      const GOLD=new THREE.Color(0xe0bd63);
      let c=(t<0.5)?COLD.clone().lerp(MID,t*2):MID.clone().lerp(HOT,(t-0.5)*2);
      c=c.clone().lerp(GOLD, 0.28);   // v125.3: 数据色向品牌金借调 → 与全站同源
      const bar=_heatBars[i];
      if(bar){
        /* v126: 六边形热力格 — 强度驱动 面积 + 亮度(替代原来的柱高) */
        const sz = 0.0026 + t*0.0072;   // v126C: 六边格(够大才读得出)
        bar.scale.set(sz, 1, sz);
        bar.material.color.copy(c);
        bar.material.opacity = 0.34 + t*0.62;
        bar.visible = t>0;
      }
      if(cAttr){
        const rr = t>0 ? c.r*0.72 : 0.085, gg = t>0 ? c.g*0.72 : 0.070, bb = t>0 ? c.b*0.72 : 0.038;
        for(let k=0;k<4;k++) cAttr.setXYZ(i*4+k, rr, gg, bb);
      }
    });
    if(cAttr) cAttr.needsUpdate=true;
    return true;
  };

  // ===== 科幻全息信息网络层 (v105.18) =====
  /* v126C: 情报点 = 六边形代币标记(不再是白球乱飘)
     形态: 六边外环(等级色) + 中心实心点(核心) + 极淡外晕 → 读作"链上事件代币" */
  function makeGlow(r, g, b, peak){
    if(peak == null) peak = 0.75;
    const S = 256;                     // v132: 128→256, 放大后边缘不再糊
    const cvx = document.createElement('canvas'); cvx.width = S; cvx.height = S;
    const cx2 = cvx.getContext('2d');
    const C = S/2, R = S*0.40;
    /* 极淡外晕(保持一点光感, 但不再是主角) */
    const gr = cx2.createRadialGradient(C, C, R*0.6, C, C, C);
    gr.addColorStop(0, 'rgba('+r+','+g+','+b+','+(peak*0.22)+')');
    gr.addColorStop(0.6, 'rgba('+r+','+g+','+b+','+(peak*0.07)+')');
    gr.addColorStop(1, 'rgba('+r+','+g+','+b+',0)');
    cx2.fillStyle = gr; cx2.fillRect(0, 0, S, S);
    /* 六边形外环(flat-top, 与全站"区块"语言一致) */
    cx2.beginPath();
    for(let i=0;i<6;i++){
      const a = Math.PI/3*i;
      const x = C + Math.cos(a)*R, y = C + Math.sin(a)*R;
      i ? cx2.lineTo(x,y) : cx2.moveTo(x,y);
    }
    cx2.closePath();
    cx2.lineWidth = S*0.040;
    cx2.strokeStyle = 'rgba('+r+','+g+','+b+','+Math.min(1,peak*1.25)+')';
    cx2.stroke();
    /* 中心实心核心 */
    cx2.beginPath();
    cx2.arc(C, C, S*0.082, 0, Math.PI*2);
    cx2.fillStyle = 'rgba('+r+','+g+','+b+','+Math.min(1,peak*1.35)+')';
    cx2.fill();
    const t = new THREE.CanvasTexture(cvx);
    return t;
  }
  // 拖拽旋转
  let dragging = false, vx = 0.0011, lastX = 0;
  const cvs = renderer.domElement;
  cvs.style.cursor = 'grab';
  /* v214(作者: 地球没交互) —— .earth-bg 是 pointer-events:none 背景层(canvas 收不到指针),
     改绑到能吃事件的英雄区 #hqStage: 拖拽旋转 + 轻点选币 全部生效。
     注意: 情报卡/操作条等可点元素要放行(closest 守卫), 否则会吞掉它们的点击。 */
  const _dragSurf = document.getElementById('hqStage') || holder || document.body;
  if(_dragSurf){
    _dragSurf.style.cursor = 'grab';
    _dragSurf.style.touchAction = 'pan-y';
    let _dragMoved = 0;
    function _globePickAt(x, y){
      try{
        if(window.__cgHexMode && window.__cgHexMkt && window.__cgHexMkt.pickAt) return window.__cgHexMkt.pickAt(x, y);
        return null;
      }catch(e){ return null; }
    }
    window.__cgGlobePickAt = _globePickAt;   /* 供外部/自测调用 */
    _dragSurf.addEventListener('pointerdown', e => {
      if(e.target && e.target.closest && e.target.closest('.ai-ev,.hq-intel,.ai-earth-legend,.hq-opsbar,button,a,input,select,textarea')) return;
      dragging = true; _dragMoved = 0; lastX = e.clientX; _dragSurf.style.cursor = 'grabbing';
      try{ _dragSurf.setPointerCapture && _dragSurf.setPointerCapture(e.pointerId); }catch(err){}
    });
    window.addEventListener('pointermove', e => {
      if(!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX; vx = dx*0.004; _dragMoved += Math.abs(dx);
    });
    window.addEventListener('pointerup', e => {
      if(!dragging) return;
      dragging = false; _dragSurf.style.cursor = 'grab';
      try{ _dragSurf.releasePointerCapture && _dragSurf.releasePointerCapture(e.pointerId); }catch(err){}
      if(_dragMoved < 6){                       /* 轻点(未拖动) → 选中币种 */
        const sym = _globePickAt(e.clientX, e.clientY);
        if(sym){
          if(window.__cgFocusSym) try{ window.__cgFocusSym(sym); }catch(x){}      /* 球转向该币 */
          if(window.__cgMktFocus)  try{ window.__cgMktFocus(sym); }catch(x){}      /* 行情卡联动 */
          try{ document.dispatchEvent(new CustomEvent('hwglobe:pick',{detail:{sym:sym}})) }catch(x){}
        }
      }
      _dragMoved = 0;
    });
  } else {
    cvs.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; cvs.style.cursor='grabbing'; });
    window.addEventListener('pointermove', e => { if(dragging){ const dx = e.clientX-lastX; lastX = e.clientX; vx = dx*0.004; } });
    window.addEventListener('pointerup', () => { dragging = false; cvs.style.cursor='grab'; });
  }

  // ===== 指针视差(轻微俯仰, 增加纵深) v107.18 =====
  /* ── v148c(作者: 不要俯瞰, 还是向右转) ──
     恢复原来的正视俯仰(0.12), 不做任何俯瞰/仰视角度。
     面心在 ±Z(垂直于自转轴), 所以 rotation.y=0 时前半面正对镜头,
     球向右自转 → 两面轮流转到面前, 大块自己会「转到我脸上」。 */
  const FACE_TILT = 0.12;
  let tiltTarget = FACE_TILT, tiltCur = FACE_TILT;
  group.rotation.x = FACE_TILT;
  // ===== v110.17: 滚动/指针视差 —— 内容滚动时地球微转, 指针横移时微移, 制造纵深 =====
  let scrollShift = 0, scrollCur = 0;
  // v121: _baseX 已提到 _fitCam 作用域(随屏幕比例变化) —— 此处不再重复声明
  let _pxCur = 0;
  try{
    const sc = document.querySelector('.content');
    if(sc){ sc.addEventListener('scroll', ()=>{ scrollShift = Math.min(sc.scrollTop, 1600) / 1600; }, {passive:true}); }
  }catch(err){}
  holder.addEventListener('pointermove', e=>{
    if(dragging) return;
    const r = holder.getBoundingClientRect();
    if(!r.height) return;
    tiltTarget = FACE_TILT + ((e.clientY-(r.top+r.height/2))/r.height) * -0.10;
  });
  holder.addEventListener('pointerleave', ()=>{ tiltTarget = FACE_TILT; });
  // v110.17: 地球已是背景层(pointer-events:none) → 改用窗口级指针视差
  window.addEventListener('pointermove', e=>{
    const h = window.innerHeight || 1;
    tiltTarget = FACE_TILT + ((e.clientY - h/2)/h) * -0.085;
    window.__earthPx = (e.clientX / (window.innerWidth||1)) - 0.5;
  }, {passive:true});

  // ===== v107.7 (09-06 作者): 地球 ↔ 情报流 联动交互 =====
  // 事件点: 按标题哈希稳定映射到全球坐标(悬浮于城市网络上方), 等级着色
  const intelSprites = {};
  const fxSet = new Set(); window.__earthFx = fxSet;
  function _hashStr(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h}
  function _lvRgb(lv){const m={S:[255,95,109],A:[255,159,67],B:[77,159,255],C:[140,150,180]};return m[lv]||m.C}
  function _addIntelPoint(title, lv){
    /* v135(09-19 作者: 去除新闻的那些联动亮点) → 地球不再挂新闻事件点
       (保留函数签名与返回结构: 上层 sync/setActive/focus/project 全部按空集自然降级) */
    return null;
    // eslint-disable-next-line no-unreachable
    const h = _hashStr(title);
    const city = CITIES[h % CITIES.length];
    const la = city.la + ((h>>3)%7-3)*0.8;
    const lo = city.lo + ((h>>7)%11-5)*1.6;
    const v = ll2v(la, lo, 1.04);
    const rgb = _lvRgb(lv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow(rgb[0], rgb[1], rgb[2], 0.9), transparent:true, opacity:1,
      depthWrite:false, blending:THREE.AdditiveBlending }));
    sp.position.copy(v.clone().multiplyScalar(0.01));
    sp.userData = { title:title };
    group.add(sp);
    const rec = { sp:sp, v:v, lv:lv, base:0.070, born:performance.now() };   // v132: 尺寸回落(不再拉太大)
    intelSprites[title] = rec;
    sp.scale.setScalar(0.001);
    // 出生动画: 自核心射出 → 到达位置 → 膨胀回落 (0.55s)
    const fxBorn = function(dt, tt){
      const age = (performance.now()-rec.born)/1000;
      if(age>0.55){ fxSet.delete(fxBorn); sp.position.copy(v); sp.scale.setScalar(rec.base); return; }
      const k = Math.min(age/0.16, 1);
      sp.position.copy(v.clone().multiplyScalar(Math.max(k, 0.02)));
      sp.scale.setScalar(rec.base * Math.min(age/0.2,1) * (1 + 1.8*Math.max(0,1-age/0.35)));
    };
    fxSet.add(fxBorn);
    return rec;
  }
  // 卡片 ↔ 点 高亮联动
  function _setActive(title, on){
    for(const k in intelSprites){
      const r = intelSprites[k];
      if(on && k===title){ r.sp.scale.setScalar(r.base*2.0); r.sp.material.opacity = 1; }
      else { r.sp.scale.setScalar(r.base); r.sp.material.opacity = (on? 0.35 : 1); }
    }
  }
  // 聚焦: 缓动旋转地球使该事件点朝向用户 (不打断拖拽)
  const focusFx = function(dt, tt){
    const f = window.__cgFocus;
    if(!f || dragging){ if(f && !dragging){ window.__cgFocus=null; } return; }
    let d = f.target - group.rotation.y;
    while(d > Math.PI) d -= 2*Math.PI;
    while(d < -Math.PI) d += 2*Math.PI;
    group.rotation.y += d*0.085;
    if(Math.abs(d) < 0.01 || performance.now() > f.until){ window.__cgFocus = null; }
  };
  fxSet.add(focusFx);
  // 射线悬停: 事件点 hover → 高亮右侧卡片
  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  cvs.addEventListener('pointermove', e=>{
    const rect = cvs.getBoundingClientRect();
    if(!rect.width) return;
    _ndc.x = ((e.clientX-rect.left)/rect.width)*2-1;
    _ndc.y = -((e.clientY-rect.top)/rect.height)*2+1;
    _ray.setFromCamera(_ndc, camera);
    const sprites = Object.keys(intelSprites).map(k=>intelSprites[k].sp);
    const hits = sprites.length? _ray.intersectObjects(sprites, false) : [];
    if(hits.length){ cvs.style.cursor='pointer'; _setActive(hits[0].object.userData.title, true);
      try{ window.dispatchEvent(new CustomEvent('hwintel:hover',{detail:hits[0].object.userData.title})) }catch(err){} }
    else { cvs.style.cursor = dragging?'grabbing':'grab'; _setActive(null,false);
      try{ window.dispatchEvent(new CustomEvent('hwintel:hover',{detail:null})) }catch(err){} }
  });
  // 对外接口: 情报流渲染完成 → sync; 卡片事件 → setActive / focus
  window.__cgEarth = {
    sync(evs){
      const seen = {};
      (evs||[]).forEach(e=>{ seen[e.title]=1; if(!intelSprites[e.title]) _addIntelPoint(e.title, e.level); });
      for(const k in intelSprites){ if(!seen[k]){ group.remove(intelSprites[k].sp); delete intelSprites[k]; } }
    },
    clear(){ for(const k in intelSprites){ group.remove(intelSprites[k].sp); } for(const k in intelSprites) delete intelSprites[k]; },
    setActive: _setActive,
    focus(title){
      const rec = intelSprites[title];
      if(!rec) return;
      const ang = Math.atan2(rec.v.x, rec.v.z);
      window.__cgFocus = { target: group.rotation.y - ang, until: performance.now()+2200 };
    },
    // 事件点世界坐标 → ai-hq-grid 相对像素(供光束层实时追踪)
    project(title){
      const rec = intelSprites[title];
      if(!rec) return null;
      try{
        const w = new THREE.Vector3();
        rec.sp.getWorldPosition(w);
        const v = w.clone().project(camera);
        // v110.17: 地球=fixed全屏背景 → 直接返回**视口坐标**(光束层同步改 fixed)
        const r = holder.getBoundingClientRect();
        const rw = r.width||1, rh = r.height||1;
        return { x: r.left + (v.x*0.5+0.5)*rw,
                 y: r.top + (-v.y*0.5+0.5)*rh,
                 vis: v.z < 1 };
      }catch(err){ return null; }
    }
  };

  // ===== 流星 v107.18 =====
  function spawnMeteor(){
    const start = new THREE.Vector3((Math.random()-0.5)*16, 2.5+Math.random()*4.5, -5-Math.random()*5);
    const dir = new THREE.Vector3(-0.7-Math.random()*0.6, -0.32-Math.random()*0.25, 0.12*(Math.random()-0.5)).normalize();
    const len = 1.1+Math.random()*0.8;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6),3));
    const m = new THREE.LineBasicMaterial({ color:0xa8c8ff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
    const line = new THREE.Line(g, m);
    scene.add(line);
    const born = performance.now(), dur = 850+Math.random()*550, travel = 6.5+Math.random()*3;
    const fx = function(){
      const t = (performance.now()-born)/dur;
      if(t>=1){ scene.remove(line); g.dispose(); m.dispose(); fxSet.delete(fx); return; }
      const head = start.clone().addScaledVector(dir, t*travel);
      const tail = head.clone().addScaledVector(dir, -len*(1-0.35*t));
      const arr = line.geometry.attributes.position.array;
      arr[0]=head.x; arr[1]=head.y; arr[2]=head.z; arr[3]=tail.x; arr[4]=tail.y; arr[5]=tail.z;
      line.geometry.attributes.position.needsUpdate = true;
      m.opacity = Math.sin(t*Math.PI)*0.85;
    };
    fxSet.add(fx);
  }
  let nextMeteor = 6;

  // 渲染循环
  let raf = null, running = true;
  const clock = new THREE.Clock();
  function tick(){
    if(!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const tt = performance.now()/1000;
    if(!dragging){ vx += (0.0012 - vx)*0.02; }
    group.rotation.y += vx;
    scrollCur += (scrollShift-scrollCur)*0.06;
    group.rotation.y += (scrollCur - (renderer.__sc||0)) * 0.0045;
    renderer.__sc = scrollCur;
    tiltCur += (tiltTarget-tiltCur)*0.04; group.rotation.x = tiltCur;
    // v110.17: 指针横移视差 —— 地球与云层**同步位移**(云心必须永远绑地球, 防双球)
    _pxCur += ((window.__earthPx||0) - _pxCur)*0.05;
    /* v252(作者 2026-09-30): 右侧情报展开 → 球体左移让位 (不遮球面)
       _baseShift 由外部 __cgEarthShift 设定, 平滑过渡 */
    const _wantShift = (window.__cgEarthShift ? -0.62 : 0);
    /* ⚠️ 必须用 window.__baseShiftCur 读写 — 原写法 `if(typeof _baseShiftCur==='undefined')`
       会在首帧把 window.__baseShiftCur 重置为 0, 导致每帧只走一步 → 卡死在 16% */
    if (typeof window.__baseShiftCur !== 'number') window.__baseShiftCur = 0;
    window.__baseShiftCur += (_wantShift - window.__baseShiftCur) * 0.16;
    const _bs = Math.abs(window.__baseShiftCur) < 0.0015 ? 0 : window.__baseShiftCur;
    group.position.x = _baseX - _pxCur*_pxAmp + _bs;
    group.position.y += (_baseY - group.position.y) * 0.08;   /* v256d: 平滑跟随拟合的垂直对齐 */
    cloudRotor.position.copy(group.position);
    if(window.__cgHeatRingObj) window.__cgHeatRingObj.position.copy(group.position);  // v125.2: 活动环跟随地球位移(不跟随自转)
    /* v256(作者 2026-09-30): 向下滚动 → 球体随滚动放大; 滚回顶部 → 收回框内。
       基准 __cgBaseCamZ 由 _fitCam 给出, 故不会累积漂移。 */
    try{
      const _bz = window.__cgBaseCamZ || 2.30;
      /* v259(作者 2026-10-06): 加载页(品牌首屏 cg-brand-on)整体偏大 → 相机拉远,
         球体与小行星币同步等比缩小(相对比例不变)。放渲染循环而非 _fitCam,
         是为了"点击进入终端"时能平滑放大回原尺寸(两态都自然过渡)。 */
      const _tz = Math.max(1.05, _bz * (1 - 0.62 * scrollCur));
      camera.position.z += (_tz - camera.position.z) * 0.08;
      /* 小行星环用世界坐标半径基准(随 z 变化同步, 保证始终"包住"球体) */
      window.__cgWorldHalf = Math.tan(camera.fov * D2R * 0.5) * camera.position.z;
    }catch(e){}
    cloudRotor.rotation.y += 0.0009; // 云层独立漂移(可见大气流动, 不跟球)
    if(stars1) stars1.rotation.y += 0.000012;
    for(let i=0;i<starMats.length;i++) starMats[i].uniforms.uTime.value = tt;
    // v121: 数字地球扫描带/呼吸点阵需要时间
    if(earthMat.uniforms.uTime) earthMat.uniforms.uTime.value = tt;
    // v126: 区块晶格球(出块扫描) + 陆地六边形点阵(逐格出块脉冲)
    if(earthBodyMat.uniforms.uTime) earthBodyMat.uniforms.uTime.value = tt;
    if(hwLandDots && hwLandDots.material.uniforms.uTime) hwLandDots.material.uniforms.uTime.value = tt;
    /* v142: 领土层逐帧驱动(尺寸/壳高/涨跌色缓动 + 名牌同步) */
    /* 2026-10-06 作者(全权): 渲染循环防弹 — 逐帧驱动模块各自 try/catch。
       历史隐患: 原为裸调用, 任一模块(frame)抛错 → 中断整个 tick() → 地球/币盾全冻结(黑屏)。
       现: 单个模块出错只跳过它自己, 其余照常渲染, 整站绝不因一个模块挂掉。 */
    try{ window.__cgTerrFrame && window.__cgTerrFrame(dt, tt); }catch(e){ if(!tick.__terrErr){tick.__terrErr=1; try{console.warn('[hw] __cgTerrFrame',e);}catch(_){}} }
    /* v149: 六边形币种层逐帧驱动(悬浮浮空 + 名牌跟随) */
    try{ window.__cgHexFrame && window.__cgHexFrame(); }catch(e){ if(!tick.__hexErr){tick.__hexErr=1; try{console.warn('[hw] __cgHexFrame',e);}catch(_){}} }
    /* v256(作者 2026-09-30): 环绕小行星(主流币/平台币)逐帧驱动 */
    try{ window.__cgAsteroidFrame && window.__cgAsteroidFrame(dt, tt); }catch(e){ if(!tick.__astErr){tick.__astErr=1; try{console.warn('[hw] __cgAsteroidFrame',e);}catch(_){}} }
    // v121: 数字天幕星点/网格/星云呼吸
    if(window.__cgSkyMat && window.__cgSkyMat.uniforms.uTime) window.__cgSkyMat.uniforms.uTime.value = tt;
    /* v120.8: 流星停用(§4: 不要花哨装饰/无意义粒子) */

    if(window.__earthFx) window.__earthFx.forEach(fn=>fn(dt, tt));
    /* v142c: 自适应降质(见 onResize 旁说明) */
    _fqN++; _fqSum += dt;
    if(_fqN >= 45){
      const avg = _fqSum/_fqN; _fqN = 0; _fqSum = 0;
      const w = holder.clientWidth, h = holder.clientHeight;
      if(avg > 0.028 && _pxRatioCap > _pxMin){
        _pxRatioCap = Math.max(_pxMin, _pxRatioCap - 0.15);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, _pxRatioCap));
        if(w>=10) renderer.setSize(w, h);
      } else if(avg < 0.017 && _pxRatioCap < _pxMax){
        _pxRatioCap = Math.min(_pxMax, _pxRatioCap + 0.05);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, _pxRatioCap));
        if(w>=10) renderer.setSize(w, h);
      }
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  // 页面切走暂停 (v110.17: 地球=整页背景, 只在标签页隐藏时暂停省GPU)
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden && running){ running = false; cancelAnimationFrame(raf); }
    else if(!document.hidden && !running){ running = true; clock.getDelta(); raf = requestAnimationFrame(tick); }
  });
  // 尺寸自适应
  function onResize(){
    const w = holder.clientWidth, h = holder.clientHeight;
    if(w<10) return;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, _pxRatioCap));
    camera.aspect = w/h; camera.updateProjectionMatrix();
    _fitCam(true);   /* v257: 真实 resize 强制重拟合(即使滚动中) */
  }
  /* v142c(作者: 太卡了) —— 自适应降质:
     连续掉帧 → 逐档降像素比(0.75~1.3), 保住流体感;
     流畅了再慢慢涨回来。地球是整屏背景, 流畅 > 锐利。 */
  let _fqN = 0, _fqSum = 0;
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', ()=>setTimeout(onResize,220));
  /* v256b → v260 重写(2026-10-07 反馈加载页"一闪一闪"):
     原 10 个 setTimeout 在 26s 内反复 _fitCam(true) → 球体肉眼可见地多次变大/位移(闪烁主犯)。
     改为 ResizeObserver 盯英雄框高度: 数据到位 560→760 长高时只重拟合一次(300ms 防抖);
     尺寸无变化则永不触发。无 RO 支持的老浏览器退回原定时器。回滚: 搜 v260 注释还原。 */
  (function(){
    var _roOk=false;
    try{
      var _hero=document.querySelector('.ai-hq');
      if(window.ResizeObserver&&_hero){
        var _lastH=-1,_tm=null;
        new ResizeObserver(function(){
          var h=Math.round(_hero.getBoundingClientRect().height);
          if(h===_lastH)return; _lastH=h;
          clearTimeout(_tm); _tm=setTimeout(function(){ try{ onResize(); }catch(e){} },300);
        }).observe(_hero);
        _roOk=true;
      }
    }catch(e){}
    if(!_roOk){
      [400, 1000, 2500, 4500, 7000, 10000, 13000, 16000, 20000, 26000].forEach(ms=>setTimeout(()=>{ try{ onResize(); }catch(e){} }, ms));
    }
  })();
  // 背景就绪 → 淡入 (v261: 同时广播地球就绪, 骨架层不再靠轮询发现)
  setTimeout(()=>{ document.body.classList.remove('earth-loading'); try{ window.dispatchEvent(new CustomEvent('hw:earth-ready')); }catch(e){} }, 120);
  // v110.17: 调试/验证钩子(只读) —— 用于校验滚动视差与云球同步
  window.__cgEarthDbg = () => ({
    rotY: group.rotation.y, rotX: group.rotation.x,
    posX: group.position.x, cloudX: cloudRotor.position.x,
    cloudSync: Math.abs(group.position.x - cloudRotor.position.x) < 1e-6,
    scrollShift: scrollShift, tiltTarget: tiltTarget
  });
}


  // 自启动(等 DOM ready)
  function __boot(){
    try { if (document.getElementById('aiEarth')) initAIEarth(); } catch (e) { console.warn('[globe]', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __boot, { once: true });
  else __boot();
  window.__cryptoGlobe = { init: initAIEarth };
})();
