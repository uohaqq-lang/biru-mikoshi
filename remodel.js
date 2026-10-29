// 名所の作り直し（浅草寺の本堂・浅草神社の社殿）：PLATEAU の足元の形と高さに合わせて、見た目だけを実物の資料から組み立てる。
// 出すものは data/landmark_tex.js の名所と同じ形 { pos（x=東・y=北・z=高さ、m）, uv, plain: null, canvas（色見本の絵） }。
// 当たり判定・重さ・担ぎ手の数は、今までどおり PLATEAU の箱（LOD1）のまま。資料と寸法は 資料_本堂_浅草神社_雷門.md
(function () {
  'use strict';
  // ---------- 色見本：一色ずつ 8px のマスに塗った絵。面の uv はマスの真ん中を指す ----------
  // 字の入った扁額や提灯などの絵（imgs：{ 名前: { w, h, draw(ctx, w, h) } }）は、色のマスの下に並べ、四隅の uv（rectOf）で貼る
  const CELL = 8, COLS = 32, SHEET_W = COLS * CELL;
  const FONT = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
  function makePalette(cols, imgs) {
    imgs = imgs || {};
    const names = Object.keys(cols), rows = Math.ceil(names.length / COLS), y0 = Math.max(1, rows) * CELL;
    // 絵は左から詰め、はみ出したら次の段へ
    let x = 0, y = y0, rowH = 0; const at = {};
    for (const [n, im] of Object.entries(imgs)) {
      if (x + im.w > SHEET_W) { x = 0; y += rowH + 2; rowH = 0; }
      at[n] = [x, y]; x += im.w + 2; rowH = Math.max(rowH, im.h);
    }
    const cv = document.createElement('canvas'); cv.width = SHEET_W; cv.height = y + rowH + 2;
    const cx = cv.getContext('2d'), uvOf = {}, rectOf = {};
    names.forEach((n, i) => {
      const c = i % COLS, r = Math.floor(i / COLS);
      cx.fillStyle = cols[n]; cx.fillRect(c * CELL, r * CELL, CELL, CELL);
      uvOf[n] = [(c * CELL + CELL / 2) / cv.width, 1 - (r * CELL + CELL / 2) / cv.height];
    });
    for (const [n, im] of Object.entries(imgs)) {
      const [ix, iy] = at[n];
      cx.save(); cx.translate(ix, iy); cx.beginPath(); cx.rect(0, 0, im.w, im.h); cx.clip(); im.draw(cx, im.w, im.h); cx.restore();
      // 縁の1画素は内側に寄せる（隣の絵がにじまないように）
      rectOf[n] = [(ix + 0.5) / cv.width, 1 - (iy + im.h - 0.5) / cv.height, (ix + im.w - 0.5) / cv.width, 1 - (iy + 0.5) / cv.height];
    }
    return { canvas: cv, uvOf, rectOf };
  }
  // 縦書きの字を、枠いっぱいに並べる
  function vText(cx, s, x, y0, y1, size, color) {
    cx.fillStyle = color; cx.font = `bold ${size}px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const n = [...s].length, step = (y1 - y0) / n;
    [...s].forEach((ch, i) => cx.fillText(ch, x, y0 + step * (i + 0.5)));
  }

  // ---------- 組み立て：建物の座標（x=右、y=奥、z=上。正面は -y） ----------
  function Builder(pal) {
    const P = [], U = [], uvOf = pal.uvOf, rectOf = pal.rectOf || {};
    const B = {
      P, U,
      tri(a, b, c, col) { const uv = uvOf[col]; if (!uv) throw new Error('色が無い ' + col); P.push(...a, ...b, ...c); U.push(...uv, ...uv, ...uv); },
      quad(a, b, c, d, col) { B.tri(a, b, c, col); B.tri(a, c, d, col); },
      // 絵を貼る四角：a 左下・b 右下・c 右上・d 左上
      quadImg(a, b, c, d, img) {
        const [u0, v0, u1, v1] = rectOf[img];
        P.push(...a, ...b, ...c, ...a, ...c, ...d); U.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      },
      // 回転体に絵を貼る（提灯の胴）：u は角度（0＝+x、反時計回り）、v は下から上
      latheImg(x, y, z0, z1, rf, img, seg, rings) {
        const [u0, v0, u1, v1] = rectOf[img]; seg = seg || 16; rings = rings || 8;
        for (let j = 0; j < rings; j++) {
          const t0 = j / rings, t1 = (j + 1) / rings, za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1, ra = rf(t0), rb = rf(t1);
          for (let i = 0; i < seg; i++) {
            const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, ua = u0 + (u1 - u0) * i / seg, ub = u0 + (u1 - u0) * (i + 1) / seg, va = v0 + (v1 - v0) * t0, vb = v0 + (v1 - v0) * t1;
            const A = [x + Math.cos(a0) * ra, y + Math.sin(a0) * ra, za], Bp = [x + Math.cos(a1) * ra, y + Math.sin(a1) * ra, za], C = [x + Math.cos(a1) * rb, y + Math.sin(a1) * rb, zb], D = [x + Math.cos(a0) * rb, y + Math.sin(a0) * rb, zb];
            P.push(...A, ...Bp, ...C, ...A, ...C, ...D); U.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb);
          }
        }
      },
      // 正面（-y 向き）に立てた絵の板：真ん中 x、手前の面 y、下 z0、幅 w、高さ h、厚み t（縁の色 colEdge）
      plaque(x, y, z0, w, h, t, img, colEdge) {
        B.box(x - w / 2, x + w / 2, y, y + t, z0, z0 + h, colEdge);
        const yf = y - 0.01;
        B.quadImg([x - w / 2, yf, z0], [x + w / 2, yf, z0], [x + w / 2, yf, z0 + h], [x - w / 2, yf, z0 + h], img);
      },
      // 箱（下の面は付けない）
      box(x0, x1, y0, y1, z0, z1, col, colTop) {
        const p = (x, y, z) => [x, y, z];
        B.quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), col);
        B.quad(p(x1, y1, z0), p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), col);
        B.quad(p(x0, y1, z0), p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), col);
        B.quad(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1), col);
        B.quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), colTop || col);
      },
      // 真ん中と幅で書く箱
      boxC(x, y, z0, w, d, h, col, colTop) { B.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z0, z0 + h, col, colTop); },
      // 円柱（上下のふたは上だけ）
      cyl(x, y, z0, z1, r, col, seg) {
        seg = seg || 8;
        for (let i = 0; i < seg; i++) {
          const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
          const p0 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r];
          B.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], col);
          B.tri([x, y, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1], col);
        }
      },
      // 横に寝かせた円柱（提灯の胴など）：中心 (x,y,z)、軸は z（縦）。r(t) で太さを変えられる
      lathe(x, y, z0, z1, rf, col, seg, rings) {
        seg = seg || 12; rings = rings || 8;
        for (let j = 0; j < rings; j++) {
          const t0 = j / rings, t1 = (j + 1) / rings, za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1, ra = rf(t0), rb = rf(t1);
          for (let i = 0; i < seg; i++) {
            const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
            B.quad([x + Math.cos(a0) * ra, y + Math.sin(a0) * ra, za], [x + Math.cos(a1) * ra, y + Math.sin(a1) * ra, za],
                   [x + Math.cos(a1) * rb, y + Math.sin(a1) * rb, zb], [x + Math.cos(a0) * rb, y + Math.sin(a0) * rb, zb], typeof col === 'function' ? col(j, i) : col);
          }
        }
      },
      // 屋根（寄棟・入母屋・切妻）。軒の外まわり W×D（x×y）を高さ z に、棟を z+H に置く。
      //   type：'hip'（寄棟）・'irimoya'（入母屋：下は寄棟、g から上は切妻で妻の三角が立つ）・'gable'（切妻）
      //   ridge：寄棟の棟の長さ（x の向き）。入母屋は gw（妻の幅）。
      //   teri：反りの強さ（1で平ら。大きいほど軒が浅く、棟の近くが急）。sori：隅の軒の反り上がり（m）。
      //   thick：軒の厚み。soffit：軒裏をつなぐ壁の上端の内側の長方形 [w, d, z]（無ければ付けない）
      roof(o) {
        const cx = o.cx || 0, cy = o.cy || 0, W = o.W, D = o.D, z = o.z, H = o.H, teri = o.teri || 1.4, sori = o.sori || 0;
        const type = o.type || 'hip', g = type === 'gable' ? 0 : (o.g || 0.55);
        const gw = type === 'hip' ? (o.ridge != null ? o.ridge : Math.max(0, W - D)) : (o.gw != null ? o.gw : W * 0.62);
        const N = o.n || 10, M = o.m || 8;
        const hw = t => type === 'hip' ? W / 2 + (gw / 2 - W / 2) * t : (t < g ? W / 2 + (gw / 2 - W / 2) * (t / g) : gw / 2);
        const hd = t => D / 2 * (1 - t);
        const zt = t => z + H * Math.pow(t, teri);
        // 隅の反り上がり：軒（t=0）でいちばん大きく、上へ行くほど消える。辺のまん中では0、隅で sori
        const lift = (t, s) => sori * Math.pow(1 - t, 2) * Math.pow(Math.abs(2 * s - 1), 3);
        const col = o.col, colG = o.colGable || col;
        // 正面（-y）と背面（+y）
        for (const sg of [-1, 1]) {
          for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
            const pt = (ii, jj) => { const t = jj / M, s = ii / N, x = -hw(t) + 2 * hw(t) * s; return [cx + x, cy + sg * hd(t), zt(t) + lift(t, s)]; };
            const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
            sg < 0 ? B.quad(a, b, c, d, col) : B.quad(b, a, d, c, col);
          }
        }
        // 側面（±x）：寄棟の三角（入母屋は g まで）
        const tTop = type === 'hip' ? 1 : g;
        if (type !== 'gable') for (const sg of [-1, 1]) {
          const MM = Math.max(2, Math.round(M * tTop));
          for (let j = 0; j < MM; j++) for (let i = 0; i < N; i++) {
            const pt = (ii, jj) => { const t = jj / MM * tTop, s = ii / N, y = -hd(t) + 2 * hd(t) * s; return [cx + sg * hw(t), cy + y, zt(t) + lift(t, s)]; };
            const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
            sg > 0 ? B.quad(a, b, c, d, col) : B.quad(b, a, d, c, col);
          }
        }
        // 妻の三角（入母屋・切妻）
        if (type !== 'hip') for (const sg of [-1, 1]) {
          const x = cx + sg * hw(Math.max(g, 1e-6)) * (type === 'gable' ? 1 : 1), K = 8, pts = [];
          for (let k = 0; k <= K; k++) { const t = g + (1 - g) * k / K; pts.push([x, cy - hd(t), zt(t)]); }
          for (let k = K - 1; k >= 0; k--) { const t = g + (1 - g) * k / K; pts.push([x, cy + hd(t), zt(t)]); }
          const m = [x, cy, zt(g)];
          for (let k = 0; k < pts.length - 1; k++) B.tri(m, pts[k], pts[k + 1], colG);
          // 破風板：妻の縁に沿った帯
          if (o.colHafu) for (const sy of [-1, 1]) for (let k = 0; k < K; k++) {
            const t0 = g + (1 - g) * k / K, t1 = g + (1 - g) * (k + 1) / K, w = o.hafu || 0.5, xo = x + sg * 0.05;
            const a = [xo, cy + sy * hd(t0), zt(t0)], b = [xo, cy + sy * hd(t1), zt(t1)];
            B.quad(a, b, [xo, b[1], b[2] - w], [xo, a[1], a[2] - w], o.colHafu);
          }
          // 懸魚：妻の頂の下の飾り
          if (o.colGegyo) B.boxC(x + sg * 0.12, cy, zt(1) - (o.gegyo || 1.6), 0.15, (o.gegyo || 1.6) * 0.8, (o.gegyo || 1.6) * 0.9, o.colGegyo);
        }
        // 軒の厚み（軒先の帯）と軒裏
        const th = o.thick || 0.6, colE = o.colEave || col, colS = o.colSoffit || colE;
        const ring = []; const NR = N;
        const per = (sgy, sgx) => 0;
        // 軒先の輪：正面→右→背面→左
        for (let i = 0; i <= NR; i++) { const s = i / NR; ring.push([cx - W / 2 + W * s, cy - D / 2, z + lift(0, s)]); }
        for (let i = 1; i <= NR; i++) { const s = i / NR; ring.push([cx + W / 2, cy - D / 2 + D * s, z + lift(0, s)]); }
        for (let i = 1; i <= NR; i++) { const s = i / NR; ring.push([cx + W / 2 - W * s, cy + D / 2, z + lift(0, s)]); }
        for (let i = 1; i < NR; i++) { const s = i / NR; ring.push([cx - W / 2, cy + D / 2 - D * s, z + lift(0, s)]); }
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k], b = ring[(k + 1) % ring.length];
          B.quad([a[0], a[1], a[2] - th], [b[0], b[1], b[2] - th], b, a, colE);
        }
        if (o.soffit) {
          const [sw, sd, sz] = o.soffit;
          for (let k = 0; k < ring.length; k++) {
            const a = ring[k], b = ring[(k + 1) % ring.length];
            const inn = p => { const ux = (p[0] - cx) / (W / 2), uy = (p[1] - cy) / (D / 2); return [cx + ux * sw / 2, cy + uy * sd / 2, sz]; };
            B.quad(inn(a), inn(b), [b[0], b[1], b[2] - th], [a[0], a[1], a[2] - th], colS);
          }
        }
        // 棟
        if (o.colRidge) {
          const rl = type === 'hip' ? gw : gw + 0.6, rh = o.ridgeH || 1.0;
          B.boxC(cx, cy, zt(1) - 0.2, rl, o.ridgeW || 0.8, rh, o.colRidge);
          if (o.colOni) for (const sg of [-1, 1]) B.boxC(cx + sg * rl / 2, cy, zt(1) - 0.2, 0.5, (o.ridgeW || 0.8) * 1.6, rh * 1.9, o.colOni);
        }
        return { top: zt(1) + (o.ridgeH || 1.0) * 0.8, hw, hd, zt };
      },
    };
    return B;
  }

  // 建物の座標を町の座標へ：足元の中心 (cx, cy)、正面の向き（-y を南寄りに）
  function place(B, cx, cy, ang) {
    // ang：建物の +x（右）が町のどの向きか（ラジアン、東=0、北=π/2）
    const c = Math.cos(ang), s = Math.sin(ang), P = B.P, out = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1];
      out[i] = cx + x * c - y * s; out[i + 1] = cy + x * s + y * c; out[i + 2] = P[i + 2];
    }
    return out;
  }

  // 瓦の筋：屋根の正面・背面の斜面に、軒から棟へ細い帯を等間隔に立てる（r は roof() の戻り値）
  function tileRibs(B, r, o, step, col) {
    const W = o.W, cx = o.cx || 0, cy = o.cy || 0, M = 8, sori = o.sori || 0;
    const lift = (t, s) => sori * Math.pow(1 - t, 2) * Math.pow(Math.abs(2 * s - 1), 3);
    for (const sg of [-1, 1]) for (let x0 = -W / 2 + step / 2; x0 < W / 2; x0 += step) {
      for (let j = 0; j < M; j++) {
        const pt = (t, dx) => {
          const hw = r.hw(t), x = Math.max(-hw, Math.min(hw, x0 * (hw / (W / 2)))) + dx, s = (x + hw) / (2 * hw || 1);
          return [cx + x, cy + sg * r.hd(t), r.zt(t) + lift(t, s) + 0.07];
        };
        const t0 = j / M, t1 = (j + 1) / M, w = step * 0.22;
        B.quad(pt(t0, -w), pt(t0, w), pt(t1, w), pt(t1, -w), col);
      }
    }
  }

  // 人の形の像（風神・雷神・天龍・金龍）：台座の上に立つ。前は -y
  function statue(B, x, y, z, h, o) {
    const s = h / 2.2;
    B.boxC(x, y, z, 1.3 * s, 1.0 * s, 0.55 * s, o.rock || 'rock');
    const z0 = z + 0.55 * s;
    for (const sx of [-1, 1]) B.boxC(x + sx * 0.17 * s, y, z0, 0.2 * s, 0.24 * s, 0.75 * s, o.skin);   // 脚
    B.boxC(x, y, z0 + 0.7 * s, 0.62 * s, 0.4 * s, 0.35 * s, o.cloth);                                    // 腰布
    B.boxC(x, y, z0 + 1.0 * s, 0.56 * s, 0.34 * s, 0.6 * s, o.skin);                                     // 胴
    for (const sx of [-1, 1]) B.boxC(x + sx * 0.38 * s, y - 0.05 * s, z0 + 1.05 * s, 0.16 * s, 0.18 * s, 0.55 * s, o.skin);   // 腕
    B.boxC(x, y, z0 + 1.6 * s, 0.32 * s, 0.32 * s, 0.36 * s, o.skin);                                    // 頭
    B.boxC(x, y + 0.02, z0 + 1.93 * s, 0.22 * s, 0.22 * s, 0.14 * s, o.hair || o.skin);
    if (o.halo) { // 光背：頭の後ろの輪
      const R = 0.42 * s, cz = z0 + 1.78 * s, yy = y + 0.25 * s, n = 12;
      for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
        B.quad([x + Math.cos(a0) * R, yy, cz + Math.sin(a0) * R], [x + Math.cos(a1) * R, yy, cz + Math.sin(a1) * R], [x + Math.cos(a1) * R * 0.75, yy, cz + Math.sin(a1) * R * 0.75], [x + Math.cos(a0) * R * 0.75, yy, cz + Math.sin(a0) * R * 0.75], o.halo); }
    }
    if (o.arc) { // 風神の風袋・雷神の連太鼓：頭の上の弧
      const R = 0.75 * s, cz = z0 + 1.55 * s, yy = y + 0.3 * s, n = o.arcN || 9;
      for (let i = 0; i <= n; i++) { const a = Math.PI * (0.08 + 0.84 * i / n), px = x + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
        if (o.arcDrum) B.cyl(px, yy, pz - 0.12 * s, pz + 0.12 * s, 0.13 * s, o.arc, 6);
        else B.boxC(px, yy, pz - 0.1 * s, 0.24 * s, 0.24 * s, 0.24 * s, o.arc); }
    }
  }

  // ---------- 雷門（風雷神門）：切妻造・本瓦葺の八脚門。資料：浅草寺公式・Wikipedia・Commons の写真（資料_本堂_浅草神社_雷門.md） ----------
  // 寸法は今までの雷門（PLATEAU の LOD2）に合わせる：通り抜け 5.4m、両脇の塊 3.9×8.1m、天井 6.3m、頂 12.6m。
  // 正面（-y）から見て、右に風神・左に雷神。裏（+y）は右（東）に天龍・左（西）に金龍（裏から見ると左右が入れ替わる）。
  function buildRaimon() {
    const pal = makePalette({
      shu: '#b4291f', shuD: '#8a2219', shuL: '#c9452f', yami: '#1b1311', shikkui: '#ece6da', green: '#2e7458', greenL: '#4f9a78',
      stone: '#8b8780', stoneD: '#6e6a64', roof: '#5b6169', rib: '#6f767f', ridge: '#3b3f45', eave: '#474c53', hafu: '#3a3e44', gold: '#c9a246',
      kuro: '#1e1c1b', rock: '#4c4844', fuSkin: '#5d8a5e', raiSkin: '#b14a3a', cloth: '#8a6a3a', clothD: '#5a4632', bag: '#d8d2c0', drum: '#6b3a22',
      ryuT: '#d9cfb8', ryuK: '#c8a24a', hair: '#2a2420', white: '#f2eee6',
    }, {
      gaku: { w: 192, h: 72, draw(c, w, h) { c.fillStyle = '#23573f'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c9a246'; c.lineWidth = 5; c.strokeRect(4, 4, w - 8, h - 8);
        c.fillStyle = '#d9b44f'; c.font = `bold 46px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; ['山', '龍', '金'].forEach((ch, i) => c.fillText(ch, w * (0.2 + 0.3 * i), h / 2 + 2)); } },
    });
    const B = Builder(pal);
    const PX = 2.7, OX = 6.6, FY = 3.6, CEIL = 6.3;   // 通り抜けの縁・外の縁・前後の柱の列・天井
    // 基壇
    B.box(-OX - 0.5, OX + 0.5, -FY - 0.9, FY + 0.9, 0, 0.22, 'stoneD', 'stone');
    const Z0 = 0.22;
    // 柱：前後の列（x=±2.85, ±6.35）と、まん中の列の本柱
    const cols = [];
    for (const sx of [-1, 1]) for (const xx of [PX + 0.2, OX - 0.25]) { cols.push([sx * xx, -FY, 0.34]); cols.push([sx * xx, FY, 0.34]); cols.push([sx * xx, 0, xx < 4 ? 0.46 : 0.34]); }
    for (const [x, y, r] of cols) { B.boxC(x, y, Z0, r * 2.4, r * 2.4, 0.3, 'kuro'); B.cyl(x, y, Z0 + 0.3, 7.0, r, 'shu', 10); }
    // 両脇の部屋：外の壁・まん中の壁・通り抜け側の壁（外は朱、部屋の中は暗い）
    for (const sx of [-1, 1]) {
      const xa = sx * (PX + 0.2), xb = sx * (OX - 0.25), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      B.box(sx > 0 ? x1 - 0.25 : x0, sx > 0 ? x1 : x0 + 0.25, -FY, FY, Z0, 7.0, 'shu');         // 外の壁
      B.box(sx > 0 ? x0 : x1 - 0.25, sx > 0 ? x0 + 0.25 : x1, -FY, FY, Z0, CEIL + 0.5, 'shu');  // 通り抜け側の壁
      B.box(x0, x1, -0.15, 0.15, Z0, 7.0, 'shuD');                                               // まん中の壁
      for (const sy of [-1, 1]) {
        // 部屋の奥（まん中の壁の面）と床を暗く
        const yb = sy * 0.16, yf = sy * FY;
        B.quad([x0 + 0.25, yb, Z0], [x1 - 0.25, yb, Z0], [x1 - 0.25, yb, 5.2], [x0 + 0.25, yb, 5.2], 'yami');
        B.quad([x0 + 0.25, yf, Z0 + 0.01], [x1 - 0.25, yf, Z0 + 0.01], [x1 - 0.25, yb, Z0 + 0.01], [x0 + 0.25, yb, Z0 + 0.01], 'yami');
        for (const xw of [x0 + 0.26, x1 - 0.26]) B.quad([xw, yf, Z0], [xw, yb, Z0], [xw, yb, 5.2], [xw, yf, 5.2], 'yami');
        // 部屋の前：下は緑の連子の腰、上は緑の連子の欄間、間は金網（暗いまま）
        const xs0 = x0 + 0.3, xs1 = x1 - 0.3, yy = yf + sy * 0.02;
        B.box(xs0, xs1, yy - 0.1, yy + 0.1, Z0, 1.55, 'green');
        B.box(xs0, xs1, yy - 0.1, yy + 0.1, 4.55, 5.15, 'green');
        for (let xk = xs0 + 0.15; xk < xs1; xk += 0.3) { B.boxC(xk, yy - sy * 0.12, Z0 + 0.1, 0.07, 0.05, 1.35, 'greenL'); B.boxC(xk, yy - sy * 0.12, 4.6, 0.07, 0.05, 0.5, 'greenL'); }
        B.box(xs0, xs1, yy - 0.12, yy + 0.12, 1.55, 1.7, 'shu'); B.box(xs0, xs1, yy - 0.12, yy + 0.12, 4.4, 4.55, 'shu');
        // 像：正面（sy<0）は右に風神（x>0）・左に雷神。裏（sy>0）は東（x>0）に天龍・西に金龍
        const fx = (x0 + x1) / 2, fy = sy * 1.9;
        const front = sy < 0, right = sx > 0;
        const o = front ? (right ? { skin: 'fuSkin', cloth: 'cloth', hair: 'hair', arc: 'bag', arcN: 7 } : { skin: 'raiSkin', cloth: 'clothD', hair: 'hair', arc: 'drum', arcDrum: true, arcN: 8 })
                        : (right ? { skin: 'ryuT', cloth: 'gold', hair: 'kuro', halo: 'gold' } : { skin: 'ryuK', cloth: 'gold', hair: 'kuro', halo: 'gold' });
        // 像は通りの側（前なら -y）を向く。statue は -y が前なので、裏の像は y を裏返して作る
        const B0 = B.P.length;
        statue(B, fx, front ? fy : -fy, Z0, front ? 2.2 : 2.9, o);
        if (!front) for (let i = B0; i < B.P.length; i += 3) B.P[i + 1] = -B.P[i + 1];
      }
    }
    // 貫と頭貫（前・後・まん中の列）、通り抜けの天井の梁
    for (const y of [-FY, 0, FY]) {
      B.box(-OX, OX, y - 0.22, y + 0.22, 5.15, 5.45, 'shu');
      B.box(-OX - 0.2, OX + 0.2, y - 0.26, y + 0.26, CEIL, CEIL + 0.45, 'shu');
    }
    B.box(-PX, PX, -FY, FY, CEIL + 0.42, CEIL + 0.5, 'shuD');   // 通り抜けの天井
    for (const sx of [-1, 1]) B.box(sx * OX - 0.26, sx * OX + 0.26, -FY, FY, CEIL, CEIL + 0.45, 'shu');
    // 組物の段：白い漆喰の小壁と、柱の上の朱の組物
    const ZK0 = CEIL + 0.45, ZK1 = 7.75;
    for (const y of [-FY, FY]) B.box(-OX, OX, y - 0.12, y + 0.12, ZK0, ZK1, 'shikkui');
    for (const sx of [-1, 1]) B.box(sx * OX - 0.12, sx * OX + 0.12, -FY, FY, ZK0, ZK1, 'shikkui');
    for (const [x, y] of cols) if (y !== 0) {
      B.boxC(x, y, ZK0, 0.9, 0.9, 0.35, 'shu'); B.boxC(x, y, ZK0 + 0.35, 1.5, 0.7, 0.25, 'shu'); B.boxC(x, y, ZK0 + 0.6, 0.7, 0.7, 0.3, 'shu');
      B.boxC(x, y + Math.sign(y) * 0.5, ZK0 + 0.85, 0.5, 1.0, 0.3, 'shu');
    }
    for (const y of [-FY, FY]) { // 柱の間の蟇股（朱に緑の飾り）
      for (const xm of [0, -(PX + OX) / 2, (PX + OX) / 2]) { B.boxC(xm, y + Math.sign(y) * 0.14, ZK0 + 0.1, 1.4, 0.12, 0.55, 'shu'); B.boxC(xm, y + Math.sign(y) * 0.2, ZK0 + 0.2, 0.6, 0.06, 0.3, 'green'); }
    }
    B.box(-OX - 0.3, OX + 0.3, -FY - 0.3, FY + 0.3, ZK1, ZK1 + 0.25, 'shu');   // 桁
    // 扁額「金龍山」（正面・通り抜けの上）
    B.plaque(0, -FY - 0.32, CEIL + 0.05, 2.6, 0.95, 0.12, 'gaku', 'gold');
    // 軒の垂木：二段。朱の垂木に白い木口
    for (const sy of [-1, 1]) for (const [zz, dy, len] of [[ZK1 + 0.25, 0.55, 1.5], [ZK1 + 0.55, 1.2, 1.3]]) {
      for (let x = -OX - 0.6; x <= OX + 0.6; x += 0.42) {
        const y0 = sy * (FY + dy - len / 2), y1 = sy * (FY + dy + len / 2);
        B.box(x - 0.08, x + 0.08, Math.min(y0, y1), Math.max(y0, y1), zz, zz + 0.16, 'shu');
        B.box(x - 0.085, x + 0.085, sy > 0 ? y1 : y1 - 0.02, sy > 0 ? y1 + 0.02 : y1, zz, zz + 0.16, 'white');
      }
    }
    // 屋根：切妻（棟は x の向き）。頂は 12.6m（棟の上の鬼瓦）
    const ro = { W: 2 * OX + 3.4, D: 2 * FY + 4.6, z: 8.45, H: 2.95, type: 'gable', gw: 2 * OX + 3.4, teri: 1.55, sori: 0.35, n: 14, m: 9,
      col: 'roof', colGable: 'shu', colHafu: 'hafu', hafu: 0.55, colGegyo: 'gold', gegyo: 1.2, thick: 0.4, colEave: 'eave', colSoffit: 'shuD',
      soffit: [2 * OX + 0.6, 2 * FY + 0.6, ZK1 + 0.3], colRidge: 'ridge', ridgeH: 0.75, ridgeW: 0.75, colOni: 'ridge' };
    const r = B.roof(ro);
    tileRibs(B, r, ro, 0.5, 'rib');
    return { pos: B.P, uv: B.U, canvas: pal.canvas, top: r.top };
  }

  // 縁の手すり（朱）：長方形のまわり、gaps の x の範囲（正面）だけあける
  function railing(B, W, D, z, h, col, gapFront) {
    const post = 2.0;
    const side = (ax, ay, bx, by) => {
      const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / post));
      for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
        if (gapFront && ay === by && ay < 0 && Math.abs(x) < gapFront / 2) continue; B.boxC(x, y, z, 0.18, 0.18, h, col); }
      const seg = (x0, x1) => { if (ay === by) B.box(Math.min(x0, x1), Math.max(x0, x1), ay - 0.09, ay + 0.09, z + h - 0.16, z + h, col); };
      if (ay === by && gapFront && ay < 0) { seg(ax, -gapFront / 2); seg(gapFront / 2, bx); }
      else if (ay === by) seg(ax, bx);
      else B.box(ax - 0.09, ax + 0.09, Math.min(ay, by), Math.max(ay, by), z + h - 0.16, z + h, col);
    };
    side(-W / 2, -D / 2, W / 2, -D / 2); side(-W / 2, D / 2, W / 2, D / 2); side(-W / 2, -D / 2, -W / 2, D / 2); side(W / 2, -D / 2, W / 2, D / 2);
  }

  // ---------- 浅草寺の本堂：入母屋造（棟は東西）、和様三手先、間口34.5m・奥行32.7m・棟高29.4m（浅草寺公式）。
  // 足元の形（PLATEAU）は屋根の外まわり 48.9×47.4m と、正面の階段の出っ張り。写真（Commons：南から・南東から）で、
  // 高い基壇・白い石の欄干・朱の縁の手すり・朱の柱と白い漆喰・暗い扉・朱の妻と金の懸魚・いぶし銀の瓦・向拝の大提灯「志ん橋」・扁額「施無畏」を見た ----------
  function buildHondo() {
    const pal = makePalette({
      shu: '#b02a1e', shuD: '#7e2018', shikkui: '#efe9dc', kuro: '#2b211d', door: '#3a2c24', gold: '#cfa847', stone: '#c9c5bd', stoneD: '#9d9890',
      roof: '#8a8e93', rib: '#9da1a6', ridge: '#5a5e63', eave: '#6a6e73', win: '#1d1a19', white: '#f4f1ea', green: '#3d7a62', lant: '#c3271c',
    }, {
      gaku: { w: 256, h: 88, draw(c, w, h) { c.fillStyle = '#1c1714'; c.fillRect(0, 0, w, h); c.strokeStyle = '#cfa847'; c.lineWidth = 5; c.strokeRect(4, 4, w - 8, h - 8);
        c.fillStyle = '#e0bd5a'; c.font = `bold 60px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; ['畏', '無', '施'].forEach((ch, i) => c.fillText(ch, w * (0.2 + 0.3 * i), h / 2 + 3)); } },
      chochin: { w: 256, h: 160, draw(c, w, h) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#951a13'); g.addColorStop(0.5, '#cd2b1f'); g.addColorStop(1, '#951a13'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(60,10,8,.35)'; for (let y = 6; y < h; y += 9) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        vText(c, '志ん橋', w * 0.75, 12, h - 12, 44, '#15100e'); } },
    });
    const B = Builder(pal);
    const W = 48.9, D = 47.4;                // 屋根の外まわり
    const BW = 34.5, BD = 32.7, BY = 1.2;     // 堂の壁（少し奥へ）
    const PW = 41, PD = 39.5, PZ = 2.9;       // 基壇
    // 白い石の欄干（地面）
    const fw = PW + 2.4, fd = PD + 2.4, fy = BY;
    for (const [ax, ay, bx, by] of [[-fw / 2, fy - fd / 2, fw / 2, fy - fd / 2], [-fw / 2, fy + fd / 2, fw / 2, fy + fd / 2], [-fw / 2, fy - fd / 2, -fw / 2, fy + fd / 2], [fw / 2, fy - fd / 2, fw / 2, fy + fd / 2]]) {
      const L = Math.hypot(bx - ax, by - ay), n = Math.round(L / 1.6);
      for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; if (ay === by && ay < 0 && Math.abs(x) < 12) continue; B.boxC(x, y, 0, 0.28, 0.28, 0.95, 'white'); }
      if (ay === by && ay < 0) { B.box(ax, -12, ay - 0.1, ay + 0.1, 0.62, 0.8, 'white'); B.box(12, bx, ay - 0.1, ay + 0.1, 0.62, 0.8, 'white'); }
      else if (ay === by) B.box(ax, bx, ay - 0.1, ay + 0.1, 0.62, 0.8, 'white'); else B.box(ax - 0.1, ax + 0.1, ay, by, 0.62, 0.8, 'white');
    }
    // 基壇：朱の腰に黒い格子の窓、上の縁は白
    B.box(-PW / 2, PW / 2, BY - PD / 2, BY + PD / 2, 0, PZ - 0.15, 'shu', 'stoneD');
    B.box(-PW / 2 - 0.1, PW / 2 + 0.1, BY - PD / 2 - 0.1, BY + PD / 2 + 0.1, PZ - 0.15, PZ, 'white', 'stoneD');
    for (const sg of [-1, 1]) {
      for (let x = -PW / 2 + 2.5; x < PW / 2 - 2; x += 3.4) { if (sg < 0 && Math.abs(x) < 11) continue; B.box(x - 1.1, x + 1.1, BY + sg * PD / 2 - 0.02 * -sg - (sg < 0 ? 0.05 : 0), BY + sg * PD / 2 + (sg > 0 ? 0.05 : 0), 0.5, 2.2, 'win'); }
      for (let y = BY - PD / 2 + 2.5; y < BY + PD / 2 - 2; y += 3.4) B.box(sg * PW / 2 - 0.05, sg * PW / 2 + 0.05, y - 1.1, y + 1.1, 0.5, 2.2, 'win');
    }
    // 縁の朱の手すり（正面の階段の所はあける）
    railing(B, PW - 0.6, PD - 0.6, PZ, 1.0, 'shu', 15);
    // 正面の階段：地面から基壇の上へ（足元の出っ張りの所まで）
    const sy0 = -D / 2 - 5.2, sy1 = BY - PD / 2, SW = 20, NS = 13;
    for (let i = 0; i < NS; i++) { const y = sy0 + (sy1 - sy0) * i / NS; B.box(-SW / 2, SW / 2, y, sy1, PZ * i / NS, PZ * (i + 1) / NS, 'stoneD', 'stone'); }
    for (const sx of [-1, 1]) B.box(sx * SW / 2 - (sx > 0 ? 0 : 0.5), sx * SW / 2 + (sx > 0 ? 0.5 : 0), sy0, sy1, 0, PZ + 0.5, 'white');
    // 堂：柱（朱）、扉（暗い）、長押と上の漆喰
    const Z1 = PZ, ZN = 7.8, ZT = 10.7, by0 = BY - BD / 2, by1 = BY + BD / 2;
    const nx = 7, ny = 7, cols = [];
    for (let i = 0; i <= nx; i++) { const x = -BW / 2 + BW * i / nx; cols.push([x, by0], [x, by1]); }
    for (let j = 1; j < ny; j++) { const y = by0 + BD * j / ny; cols.push([-BW / 2, y], [BW / 2, y]); }
    B.box(-BW / 2, BW / 2, by0 + 0.4, by1 - 0.4, Z1, ZT, 'shu');                 // 堂の芯（壁）
    for (const sg of [-1, 1]) { // 扉と窓：前後
      for (let i = 0; i < nx; i++) { const x0 = -BW / 2 + BW * i / nx + 0.45, x1 = -BW / 2 + BW * (i + 1) / nx - 0.45, yy = sg < 0 ? by0 + 0.35 : by1 - 0.35;
        B.box(x0, x1, yy - 0.06, yy + 0.06, Z1 + 0.2, ZN - 0.35, (i === 0 || i === nx - 1) && sg < 0 ? 'green' : 'door');
        B.box(x0, x1, yy - 0.08, yy + 0.08, ZN - 0.35, ZN, 'shu'); }
    }
    for (const sg of [-1, 1]) for (let j = 0; j < ny; j++) { const y0 = by0 + BD * j / ny + 0.45, y1 = by0 + BD * (j + 1) / ny - 0.45, xx = sg * (BW / 2 - 0.35);
      B.box(xx - 0.06, xx + 0.06, y0, y1, Z1 + 0.2, ZN - 0.35, j % 2 ? 'door' : 'green'); }
    // 上の漆喰（長押から組物まで）：白い板を前後左右に
    for (const sg of [-1, 1]) { B.box(-BW / 2, BW / 2, (sg < 0 ? by0 : by1) + 0.3 * -sg - 0.05, (sg < 0 ? by0 : by1) + 0.3 * -sg + 0.05, ZN, ZT, 'shikkui');
      B.box(sg * (BW / 2 - 0.3) - 0.05, sg * (BW / 2 - 0.3) + 0.05, by0, by1, ZN, ZT, 'shikkui'); }
    for (const sg of [-1, 1]) for (const zz of [ZN - 0.1, (ZN + ZT) / 2]) { B.box(-BW / 2, BW / 2, (sg < 0 ? by0 : by1) - 0.25, (sg < 0 ? by0 : by1) + 0.25, zz, zz + 0.32, 'shu');
      B.box(sg * BW / 2 - 0.25, sg * BW / 2 + 0.25, by0, by1, zz, zz + 0.32, 'shu'); }
    for (const [x, y] of cols) { B.boxC(x, y, Z1, 1.2, 1.2, 0.35, 'kuro'); B.cyl(x, y, Z1 + 0.35, ZT, 0.42, 'shu', 10); }
    // 組物（三手先）：柱の上に、外へ三段に持ち出す朱の肘木と斗。間は白い漆喰
    for (const [x, y] of cols) {
      const ox = Math.abs(x) >= BW / 2 - 0.01 ? Math.sign(x) : 0, oy = Math.abs(y - by0) < 0.01 ? -1 : Math.abs(y - by1) < 0.01 ? 1 : 0;
      for (let k = 0; k < 3; k++) { const d = 0.55 * (k + 1), zz = ZT + k * 0.5;
        B.boxC(x + ox * d, y + oy * d, zz, 0.7, 0.7, 0.28, 'shu'); B.boxC(x + ox * d, y + oy * d, zz + 0.28, ox ? 0.5 : 1.6, oy ? 0.5 : 1.6, 0.22, 'shu'); }
    }
    B.box(-BW / 2 - 0.4, BW / 2 + 0.4, by0 - 0.4, by1 + 0.4, ZT, ZT + 1.5, 'shikkui');
    B.box(-BW / 2 - 2.2, BW / 2 + 2.2, by0 - 2.2, by1 + 2.2, ZT + 1.5, ZT + 1.85, 'shu');   // 丸桁
    // 扁額「施無畏」（正面の扉の上）
    B.plaque(0, by0 - 0.5, ZN + 0.4, 4.0, 1.35, 0.15, 'gaku', 'gold');
    // 向拝：正面のまん中に朱の柱4本と梁。大提灯「志ん橋」を下げる（高さ4.5m・幅3.5m）
    const VY = by0 - 5.0;
    for (const x of [-7.2, -2.6, 2.6, 7.2]) { B.boxC(x, VY, Z1, 1.0, 1.0, 0.3, 'kuro'); B.cyl(x, VY, Z1 + 0.3, ZT + 0.6, 0.38, 'shu', 10); B.box(x - 0.2, x + 0.2, VY, by0, ZT - 0.2, ZT + 0.4, 'shu'); }
    B.box(-7.6, 7.6, VY - 0.25, VY + 0.25, ZT - 0.5, ZT + 0.6, 'shu');
    B.box(-7.6, 7.6, VY - 0.3, by0, ZT + 0.6, ZT + 0.9, 'shuD');
    const LZ0 = ZT - 0.6 - 4.5, LR = 1.75, LYc = (VY + by0) / 2;
    B.latheImg(0, LYc, LZ0 + 0.3, LZ0 + 4.2, t => LR * (0.8 + 0.2 * Math.sin(Math.PI * t)), 'chochin', 20, 8);
    B.cyl(0, LYc, LZ0, LZ0 + 0.35, LR * 0.82, 'kuro', 16); B.cyl(0, LYc, LZ0 + 4.15, LZ0 + 4.5, LR * 0.8, 'kuro', 16);
    // 軒の垂木（二段、白い木口）
    for (const sg of [-1, 1]) for (const [zz, ext] of [[ZT + 1.85, 2.6], [ZT + 2.15, 4.4]]) {
      for (let x = -BW / 2 - ext; x <= BW / 2 + ext; x += 0.62) { const y0 = sg < 0 ? by0 - ext : by1, y1 = sg < 0 ? by0 : by1 + ext;
        B.box(x - 0.1, x + 0.1, y0, y1, zz, zz + 0.2, 'shu'); B.box(x - 0.105, x + 0.105, sg < 0 ? y0 - 0.02 : y1, sg < 0 ? y0 : y1 + 0.02, zz, zz + 0.2, 'white'); }
      for (let y = by0 - ext; y <= by1 + ext; y += 0.62) { const x0 = sg < 0 ? -BW / 2 - ext : BW / 2, x1 = sg < 0 ? -BW / 2 : BW / 2 + ext;
        B.box(x0, x1, y - 0.1, y + 0.1, zz, zz + 0.2, 'shu'); B.box(sg < 0 ? x0 - 0.02 : x1, sg < 0 ? x0 : x1 + 0.02, y - 0.105, y + 0.105, zz, zz + 0.2, 'white'); }
    }
    // 大屋根：入母屋。軒 13.3m、棟 29.4m（棟の上の面まで）。下は浅く、上は急（teri）。妻は東と西、朱に金の懸魚
    const ro = { cy: 0, W, D, z: 13.3, H: 15.0, type: 'irimoya', g: 0.42, gw: 30, teri: 2.3, sori: 0.9, n: 18, m: 12,
      col: 'roof', colGable: 'shu', colHafu: 'shuD', hafu: 0.8, colGegyo: 'gold', gegyo: 2.6, thick: 0.55, colEave: 'eave', colSoffit: 'shuD',
      soffit: [BW + 5, BD + 5, ZT + 1.9], colRidge: 'ridge', ridgeH: 1.1, ridgeW: 1.1, colOni: 'ridge' };
    const r = B.roof(ro);
    tileRibs(B, r, ro, 0.6, 'rib');
    return { pos: B.P, uv: B.U, canvas: pal.canvas, top: r.top };
  }
  // 町に置く：足元の形の正方形の中心と、右（東寄り）の向き。データ（asakusa.js の bldg_89e579d5…）の四隅から
  const HONDO = { id: 'bldg_89e579d5-6c3b-41ec-b0f4-8050d8f6e4ed', cx: 203.535, cy: 192.765, ang: Math.atan2(166.82 - 171.47, 225.63 - 176.92) };

  // 平らな斜面（流れ屋根・向拝の屋根）：x0〜x1 の幅で、(y0, z0) から (y1, z1) へ。筋を step おきに立て、低い側の縁に軒の帯
  function slope(B, x0, x1, y0, z0, y1, z1, col, rib, step, colEave, th) {
    const N = Math.max(2, Math.round((x1 - x0) / 1.5)), M = 4;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const p = (ii, jj) => [x0 + (x1 - x0) * ii / N, y0 + (y1 - y0) * jj / M, z0 + (z1 - z0) * jj / M];
      B.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), col);
    }
    if (rib) for (let x = x0 + step / 2; x < x1; x += step) { const w = step * 0.22;
      B.quad([x - w, y0, z0 + 0.06], [x + w, y0, z0 + 0.06], [x + w, y1, z1 + 0.06], [x - w, y1, z1 + 0.06], rib); }
    if (colEave) { const lo = z0 < z1 ? [y0, z0] : [y1, z1]; B.quad([x0, lo[0], lo[1] - th], [x1, lo[0], lo[1] - th], [x1, lo[0], lo[1]], [x0, lo[0], lo[1]], colEave); }
  }
  // 直前に足した頂点（start から）を、(cx, cy) のまわりに90°回す（棟を南北に向けたい屋根に）
  function rot90(B, start, cx, cy) {
    for (let i = start; i < B.P.length; i += 3) { const x = B.P[i] - cx, y = B.P[i + 1] - cy; B.P[i] = cx - y; B.P[i + 1] = cy + x; }
  }

  // ---------- 浅草神社の社殿：南から拝殿・幣殿・本殿（甲信寺社宝鑑・国指定文化財等DB・文化遺産オンライン）。
  // 拝殿：桁行七間・梁間三間、入母屋造、向拝三間、本瓦葺。幣殿：桁行三間・梁間一間、銅板葺。本殿：三間社流造、銅板葺。
  // 写真（Commons：拝殿の正面）で、黒っぽい瓦、朱の柱、軒下の緑と金の極彩色の彫刻、両脇の黒い格子、低い石段、緑の賽銭箱を見た。
  // 足元（PLATEAU）：拝殿の屋根 x -8.9〜9.8・y -13.7〜-2.9、向拝 x -4.9〜5.4・y -16.3〜-13.7、幣殿 x -4.2〜5.2・y -2.8〜5.2、本殿 x -5.2〜6.7・y 5.2〜16.5 ----------
  function buildJinja() {
    const pal = makePalette({
      shu: '#b8321f', shuD: '#82251a', kuro: '#231d1b', koshi: '#3a302b', gold: '#d6b04e', poly: '#2f8a6a', polyB: '#3563a3', polyR: '#c94a3a',
      /* 瓦は写真より暗めにする：社殿の前はゴールの光と境内の明かりで照らされ、写真の色のままだと藁ぶきのような明るい色に見えた */
      roof: '#2c2f35', rib: '#3a3e45', ridge: '#1f2125', eave: '#26292e', copper: '#4f8a74', copperRib: '#74b09a', copperE: '#3f7663',
      stone: '#bdb8af', stoneD: '#99948c', teal: '#2f8a86', white: '#efe9dc', wood: '#6b4a32',
    });
    const B = Builder(pal);
    // ---- 拝殿 ----
    const HX = 0.45, HY = -8.3, HW = 14.4, HD = 6.6, Z0 = 0.6, ZT = 3.4;
    B.box(HX - HW / 2 - 1.2, HX + HW / 2 + 1.2, HY - HD / 2 - 1.2, HY + HD / 2 + 1.0, 0, Z0, 'stoneD', 'stone');       // 基壇
    for (let i = 0; i < 3; i++) B.box(HX - 4.2, HX + 4.2, -16.2 + i * 0.75, HY - HD / 2 - 1.2, Z0 * i / 3, Z0 * (i + 1) / 3, 'stoneD', 'stone');   // 石段
    const x0 = HX - HW / 2, x1 = HX + HW / 2, y0 = HY - HD / 2, y1 = HY + HD / 2, bw = HW / 7;
    B.box(x0 + 0.3, x1 - 0.3, y0 + 0.5, y1 - 0.3, Z0, ZT, 'shuD');
    for (let i = 0; i < 7; i++) { const a = x0 + bw * i + 0.25, b = x0 + bw * (i + 1) - 0.25, open = i >= 2 && i <= 4;
      if (open) { B.box(a, b, y0 + 0.9, y0 + 1.0, Z0, ZT - 0.6, 'kuro'); continue; }   // まん中の三間はあいていて、奥は暗い
      B.box(a, b, y0 + 0.3, y0 + 0.42, Z0 + 0.1, ZT - 0.6, 'koshi');
      for (let xk = a + 0.2; xk < b; xk += 0.28) B.box(xk - 0.03, xk + 0.03, y0 + 0.25, y0 + 0.3, Z0 + 0.1, ZT - 0.6, 'kuro');
      for (let zk = Z0 + 0.3; zk < ZT - 0.6; zk += 0.28) B.box(a, b, y0 + 0.25, y0 + 0.3, zk - 0.03, zk + 0.03, 'kuro'); }
    for (const xx of [x0 + 0.3, x1 - 0.3]) B.box(xx - 0.1, xx + 0.1, y0, y1, Z0, ZT, 'koshi');
    B.box(x0, x1, y1 - 0.4, y1 - 0.2, Z0, ZT, 'shuD');
    for (let i = 0; i <= 7; i++) for (const y of [y0 + 0.3, y1 - 0.3]) B.cyl(x0 + bw * i, y, Z0, ZT + 0.3, 0.2, 'shu', 8);
    for (const y of [y0 + 0.3 + HD / 3, y1 - 0.3 - HD / 3]) for (const x of [x0, x1]) B.cyl(x, y, Z0, ZT + 0.3, 0.2, 'shu', 8);
    // 軒下の極彩色の彫刻（柱の間に、緑・青・赤と金）
    B.box(x0 - 0.1, x1 + 0.1, y0 + 0.1, y0 + 0.4, ZT - 0.6, ZT - 0.35, 'shu');
    for (let i = 0; i < 7; i++) { const cxm = x0 + bw * (i + 0.5);
      B.boxC(cxm, y0 + 0.18, ZT - 0.35, bw - 0.5, 0.12, 0.75, ['poly', 'polyB', 'poly', 'polyR', 'poly', 'polyB', 'poly'][i]);
      B.boxC(cxm, y0 + 0.1, ZT - 0.2, bw * 0.45, 0.08, 0.45, 'gold'); }
    B.box(x0 - 0.2, x1 + 0.2, y0, y1, ZT + 0.4, ZT + 0.7, 'shu');
    for (let i = 0; i <= 7; i++) for (const y of [y0 + 0.3, y1 - 0.3]) { B.boxC(x0 + bw * i, y, ZT + 0.3, 0.5, 0.5, 0.2, 'gold'); B.boxC(x0 + bw * i, y, ZT + 0.5, 0.9, 0.4, 0.25, 'shu'); }
    // 賽銭箱（緑）
    B.boxC(HX, y0 - 0.9, Z0, 3.2, 1.0, 1.0, 'teal');
    // 向拝：朱の柱4本と梁、低い流れの屋根
    for (const x of [-4.4, -1.4, 1.9, 4.9]) { B.cyl(x, -15.3, Z0 * 0.4, ZT + 0.2, 0.2, 'shu', 8); B.box(x - 0.12, x + 0.12, -15.3, y0, ZT - 0.2, ZT + 0.15, 'shu'); }
    B.box(-4.8, 5.3, -15.5, -15.1, ZT - 0.3, ZT + 0.2, 'shu');
    B.box(-4.8, 5.3, -15.55, -15.3, ZT - 0.75, ZT - 0.3, 'poly');
    slope(B, -5.4, 6.2, -16.35, ZT + 0.75, -12.6, ZT + 1.9, 'roof', 'rib', 0.42, 'eave', 0.25);
    // 拝殿の屋根：入母屋（棟は東西）。棟の高さ 10.7m（PLATEAU）
    const ro = { cx: 0.45, cy: -8.28, W: 18.8, D: 10.9, z: 4.4, H: 5.6, type: 'irimoya', g: 0.48, gw: 11.5, teri: 1.75, sori: 0.55, n: 12, m: 10,
      col: 'roof', colGable: 'koshi', colHafu: 'kuro', hafu: 0.35, colGegyo: 'gold', gegyo: 1.0, thick: 0.35, colEave: 'eave', colSoffit: 'shuD',
      soffit: [HW + 0.6, HD + 0.6, ZT + 0.65], colRidge: 'ridge', ridgeH: 0.6, ridgeW: 0.6, colOni: 'ridge' };
    const r = B.roof(ro); tileRibs(B, r, ro, 0.42, 'rib');
    // 東の渡廊
    B.box(6.6, 9.6, -2.6, 0.7, 0, 2.9, 'shuD'); B.box(6.3, 9.9, -2.9, 0.95, 2.9, 3.2, 'eave');
    // ---- 幣殿：拝殿と本殿をつなぐ。銅板葺の切妻（棟は南北） ----
    B.box(-2.8, 3.4, -4.8, 6.0, 0, 0.5, 'stoneD', 'stone');
    B.box(-2.4, 3.0, -4.8, 6.0, 0.5, 3.1, 'shu');
    for (let y = -4.2; y <= 5.6; y += 1.6) for (const x of [-2.4, 3.0]) B.cyl(x, y, 0.5, 3.3, 0.18, 'shu', 8);
    for (let y = -3.4; y <= 5.0; y += 1.6) for (const x of [-2.45, 3.05]) B.box(x - 0.06, x + 0.06, y, y + 0.9, 1.0, 2.6, 'koshi');
    let st = B.P.length;
    const rh = B.roof({ cx: 0.3, cy: 0.5, W: 11.2, D: 8.6, z: 3.4, H: 3.4, type: 'gable', gw: 11.2, teri: 1.4, sori: 0.2, n: 8, m: 6,
      col: 'copper', colGable: 'shu', colHafu: 'copperE', hafu: 0.3, colGegyo: 'gold', gegyo: 0.8, thick: 0.25, colEave: 'copperE', colRidge: 'copperE', ridgeH: 0.45, ridgeW: 0.5 });
    rot90(B, st, 0.3, 0.5);
    // ---- 本殿：三間社流造（棟は東西、正面＝南の屋根が長く流れる）。銅板葺 ----
    const NX = 0.74, NY = 11.2, NW = 8.4, ND = 5.4;
    B.box(NX - NW / 2 - 0.8, NX + NW / 2 + 0.8, NY - ND / 2 - 1.2, NY + ND / 2 + 0.8, 0, 0.9, 'stoneD', 'stone');
    B.box(NX - NW / 2, NX + NW / 2, NY - ND / 2, NY + ND / 2, 0.9, 4.0, 'shu');
    for (let i = 0; i < 3; i++) { const a = NX - NW / 2 + NW / 3 * i + 0.35, b = NX - NW / 2 + NW / 3 * (i + 1) - 0.35;
      B.box(a, b, NY - ND / 2 - 0.06, NY - ND / 2, 1.1, 3.4, 'kuro'); B.boxC((a + b) / 2, NY - ND / 2 - 0.08, 2.0, 0.5, 0.04, 0.5, 'gold'); }
    for (let i = 0; i <= 3; i++) for (const y of [NY - ND / 2, NY + ND / 2]) B.cyl(NX - NW / 2 + NW / 3 * i, y, 0.9, 4.2, 0.22, 'shu', 8);
    for (let i = 0; i <= 3; i++) B.cyl(NX - NW / 2 + NW / 3 * i, NY - ND / 2 - 2.6, 0.9, 3.6, 0.18, 'shu', 8);   // 庇の柱（流造の前の柱）
    B.box(NX - NW / 2 - 0.2, NX + NW / 2 + 0.2, NY - ND / 2 - 0.2, NY + ND / 2 + 0.2, 4.0, 4.35, 'gold');
    const RZ = 8.4, RY = NY + 0.4, xa = NX - NW / 2 - 1.6, xb = NX + NW / 2 + 1.6;
    slope(B, xa, xb, RY, RZ, 16.5, 5.6, 'copper', 'copperRib', 0.45, 'copperE', 0.25);       // 背面
    slope(B, xa, xb, 5.3, 3.8, RY, RZ, 'copper', 'copperRib', 0.45, 'copperE', 0.25);        // 正面（長い流れ）
    for (const x of [xa, xb]) B.quad([x, 5.3, 3.8], [x, 16.5, 5.6], [x, 16.5, 5.6], [x, RY, RZ], 'shu');
    for (const x of [xa + 0.4, xb - 0.4]) { B.tri([x, 5.6, 3.9], [x, 16.2, 5.6], [x, RY, RZ - 0.1], 'shu'); B.tri([x, NY - ND / 2, 4.3], [x, NY + ND / 2, 4.3], [x, RY, RZ - 0.4], 'white'); }
    B.box(xa - 0.2, xb + 0.2, RY - 0.35, RY + 0.35, RZ - 0.1, RZ + 0.45, 'copperE');
    for (const x of [xa, xb]) B.boxC(x, RY, RZ - 0.1, 0.4, 0.9, 0.9, 'gold');
    return { pos: B.P, uv: B.U, canvas: pal.canvas, top: r.top };
  }
  const JINJA = { id: 'bldg_7d109a41-5b34-4ad2-b40a-c82d56a8e8f1', cx: 265.2, cy: 231.0, ang: Math.atan2(214.26 - 215.19, 269.14 - 258.85) };

  function toLandmark(m, cx, cy, ang) {
    return { pos: place({ P: m.pos }, cx, cy, ang), uv: m.uv, plain: null, canvas: m.canvas };
  }
  const builds = {};
  builds[HONDO.id] = () => toLandmark(buildHondo(), HONDO.cx, HONDO.cy, HONDO.ang);
  builds[JINJA.id] = () => toLandmark(buildJinja(), JINJA.cx, JINJA.cy, JINJA.ang);

  window.MIKOSHI_REMODEL = { makePalette, Builder, place, vText, FONT, buildRaimon, builds };
})();
